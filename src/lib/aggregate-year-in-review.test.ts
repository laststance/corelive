import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import {
  aggregateYearInReview,
  parseForceDate,
  shouldAutoOpenYir,
  YIR_MIN_ACTIVE_DAYS,
} from './aggregate-year-in-review'
import { shiftIsoDate } from './shiftIsoDate'

/**
 * Helper: builds N consecutive UTC days of activity ending at `endIso`,
 * one completion per day under the supplied category. Lets us cross the
 * YIR_MIN_ACTIVE_DAYS threshold deterministically without writing 30+
 * fixture lines per test.
 */
function buildActivity(input: {
  endIso: string
  days: number
  category: { id: number; name: string; color: string }
}): Map<string, HeatmapDay> {
  const map = new Map<string, HeatmapDay>()
  for (let i = 0; i < input.days; i++) {
    const date = shiftIsoDate(input.endIso, -i)
    map.set(date, {
      date,
      count: 1,
      categories: [{ ...input.category, count: 1 }],
    })
  }
  return map
}

describe('aggregateYearInReview', () => {
  it('returns zeros and `eligible: false` on an empty heatmap', () => {
    const result = aggregateYearInReview(new Map(), '2026-12-15')
    expect(result).toMatchObject({
      totalCompleted: 0,
      activeDays: 0,
      longestStreak: 0,
      topCategories: [],
      year: 2026,
      eligible: false,
    })
  })

  it('counts distinct active days and total completions only for the anchor year', () => {
    const map = new Map<string, HeatmapDay>([
      // Same date but in 2025 — must NOT be counted in the 2026 review.
      [
        '2025-12-31',
        {
          date: '2025-12-31',
          count: 99,
          categories: [{ id: 1, name: 'old', color: 'blue', count: 99 }],
        },
      ],
      [
        '2026-01-01',
        {
          date: '2026-01-01',
          count: 3,
          categories: [{ id: 2, name: 'writing', color: 'green', count: 3 }],
        },
      ],
      [
        '2026-06-15',
        {
          date: '2026-06-15',
          count: 7,
          categories: [{ id: 2, name: 'writing', color: 'green', count: 7 }],
        },
      ],
    ])
    const result = aggregateYearInReview(map, '2026-12-15')
    expect(result.totalCompleted).toBe(10) // 3 + 7 (2025 excluded)
    expect(result.activeDays).toBe(2)
    expect(result.topCategories).toEqual([
      { id: 2, name: 'writing', color: 'green', count: 10 },
    ])
  })

  it('reports `eligible: true` once activeDays crosses YIR_MIN_ACTIVE_DAYS', () => {
    const activity = buildActivity({
      endIso: '2026-12-15',
      days: YIR_MIN_ACTIVE_DAYS,
      category: { id: 1, name: 'writing', color: 'blue' },
    })
    const result = aggregateYearInReview(activity, '2026-12-15')
    expect(result.activeDays).toBe(YIR_MIN_ACTIVE_DAYS)
    expect(result.eligible).toBe(true)
  })

  it('reports `eligible: false` when activeDays is below YIR_MIN_ACTIVE_DAYS', () => {
    const activity = buildActivity({
      endIso: '2026-12-15',
      days: YIR_MIN_ACTIVE_DAYS - 1,
      category: { id: 1, name: 'writing', color: 'blue' },
    })
    const result = aggregateYearInReview(activity, '2026-12-15')
    expect(result.eligible).toBe(false)
  })

  it('year-scopes the longest streak so a Dec→Jan run does NOT bleed into the YIR total', () => {
    // 20-day cross-boundary streak: 10 in 2025 (Dec 22 → Dec 31) +
    // 10 in 2026 (Jan 1 → Jan 10). The 2026 YIR should report the
    // 10-day longest, NOT the full 20-day calendar streak — the modal
    // recaps "your 2026", not "your longest ever".
    const map = new Map<string, HeatmapDay>()
    for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
      const dec = shiftIsoDate('2025-12-31', -dayOffset)
      map.set(dec, {
        date: dec,
        count: 1,
        categories: [{ id: 1, name: 'writing', color: 'blue', count: 1 }],
      })
      const jan = shiftIsoDate('2026-01-01', dayOffset)
      map.set(jan, {
        date: jan,
        count: 1,
        categories: [{ id: 1, name: 'writing', color: 'blue', count: 1 }],
      })
    }
    const result = aggregateYearInReview(map, '2026-12-15')
    expect(result.longestStreak).toBe(10)
  })

  it('caps topCategories at 3 and sorts by count desc, name asc', () => {
    const map = new Map<string, HeatmapDay>([
      [
        '2026-05-01',
        {
          date: '2026-05-01',
          count: 5,
          categories: [
            { id: 1, name: 'writing', color: 'blue', count: 2 },
            { id: 2, name: 'reading', color: 'green', count: 2 },
            { id: 3, name: 'exercise', color: 'rose', count: 4 },
            { id: 4, name: 'cooking', color: 'amber', count: 1 },
          ],
        },
      ],
    ])
    const result = aggregateYearInReview(map, '2026-12-15')
    expect(result.topCategories).toHaveLength(3)
    expect(result.topCategories.map((c) => c.name)).toEqual([
      'exercise', // 4 — highest
      'reading', // 2 — tied with writing; alphabetical wins
      'writing', // 2
    ])
  })
})

describe('shouldAutoOpenYir', () => {
  it('opens in December when summary is eligible', () => {
    const eligibleSummary = {
      totalCompleted: 100,
      activeDays: YIR_MIN_ACTIVE_DAYS,
      longestStreak: 7,
      topCategories: [],
      year: 2026,
      eligible: true,
    }
    expect(shouldAutoOpenYir('2026-12-15', eligibleSummary)).toBe(true)
  })

  it('does NOT open outside December even if eligible', () => {
    const eligibleSummary = {
      totalCompleted: 100,
      activeDays: YIR_MIN_ACTIVE_DAYS,
      longestStreak: 7,
      topCategories: [],
      year: 2026,
      eligible: true,
    }
    expect(shouldAutoOpenYir('2026-11-30', eligibleSummary)).toBe(false)
    expect(shouldAutoOpenYir('2026-05-12', eligibleSummary)).toBe(false)
  })

  it('does NOT open in December when summary is ineligible (<30 days)', () => {
    const ineligibleSummary = {
      totalCompleted: 5,
      activeDays: 5,
      longestStreak: 2,
      topCategories: [],
      year: 2026,
      eligible: false,
    }
    expect(shouldAutoOpenYir('2026-12-15', ineligibleSummary)).toBe(false)
  })
})

describe('shouldAutoOpenYir (with fake timers — guards against real-clock leaks)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('honors the timer-frozen "today" instead of wall clock', () => {
    // Freeze clock to mid-May so a stray `new Date()` inside the gate
    // would incorrectly evaluate to false. The gate must derive its
    // decision from the supplied `today` ONLY.
    vi.setSystemTime(new Date('2026-05-12T08:00:00.000Z'))
    const eligible = {
      totalCompleted: 100,
      activeDays: YIR_MIN_ACTIVE_DAYS,
      longestStreak: 7,
      topCategories: [],
      year: 2026,
      eligible: true,
    }
    // Pass an explicit December date — even though wall clock says May,
    // the gate should respect the argument and return true.
    expect(shouldAutoOpenYir('2026-12-15', eligible)).toBe(true)
  })
})

describe('parseForceDate', () => {
  it('returns null for null / empty / malformed input', () => {
    expect(parseForceDate(null)).toBeNull()
    expect(parseForceDate('')).toBeNull()
    expect(parseForceDate('2026/12/31')).toBeNull()
    expect(parseForceDate('not-a-date')).toBeNull()
    expect(parseForceDate('2026-13-01')).toBeNull()
  })

  it('rejects day-rollover inputs that JS Date silently normalizes', () => {
    // `new Date('2026-02-30T00:00:00.000Z')` → `2026-03-02`. The regex
    // passes and `getTime()` is valid, so without a round-trip check the
    // URL surface said one date and the modal rendered a different one.
    expect(parseForceDate('2026-02-30')).toBeNull()
    expect(parseForceDate('2026-04-31')).toBeNull()
    // Year-crossing rollover — most dangerous because year inference
    // diverges from URL surface.
    expect(parseForceDate('2025-12-32')).toBeNull()
  })

  it('returns the validated YYYY-MM-DD local-day key for a real calendar date', () => {
    expect(parseForceDate('2026-12-31')).toBe('2026-12-31')
    expect(parseForceDate('2026-01-01')).toBe('2026-01-01')
  })
})

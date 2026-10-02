import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

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
  test('returns zeros and `eligible: false` on an empty heatmap', () => {
    const result = aggregateYearInReview(new Map(), '2026-12-15')
    expect(result).toMatchObject({
      totalCompleted: 0,
      activeDays: 0,
      topCategories: [],
      year: 2026,
      eligible: false,
    })
  })

  test('counts distinct active days and total completions only for the anchor year', () => {
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

  test('reports `eligible: true` once activeDays crosses YIR_MIN_ACTIVE_DAYS', () => {
    const activity = buildActivity({
      endIso: '2026-12-15',
      days: YIR_MIN_ACTIVE_DAYS,
      category: { id: 1, name: 'writing', color: 'blue' },
    })
    const result = aggregateYearInReview(activity, '2026-12-15')
    expect(result.activeDays).toBe(YIR_MIN_ACTIVE_DAYS)
    expect(result.eligible).toBe(true)
  })

  test('reports `eligible: false` when activeDays is below YIR_MIN_ACTIVE_DAYS', () => {
    const activity = buildActivity({
      endIso: '2026-12-15',
      days: YIR_MIN_ACTIVE_DAYS - 1,
      category: { id: 1, name: 'writing', color: 'blue' },
    })
    const result = aggregateYearInReview(activity, '2026-12-15')
    expect(result.eligible).toBe(false)
  })

  test('keeps prior-year activity out of the current year review', () => {
    // Arrange: ten days belong to each side of the year boundary.
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
    expect(result.activeDays).toBe(10)
    expect(result.totalCompleted).toBe(10)
  })

  test('caps topCategories at 3 and sorts by count desc, name asc', () => {
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
  test('opens in December when summary is eligible', () => {
    const eligibleSummary = {
      totalCompleted: 100,
      activeDays: YIR_MIN_ACTIVE_DAYS,
      topCategories: [],
      year: 2026,
      eligible: true,
    }
    expect(shouldAutoOpenYir('2026-12-15', eligibleSummary)).toBe(true)
  })

  test('does NOT open outside December even if eligible', () => {
    const eligibleSummary = {
      totalCompleted: 100,
      activeDays: YIR_MIN_ACTIVE_DAYS,
      topCategories: [],
      year: 2026,
      eligible: true,
    }
    expect(shouldAutoOpenYir('2026-11-30', eligibleSummary)).toBe(false)
    expect(shouldAutoOpenYir('2026-05-12', eligibleSummary)).toBe(false)
  })

  test('does NOT open in December when summary is ineligible (<30 days)', () => {
    const ineligibleSummary = {
      totalCompleted: 5,
      activeDays: 5,
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

  test('honors the timer-frozen "today" instead of wall clock', () => {
    // Freeze clock to mid-May so a stray `new Date()` inside the gate
    // would incorrectly evaluate to false. The gate must derive its
    // decision from the supplied `today` ONLY.
    vi.setSystemTime(new Date('2026-05-12T08:00:00.000Z'))
    const eligible = {
      totalCompleted: 100,
      activeDays: YIR_MIN_ACTIVE_DAYS,
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
  test('returns null for null / empty / malformed input', () => {
    expect(parseForceDate(null)).toBeNull()
    expect(parseForceDate('')).toBeNull()
    expect(parseForceDate('2026/12/31')).toBeNull()
    expect(parseForceDate('not-a-date')).toBeNull()
    expect(parseForceDate('2026-13-01')).toBeNull()
  })

  test('rejects day-rollover inputs that JS Date silently normalizes', () => {
    // `new Date('2026-02-30T00:00:00.000Z')` → `2026-03-02`. The regex
    // passes and `getTime()` is valid, so without a round-trip check the
    // URL surface said one date and the modal rendered a different one.
    expect(parseForceDate('2026-02-30')).toBeNull()
    expect(parseForceDate('2026-04-31')).toBeNull()
    // Year-crossing rollover — most dangerous because year inference
    // diverges from URL surface.
    expect(parseForceDate('2025-12-32')).toBeNull()
  })

  test('returns the validated YYYY-MM-DD local-day key for a real calendar date', () => {
    expect(parseForceDate('2026-12-31')).toBe('2026-12-31')
    expect(parseForceDate('2026-01-01')).toBe('2026-01-01')
  })
})

test('annual parent totals include only that year and preserve the overall seven entries', () => {
  // Arrange
  const work = { id: 1, name: 'Work', color: 'blue' }
  const data = new Map<string, HeatmapDay>([
    [
      '2026-05-11',
      {
        date: '2026-05-11',
        count: 7,
        categories: [
          { ...work, count: 1, parent: null },
          { id: 2, name: 'CoreLive', color: 'blue', count: 3, parent: work },
          {
            id: 3,
            name: 'Client work',
            color: 'green',
            count: 2,
            parent: work,
          },
          { id: 4, name: 'General', color: 'amber', count: 1, parent: null },
        ],
      },
    ],
    [
      '2025-12-31',
      {
        date: '2025-12-31',
        count: 9,
        categories: [
          { id: 2, name: 'CoreLive', color: 'blue', count: 9, parent: work },
        ],
      },
    ],
  ])
  // Act
  const review = aggregateYearInReview(data, '2026-12-31')
  // Assert
  expect(review.totalCompleted).toBe(7)
  expect(review.activeDays).toBe(1)
  expect(
    review.topCategories.map(({ name, count }) => ({ name, count })),
  ).toEqual([
    { name: 'Work', count: 6 },
    { name: 'General', count: 1 },
  ])
  expect(review.topCategories[0]?.directCount).toBe(1)
})

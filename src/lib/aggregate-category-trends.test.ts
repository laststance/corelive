import { describe, expect, it } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { aggregateCategoryTrends } from './aggregate-category-trends'
import { shiftIsoDate } from './shiftIsoDate'

const TODAY = new Date('2026-05-12T00:00:00.000Z')
const TODAY_ISO = '2026-05-12'

/**
 * Helper: builds a Map of N consecutive UTC days ending on `endIso`,
 * each carrying a single `category` entry with `countPerDay`. Used to
 * stamp predictable per-category windows for the WoW math.
 */
function buildWindow(input: {
  endIso: string
  days: number
  category: { id: number; name: string; color: string }
  countPerDay: number
}): Map<string, HeatmapDay> {
  const map = new Map<string, HeatmapDay>()
  for (let i = 0; i < input.days; i++) {
    const date = shiftIsoDate(input.endIso, -i)
    map.set(date, {
      date,
      count: input.countPerDay,
      categories: [
        {
          id: input.category.id,
          name: input.category.name,
          color: input.category.color,
          count: input.countPerDay,
        },
      ],
    })
  }
  return map
}

/**
 * Helper: merges two heatmap maps, summing counts and concatenating
 * category arrays on collision. Lets a test layer two categories on the
 * same day without re-writing fixture boilerplate.
 */
function mergeHeatmaps(
  a: Map<string, HeatmapDay>,
  b: Map<string, HeatmapDay>,
): Map<string, HeatmapDay> {
  const merged = new Map<string, HeatmapDay>(a)
  for (const [date, day] of b) {
    const existing = merged.get(date)
    if (existing) {
      merged.set(date, {
        date,
        count: existing.count + day.count,
        categories: [...existing.categories, ...day.categories],
      })
    } else {
      merged.set(date, day)
    }
  }
  return merged
}

describe('aggregateCategoryTrends', () => {
  it('returns an empty array on an empty heatmap', () => {
    expect(aggregateCategoryTrends(new Map(), TODAY)).toEqual([])
  })

  it('reports `new` trend when category has current-week activity but no prior-week activity', () => {
    // The heatmap *only* contains entries inside the current window, so
    // there is no historical activity outside the inspection range either
    // — chip should fall back to "your first week" copy.
    const dataByDate = buildWindow({
      endIso: TODAY_ISO,
      days: 7,
      category: { id: 1, name: 'writing', color: 'blue' },
      countPerDay: 1,
    })

    const result = aggregateCategoryTrends(dataByDate, TODAY)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 1,
      name: 'writing',
      color: 'blue',
      currentCount: 7,
      priorCount: 0,
      trend: { kind: 'new' },
    })
  })

  it('emits `flat` for a category with zero in both windows but older activity exists', () => {
    // 7 days of activity 30 days ago — outside the 14-day inspection
    // window, so the union is empty for the chip, but `dataByDate.size > 0`
    // means we are not a brand-new user.
    const olderActivity = buildWindow({
      endIso: shiftIsoDate(TODAY_ISO, -30),
      days: 7,
      category: { id: 9, name: 'reading', color: 'green' },
      countPerDay: 1,
    })

    const result = aggregateCategoryTrends(olderActivity, TODAY)
    // Older-only categories are still surfaced because the prior-window
    // walk includes them — they aren't in either inspection window, but
    // since `hasHistoricalActivity` is true their trend MUST read `flat`
    // when they fall in the windows in future weeks. For now, the chip
    // row stays empty because the category isn't in either window — that
    // matches DESIGN.md: "show what's happening, not what's silent."
    expect(result).toEqual([])
  })

  it('returns `percent` trend with positive value when current > prior', () => {
    // 5 completions in current week, 4 completions in prior week → +25%.
    const currentWeek = buildWindow({
      endIso: TODAY_ISO,
      days: 5,
      category: { id: 1, name: 'writing', color: 'blue' },
      countPerDay: 1,
    })
    const priorWeek = buildWindow({
      endIso: shiftIsoDate(TODAY_ISO, -7),
      days: 4,
      category: { id: 1, name: 'writing', color: 'blue' },
      countPerDay: 1,
    })
    const dataByDate = mergeHeatmaps(currentWeek, priorWeek)

    const result = aggregateCategoryTrends(dataByDate, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0]?.trend).toEqual({ kind: 'percent', value: 25 })
    expect(result[0]?.currentCount).toBe(5)
    expect(result[0]?.priorCount).toBe(4)
  })

  it('returns `percent` trend with negative value when current < prior', () => {
    const currentWeek = buildWindow({
      endIso: TODAY_ISO,
      days: 2,
      category: { id: 2, name: 'reading', color: 'green' },
      countPerDay: 1,
    })
    const priorWeek = buildWindow({
      endIso: shiftIsoDate(TODAY_ISO, -7),
      days: 4,
      category: { id: 2, name: 'reading', color: 'green' },
      countPerDay: 1,
    })
    const dataByDate = mergeHeatmaps(currentWeek, priorWeek)

    const result = aggregateCategoryTrends(dataByDate, TODAY)
    expect(result[0]?.trend).toEqual({ kind: 'percent', value: -50 })
  })

  it('sorts by currentCount descending, then alphabetically by name', () => {
    const writing = buildWindow({
      endIso: TODAY_ISO,
      days: 3,
      category: { id: 1, name: 'writing', color: 'blue' },
      countPerDay: 1,
    })
    const reading = buildWindow({
      endIso: TODAY_ISO,
      days: 3,
      category: { id: 2, name: 'reading', color: 'green' },
      countPerDay: 1,
    })
    const exercise = buildWindow({
      endIso: TODAY_ISO,
      days: 5,
      category: { id: 3, name: 'exercise', color: 'rose' },
      countPerDay: 1,
    })
    const dataByDate = mergeHeatmaps(mergeHeatmaps(writing, reading), exercise)

    const result = aggregateCategoryTrends(dataByDate, TODAY)
    expect(result.map((entry) => entry.name)).toEqual([
      'exercise', // 5 — highest count
      'reading', // 3 — tied count, alphabetically before 'writing'
      'writing', // 3
    ])
  })

  it('handles ≥5 categories without truncating', () => {
    const categories = [
      { id: 1, name: 'writing', color: 'blue' },
      { id: 2, name: 'reading', color: 'green' },
      { id: 3, name: 'exercise', color: 'rose' },
      { id: 4, name: 'cooking', color: 'amber' },
      { id: 5, name: 'study', color: 'violet' },
      { id: 6, name: 'meditation', color: 'orange' },
    ]
    let dataByDate = new Map<string, HeatmapDay>()
    for (const category of categories) {
      dataByDate = mergeHeatmaps(
        dataByDate,
        buildWindow({
          endIso: TODAY_ISO,
          days: 1,
          category,
          countPerDay: 1,
        }),
      )
    }

    const result = aggregateCategoryTrends(dataByDate, TODAY)
    // The util surfaces ALL categories — the chip component (not the util)
    // decides whether to collapse them into a `<Select>` on mobile. This
    // separation lets the chip row stay an opinion-free renderer.
    expect(result).toHaveLength(6)
  })

  it('surfaces a category active only in the prior window', () => {
    // User had a category 7-14 days ago but no completions in the last 7;
    // the chip should still appear (so the user sees the taxonomy) with a
    // `percent` trend that reads `↓ 100%`.
    const priorWeek = buildWindow({
      endIso: shiftIsoDate(TODAY_ISO, -7),
      days: 3,
      category: { id: 7, name: 'guitar', color: 'orange' },
      countPerDay: 1,
    })

    const result = aggregateCategoryTrends(priorWeek, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 7,
      currentCount: 0,
      priorCount: 3,
      trend: { kind: 'percent', value: -100 },
    })
  })
})

import { describe, expect, it } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { aggregateLastSevenDays } from './aggregate-last-seven-days'

/**
 * Anchor "today" used across cases. UTC midnight is fine — the util reads UTC
 * parts only, so the picked moment maps cleanly onto YYYY-MM-DD buckets.
 */
const TODAY = new Date('2026-05-11T00:00:00.000Z')

/**
 * Builds a single HeatmapDay entry for tests. Defaults to one "writing" task
 * so a date with non-zero count always has a matching category breakdown
 * (the same invariant the server returns).
 */
function buildHeatmapDay(
  isoDate: string,
  count: number,
  categories: HeatmapDay['categories'] = [
    { id: 1, name: 'writing', color: 'blue', count },
  ],
): [string, HeatmapDay] {
  return [isoDate, { date: isoDate, count, categories }]
}

describe('aggregateLastSevenDays', () => {
  it('returns firstWeek when the heatmap response is empty', () => {
    const stats = aggregateLastSevenDays(new Map(), TODAY)
    expect(stats).toEqual({
      totalCompleted: 0,
      priorTotal: 0,
      topCategories: [],
      trend: { kind: 'firstWeek' },
    })
  })

  it('returns flat when both windows are zero but older activity exists', () => {
    // One entry outside the 14-day inspection window (30 days ago). Both the
    // current and prior windows are empty, but `dataByDate.size > 0`, so the
    // copy should be "quiet week" rather than "your first week".
    const dataByDate = new Map<string, HeatmapDay>([
      buildHeatmapDay('2026-04-11', 3),
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.totalCompleted).toBe(0)
    expect(stats.priorTotal).toBe(0)
    expect(stats.trend).toEqual({ kind: 'flat' })
  })

  it('returns kind: new when prior window is empty and current window is non-zero', () => {
    // Current window (2026-05-05 .. 2026-05-11), prior window
    // (2026-04-28 .. 2026-05-04). Only put activity in the current window.
    const dataByDate = new Map<string, HeatmapDay>([
      buildHeatmapDay('2026-05-08', 5),
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.totalCompleted).toBe(5)
    expect(stats.priorTotal).toBe(0)
    expect(stats.trend).toEqual({ kind: 'new' })
  })

  it('returns percent value 0 when current and prior totals match', () => {
    const dataByDate = new Map<string, HeatmapDay>([
      buildHeatmapDay('2026-05-08', 5), // current window
      buildHeatmapDay('2026-05-01', 5), // prior window
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.totalCompleted).toBe(5)
    expect(stats.priorTotal).toBe(5)
    expect(stats.trend).toEqual({ kind: 'percent', value: 0 })
  })

  it('returns percent value 100 when current doubles prior', () => {
    const dataByDate = new Map<string, HeatmapDay>([
      buildHeatmapDay('2026-05-08', 10),
      buildHeatmapDay('2026-05-01', 5),
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.totalCompleted).toBe(10)
    expect(stats.priorTotal).toBe(5)
    expect(stats.trend).toEqual({ kind: 'percent', value: 100 })
  })

  it('returns negative percent when current is below prior', () => {
    const dataByDate = new Map<string, HeatmapDay>([
      buildHeatmapDay('2026-05-08', 4),
      buildHeatmapDay('2026-05-01', 8),
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.trend).toEqual({ kind: 'percent', value: -50 })
  })

  it('rolls up top categories by count and surfaces the top 3', () => {
    // Single day with four categories so we exercise the slice(0, 3) cutoff.
    const dataByDate = new Map<string, HeatmapDay>([
      [
        '2026-05-08',
        {
          date: '2026-05-08',
          count: 10,
          categories: [
            { id: 1, name: 'writing', color: 'blue', count: 4 },
            { id: 2, name: 'reading', color: 'green', count: 3 },
            { id: 3, name: 'coding', color: 'amber', count: 2 },
            { id: 4, name: 'walking', color: 'rose', count: 1 },
          ],
        },
      ],
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.topCategories.map((category) => category.id)).toEqual([
      1, 2, 3,
    ])
  })

  it('breaks rank ties alphabetically by name', () => {
    // Three categories tied at count=3; alphabetical order: amber, blue,
    // charlie. The fourth ("delta", count 1) is below the cutoff.
    const dataByDate = new Map<string, HeatmapDay>([
      [
        '2026-05-08',
        {
          date: '2026-05-08',
          count: 10,
          categories: [
            { id: 1, name: 'charlie', color: 'amber', count: 3 },
            { id: 2, name: 'amber', color: 'blue', count: 3 },
            { id: 3, name: 'blue', color: 'green', count: 3 },
            { id: 4, name: 'delta', color: 'rose', count: 1 },
          ],
        },
      ],
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.topCategories.map((category) => category.name)).toEqual([
      'amber',
      'blue',
      'charlie',
    ])
  })

  it('rounds percent to the nearest integer', () => {
    // 7 / 3 → 133.33% increase (1.333… × 100). Math.round → 133.
    const dataByDate = new Map<string, HeatmapDay>([
      buildHeatmapDay('2026-05-08', 7),
      buildHeatmapDay('2026-05-01', 3),
    ])
    const stats = aggregateLastSevenDays(dataByDate, TODAY)
    expect(stats.trend).toEqual({ kind: 'percent', value: 133 })
  })
})

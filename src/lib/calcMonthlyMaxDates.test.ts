import { describe, expect, it } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { calcMonthlyMaxDates } from './calcMonthlyMaxDates'

/**
 * Builds a HeatmapDay tuple for the Map fixture. Categories are not relevant
 * to the monthly-max calculation, so they default to empty.
 */
function day(isoDate: string, count: number): [string, HeatmapDay] {
  return [isoDate, { date: isoDate, count, categories: [] }]
}

describe('calcMonthlyMaxDates', () => {
  it('returns an empty Set when given an empty Map', () => {
    expect(calcMonthlyMaxDates(new Map())).toEqual(new Set())
  })

  it('picks the single highest-count day in a month', () => {
    const dataByDate = new Map<string, HeatmapDay>([
      day('2026-05-04', 3),
      day('2026-05-10', 7),
      day('2026-05-20', 5),
    ])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(new Set(['2026-05-10']))
  })

  it('breaks intra-month ties by picking the earliest date', () => {
    // Map insertion order is intentionally reversed so the test fails if
    // the implementation accidentally keys off insertion order rather than
    // chronological order.
    const dataByDate = new Map<string, HeatmapDay>([
      day('2026-05-20', 5),
      day('2026-05-04', 5),
      day('2026-05-10', 5),
    ])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(new Set(['2026-05-04']))
  })

  it('keeps the mark on the day that first reached the peak when a later day ties it', () => {
    // Locks the ratified tie policy's affirmation rationale: the ◎ anchors to
    // the FIRST high-water-mark day and a later equal day must NOT steal it
    // (latest-wins would, making the glyph jump and stripping earned
    // recognition). Insertion order is chronological here — the mark stays put.
    const dataByDate = new Map<string, HeatmapDay>([
      day('2026-05-04', 6), // first reaches the month peak — earns the ◎
      day('2026-05-09', 2),
      day('2026-05-25', 6), // ties the peak later — must NOT move the mark
    ])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(new Set(['2026-05-04']))
  })

  it('omits months whose days all have count === 0', () => {
    const dataByDate = new Map<string, HeatmapDay>([
      day('2026-04-01', 0),
      day('2026-04-15', 0),
    ])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(new Set())
  })

  it('returns one entry per month for multi-month input', () => {
    const dataByDate = new Map<string, HeatmapDay>([
      day('2026-03-12', 4),
      day('2026-03-22', 6), // peak of March
      day('2026-04-05', 8), // peak of April
      day('2026-04-29', 2),
      day('2026-05-01', 1), // peak of May (only day)
    ])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(
      new Set(['2026-03-22', '2026-04-05', '2026-05-01']),
    )
  })

  it('treats a month with a single non-zero day as that day being the max', () => {
    const dataByDate = new Map<string, HeatmapDay>([day('2026-05-07', 1)])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(new Set(['2026-05-07']))
  })

  it('ignores zero-count days when computing the month peak', () => {
    // Zero days exist alongside non-zero days. The peak must come from the
    // non-zero entries; zero days are never candidates even when no other
    // day in the month beats them.
    const dataByDate = new Map<string, HeatmapDay>([
      day('2026-05-01', 0),
      day('2026-05-15', 3),
      day('2026-05-22', 0),
    ])
    expect(calcMonthlyMaxDates(dataByDate)).toEqual(new Set(['2026-05-15']))
  })
})

import { describe, expect, it } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { calcStreak, STREAK_TIERS } from './calc-streak'
import { shiftIsoDate } from './shiftIsoDate'

/**
 * Builds a `Map<string, HeatmapDay>` from a list of YYYY-MM-DD strings, each
 * with a count of 1 and no categories. Test fixtures only — production data
 * comes from `useHeatmapData`. Categories are irrelevant for streak math so
 * the omission keeps tests focused on date arithmetic.
 */
function buildDataByDate(activeDates: string[]): Map<string, HeatmapDay> {
  return new Map(
    activeDates.map((date) => [date, { date, count: 1, categories: [] }]),
  )
}

// "Today" is now a local-day key string (the caller derives it via
// getLocalTodayIsoDate); calcStreak is pure on it, so tests pin it directly.
const TODAY_ISO = '2026-05-12'

describe('calcStreak', () => {
  describe('empty data', () => {
    it('returns zeros for an empty map', () => {
      expect(calcStreak(new Map(), TODAY_ISO)).toStrictEqual({
        currentStreak: 0,
        longestStreak: 0,
        currentTier: null,
        shownUpThisMonth: 0,
      })
    })

    it('returns zero current streak when last activity is older than yesterday', () => {
      const data = buildDataByDate([shiftIsoDate(TODAY_ISO, -3)])
      const result = calcStreak(data, TODAY_ISO)
      expect(result.currentStreak).toBe(0)
      expect(result.longestStreak).toBe(1)
    })
  })

  describe('current streak grace period', () => {
    it('counts today as a 1-day streak', () => {
      const data = buildDataByDate([TODAY_ISO])
      expect(calcStreak(data, TODAY_ISO).currentStreak).toBe(1)
    })

    it('keeps the streak when only yesterday has activity (today not yet shown up)', () => {
      const data = buildDataByDate([shiftIsoDate(TODAY_ISO, -1)])
      expect(calcStreak(data, TODAY_ISO).currentStreak).toBe(1)
    })

    it('still counts the current streak when both today and yesterday are present', () => {
      const data = buildDataByDate([shiftIsoDate(TODAY_ISO, -1), TODAY_ISO])
      expect(calcStreak(data, TODAY_ISO).currentStreak).toBe(2)
    })
  })

  describe('consecutive-day streaks', () => {
    it('counts a 7-day consecutive streak ending today', () => {
      const days = Array.from({ length: 7 }, (_, i) =>
        shiftIsoDate(TODAY_ISO, -i),
      )
      const result = calcStreak(buildDataByDate(days), TODAY_ISO)
      expect(result.currentStreak).toBe(7)
      expect(result.longestStreak).toBe(7)
      expect(result.currentTier).toBe(7)
    })

    it('counts a 7-day streak anchored on yesterday (grace)', () => {
      const days = Array.from({ length: 7 }, (_, i) =>
        shiftIsoDate(TODAY_ISO, -i - 1),
      )
      const result = calcStreak(buildDataByDate(days), TODAY_ISO)
      expect(result.currentStreak).toBe(7)
      expect(result.currentTier).toBe(7)
    })

    it('breaks the streak on a gap', () => {
      const data = buildDataByDate([
        TODAY_ISO,
        shiftIsoDate(TODAY_ISO, -1),
        // Gap on day -2
        shiftIsoDate(TODAY_ISO, -3),
        shiftIsoDate(TODAY_ISO, -4),
      ])
      const result = calcStreak(data, TODAY_ISO)
      expect(result.currentStreak).toBe(2)
      expect(result.longestStreak).toBe(2)
    })

    it('preserves longest streak when a later streak is shorter', () => {
      // Long streak 30 days ago, then a fresh 2-day streak ending today.
      const longRunDays = Array.from({ length: 10 }, (_, i) =>
        shiftIsoDate(TODAY_ISO, -i - 20),
      )
      const recentDays = [TODAY_ISO, shiftIsoDate(TODAY_ISO, -1)]
      const result = calcStreak(
        buildDataByDate([...longRunDays, ...recentDays]),
        TODAY_ISO,
      )
      expect(result.currentStreak).toBe(2)
      expect(result.longestStreak).toBe(10)
    })
  })

  describe('tier semantics', () => {
    it('returns null below 7', () => {
      const days = Array.from({ length: 6 }, (_, i) =>
        shiftIsoDate(TODAY_ISO, -i),
      )
      expect(
        calcStreak(buildDataByDate(days), TODAY_ISO).currentTier,
      ).toBeNull()
    })

    it.each([
      [7, 7],
      [29, 7],
      [30, 30],
      [99, 30],
      [100, 100],
      [364, 100],
      [365, 365],
      [400, 365],
    ])('returns tier %s for streak %s', (streakLength, expectedTier) => {
      const days = Array.from({ length: streakLength }, (_, i) =>
        shiftIsoDate(TODAY_ISO, -i),
      )
      expect(calcStreak(buildDataByDate(days), TODAY_ISO).currentTier).toBe(
        expectedTier,
      )
    })

    it('exposes STREAK_TIERS in descending order so external callers can iterate', () => {
      expect([...STREAK_TIERS]).toStrictEqual([365, 100, 30, 7])
    })
  })

  describe('shownUpThisMonth', () => {
    it('counts only days inside the current calendar month', () => {
      const data = buildDataByDate([
        '2026-04-29',
        '2026-04-30',
        '2026-05-01',
        '2026-05-03',
        '2026-05-12', // today
      ])
      expect(calcStreak(data, TODAY_ISO).shownUpThisMonth).toBe(3)
    })

    it('returns zero when no activity falls inside the month', () => {
      const data = buildDataByDate(['2026-04-29'])
      expect(calcStreak(data, TODAY_ISO).shownUpThisMonth).toBe(0)
    })

    it('stays correct across a year boundary anchor', () => {
      const newYearDay = '2026-01-01'
      const data = buildDataByDate(['2025-12-31', '2026-01-01'])
      expect(calcStreak(data, newYearDay).shownUpThisMonth).toBe(1)
    })
  })

  describe('calendar boundaries', () => {
    it('handles the US spring-forward day without an off-by-one (string calendar math)', () => {
      const dstAnchor = '2026-03-09'
      const data = buildDataByDate(['2026-03-08', '2026-03-09'])
      const result = calcStreak(data, dstAnchor)
      expect(result.currentStreak).toBe(2)
    })

    it('matches across a leap-day boundary', () => {
      const anchor = '2024-03-01'
      const data = buildDataByDate([
        '2024-02-27',
        '2024-02-28',
        '2024-02-29',
        '2024-03-01',
      ])
      expect(calcStreak(data, anchor).currentStreak).toBe(4)
    })
  })
})

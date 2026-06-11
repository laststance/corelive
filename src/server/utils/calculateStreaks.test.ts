import { describe, expect, it } from 'vitest'

import { calculateStreaks } from './calculateStreaks'

// The server's heatmap streak math is its OWN implementation (distinct from the
// client `calc-streak.ts`), so the timezone grace boundary — "is the streak
// still alive if the user hasn't logged today yet?" — must be locked here. If
// the today/yesterday gate regresses, a user who kept a 12-day streak would see
// it silently reset to 0 the morning before their first task of the day.
describe('calculateStreaks (heatmap current/longest)', () => {
  it('returns zero streaks for an empty history', () => {
    // Arrange / Act
    const streaks = calculateStreaks([], '2026-03-24', '2026-03-23')

    // Assert
    expect(streaks).toEqual({ current: 0, longest: 0 })
  })

  it('counts consecutive days ending today as the current streak', () => {
    // Arrange — three back-to-back days, the last of which IS today.
    const dates = ['2026-03-22', '2026-03-23', '2026-03-24']

    // Act
    const streaks = calculateStreaks(dates, '2026-03-24', '2026-03-23')

    // Assert
    expect(streaks).toEqual({ current: 3, longest: 3 })
  })

  it('keeps the current streak alive on yesterday when today has no activity yet (grace period)', () => {
    // Arrange — last activity was yesterday; the user just has not logged today.
    const dates = ['2026-03-22', '2026-03-23']

    // Act — today is the 24th, yesterday the 23rd (the last active day).
    const streaks = calculateStreaks(dates, '2026-03-24', '2026-03-23')

    // Assert — grace keeps it at 2, not reset to 0.
    expect(streaks).toEqual({ current: 2, longest: 2 })
  })

  it('breaks the current streak when the most recent activity predates yesterday', () => {
    // Arrange — last activity was the 22nd; today is the 24th (a full gap day).
    const dates = ['2026-03-21', '2026-03-22']

    // Act
    const streaks = calculateStreaks(dates, '2026-03-24', '2026-03-23')

    // Assert — current resets to 0 but the longest run is still remembered.
    expect(streaks).toEqual({ current: 0, longest: 2 })
  })

  it('reports the longest historical run even when the current streak is shorter', () => {
    // Arrange — a 4-day run in the past, a gap, then a 2-day run ending today.
    const dates = [
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-23',
      '2026-03-24',
    ]

    // Act
    const streaks = calculateStreaks(dates, '2026-03-24', '2026-03-23')

    // Assert — current is the live 2-day run; longest is the past 4-day run.
    expect(streaks).toEqual({ current: 2, longest: 4 })
  })

  it('de-dupes repeated completions on the same day (repetition is not a longer streak)', () => {
    // Arrange — the same day appears three times (multiple completions that day).
    const dates = ['2026-03-24', '2026-03-24', '2026-03-24']

    // Act
    const streaks = calculateStreaks(dates, '2026-03-24', '2026-03-23')

    // Assert — one distinct day → a streak of 1, not 3.
    expect(streaks).toEqual({ current: 1, longest: 1 })
  })

  it('ignores input ordering when computing streaks', () => {
    // Arrange — the same three consecutive days, supplied out of order.
    const dates = ['2026-03-24', '2026-03-22', '2026-03-23']

    // Act
    const streaks = calculateStreaks(dates, '2026-03-24', '2026-03-23')

    // Assert — sorting happens internally, so order does not matter.
    expect(streaks).toEqual({ current: 3, longest: 3 })
  })
})

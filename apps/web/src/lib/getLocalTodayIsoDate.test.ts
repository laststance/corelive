import { describe, expect, test } from 'vitest'

import { getLocalTodayIsoDate } from './getLocalTodayIsoDate'
import { toLocalDayKey } from './toLocalDayKey'

describe('getLocalTodayIsoDate', () => {
  test('returns a zero-padded YYYY-MM-DD string', () => {
    // Act
    const today = getLocalTodayIsoDate()

    // Assert: shape is a valid heatmap/day-detail lookup key.
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('agrees with bucketing "now" through the browser-resolved zone', () => {
    // Arrange: reproduce the helper's own derivation independently.
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const expected = toLocalDayKey(new Date(), browserZone)

    // Act
    const today = getLocalTodayIsoDate()

    // Assert
    expect(today).toBe(expected)
  })
})

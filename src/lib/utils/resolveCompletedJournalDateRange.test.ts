import { describe, expect, test } from 'vitest'

import { resolveCompletedJournalDateRange } from './resolveCompletedJournalDateRange'

describe('Completed Tasks period presets', () => {
  test('keeps All unbounded so the existing full history remains the default', () => {
    // Arrange
    const now = new Date(2026, 6, 14, 12)

    // Act
    const range = resolveCompletedJournalDateRange('all', now)

    // Assert
    expect(range).toEqual({})
  })

  test('uses Monday through the next Monday for This week', () => {
    // Arrange — Tuesday, July 14, 2026.
    const now = new Date(2026, 6, 14, 12)

    // Act
    const range = resolveCompletedJournalDateRange('week', now)

    // Assert
    expect(range.completedFrom).toEqual(new Date(2026, 6, 13, 0))
    expect(range.completedBefore).toEqual(new Date(2026, 6, 20, 0))
  })

  test('uses adjacent local midnights for month and year presets', () => {
    // Arrange
    const now = new Date(2026, 6, 14, 12)

    // Act
    const monthRange = resolveCompletedJournalDateRange('month', now)
    const yearRange = resolveCompletedJournalDateRange('year', now)

    // Assert
    expect(monthRange.completedFrom).toEqual(new Date(2026, 6, 1, 0))
    expect(monthRange.completedBefore).toEqual(new Date(2026, 7, 1, 0))
    expect(yearRange.completedFrom).toEqual(new Date(2026, 0, 1, 0))
    expect(yearRange.completedBefore).toEqual(new Date(2027, 0, 1, 0))
  })

  test('includes today and the previous 29 local calendar days for Last 30 days', () => {
    // Arrange
    const now = new Date(2026, 6, 14, 18, 55)

    // Act
    const range = resolveCompletedJournalDateRange('last-30-days', now)

    // Assert
    expect(range.completedFrom).toEqual(new Date(2026, 5, 15, 0))
    expect(range.completedBefore).toEqual(new Date(2026, 6, 15, 0))
  })

  test('converts an inclusive Custom selection into exclusive server bounds', () => {
    // Arrange
    const now = new Date(2026, 6, 14, 12)
    const customDateRange = {
      from: new Date(2026, 6, 5, 16),
      to: new Date(2026, 6, 13, 18),
    }

    // Act
    const range = resolveCompletedJournalDateRange(
      'custom',
      now,
      customDateRange,
    )

    // Assert
    expect(range.completedFrom).toEqual(new Date(2026, 6, 5, 0))
    expect(range.completedBefore).toEqual(new Date(2026, 6, 14, 0))
  })

  test('keeps an incomplete Custom selection unbounded until Apply is available', () => {
    // Arrange
    const now = new Date(2026, 6, 14, 12)
    const incompleteCustomDateRange = { from: new Date(2026, 6, 5) }

    // Act
    const range = resolveCompletedJournalDateRange(
      'custom',
      now,
      incompleteCustomDateRange,
    )

    // Assert
    expect(range).toEqual({})
  })
})

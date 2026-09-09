import { describe, expect, test } from 'vitest'

import { getUnfilteredCompletedJournalInput } from './getUnfilteredCompletedJournalInput'

describe('unfiltered Completed journal input', () => {
  test('uses the first page defaults that the visible query and optimistic cache key share', () => {
    // Arrange
    const firstPageParam = undefined

    // Act
    const input = getUnfilteredCompletedJournalInput(firstPageParam)

    // Assert
    expect(input).toEqual({ limit: 10, offset: 0 })
  })

  test('preserves a later page offset without changing the shared page size', () => {
    // Arrange
    const laterPageParam = 20

    // Act
    const input = getUnfilteredCompletedJournalInput(laterPageParam)

    // Assert
    expect(input).toEqual({ limit: 10, offset: 20 })
  })
})

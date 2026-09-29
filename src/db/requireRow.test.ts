// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { requireRow } from './requireRow'

describe('requireRow', () => {
  test('returns the first row a returning() statement produced', () => {
    // Arrange
    const rows = [{ id: 7 }, { id: 8 }]

    // Act
    const row = requireRow(rows, 'category.update')

    // Assert
    expect(row).toEqual({ id: 7 })
  })

  test('throws when the statement matched no row, so a vanished row still aborts the transaction', () => {
    // Arrange
    const rows: { id: number }[] = []

    // Act & Assert
    expect(() => requireRow(rows, 'category.delete')).toThrow(
      'category.delete matched no row',
    )
  })
})

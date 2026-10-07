import { describe, expect, test } from 'vitest'

import type { HeatmapCategory } from '@/hooks/useHeatmapData'

import {
  getCompletionCategoryPath,
  rollupCategoryTotals,
} from './rollupCategoryTotals'

const WORK = { id: 1, name: 'Work', color: 'blue' }
const PERSONAL = { id: 5, name: 'Personal', color: 'rose' }
const COUNTS: HeatmapCategory[] = [
  { ...WORK, count: 1, parent: null },
  { id: 2, name: 'CoreLive', color: 'blue', count: 3, parent: WORK },
  { id: 3, name: 'Client work', color: 'green', count: 2, parent: WORK },
  { id: 4, name: 'General', color: 'amber', count: 1, parent: null },
]

describe('parent retrospective totals', () => {
  test('Work includes direct and child entries exactly once while General stays independent', () => {
    // Arrange
    const counts = COUNTS
    // Act
    const totals = rollupCategoryTotals(counts)
    // Assert
    expect(totals).toEqual([
      {
        ...WORK,
        count: 6,
        directCount: 1,
        children: [
          { id: 2, name: 'CoreLive', color: 'blue', count: 3 },
          { id: 3, name: 'Client work', color: 'green', count: 2 },
        ],
      },
      { id: 4, name: 'General', color: 'amber', count: 1 },
    ])
    expect(totals.reduce((sum, category) => sum + category.count, 0)).toBe(7)
  })

  test('moving CoreLive changes historical root totals to Work 3 and Personal 3', () => {
    // Arrange
    const counts = COUNTS.map((category) =>
      category.id === 2 ? { ...category, parent: PERSONAL } : category,
    )
    // Act
    const totals = rollupCategoryTotals(counts)
    // Assert
    expect(totals.map(({ name, count }) => ({ name, count }))).toEqual([
      { name: 'Personal', count: 3 },
      { name: 'Work', count: 3 },
      { name: 'General', count: 1 },
    ])
    expect(totals.find((category) => category.id === 1)?.directCount).toBe(1)
  })

  test('repeated days preserve direct and child counts even when child data arrives first', () => {
    // Arrange
    const counts = [COUNTS[1]!, COUNTS[0]!, COUNTS[1]!, COUNTS[0]!]
    // Act
    const totals = rollupCategoryTotals(counts)
    // Assert
    expect(totals).toEqual([
      {
        ...WORK,
        count: 8,
        directCount: 2,
        children: [{ id: 2, name: 'CoreLive', color: 'blue', count: 6 }],
      },
    ])
  })

  test('same-named children contribute to their own parent rather than merging by name', () => {
    // Arrange
    const counts = [
      { id: 2, name: 'Design', color: 'blue', count: 3, parent: WORK },
      { id: 6, name: 'Design', color: 'rose', count: 2, parent: PERSONAL },
    ]
    // Act
    const totals = rollupCategoryTotals(counts)
    // Assert
    expect(
      totals.map(({ name, count, directCount }) => ({
        name,
        count,
        directCount,
      })),
    ).toEqual([
      { name: 'Work', count: 3, directCount: 0 },
      { name: 'Personal', count: 2, directCount: 0 },
    ])
  })

  test('completion labels show the current parent without parsing slashes in category names', () => {
    // Arrange
    const category = { name: 'CoreLive / Docs', parent: WORK }
    // Act
    const path = getCompletionCategoryPath(category)
    // Assert
    expect(path).toBe('Work / CoreLive / Docs')
    expect(getCompletionCategoryPath({ name: 'General', parent: null })).toBe(
      'General',
    )
  })
})

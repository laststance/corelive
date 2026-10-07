import { describe, expect, test } from 'vitest'

import {
  createCategoryHierarchy,
  getCategoryPath,
  searchCategoryHierarchy,
} from './categoryHierarchy'

const categories = [
  {
    id: 3,
    name: 'Client work',
    parentId: 1,
    createdAt: new Date('2026-09-03'),
  },
  {
    id: 4,
    name: 'Learning',
    parentId: null,
    createdAt: new Date('2026-09-04'),
  },
  { id: 2, name: 'CoreLive', parentId: 1, createdAt: new Date('2026-09-02') },
  { id: 1, name: 'Work', parentId: null, createdAt: new Date('2026-09-01') },
  { id: 5, name: 'CoreLive', parentId: 4, createdAt: new Date('2026-09-05') },
]

describe('category hierarchy navigation', () => {
  test('places each child immediately beneath its parent in creation order', () => {
    // Arrange / Act
    const hierarchy = createCategoryHierarchy(categories)
    // Assert
    expect(hierarchy.ordered.map((category) => category.id)).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  test('distinguishes identical child names by parent without changing their spelling', () => {
    // Arrange / Act
    const paths = createCategoryHierarchy(categories).paths
    // Assert
    expect(paths.get(2)).toBe('Work / CoreLive')
    expect(paths.get(5)).toBe('Learning / CoreLive')
    const category = categories[0]
    if (!category) throw new Error('Missing Client work fixture')
    expect(getCategoryPath(category, categories)).toBe('Work / Client work')
  })

  test('keeps an orphan reachable while a category list refresh is pending', () => {
    // Arrange
    const orphan = {
      id: 6,
      name: 'Writing',
      parentId: 999,
      createdAt: new Date('2026-09-06'),
    }
    // Act
    const hierarchy = createCategoryHierarchy([...categories, orphan])
    // Assert
    expect(hierarchy.ordered.map((category) => category.id)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
    expect(hierarchy.paths.get(6)).toBe('Writing')
  })

  test.each([
    ['Work', [1, 2, 3]],
    ['CoreLive', [2, 5]],
    ['  ＷＯＲＫ   client ', [3]],
    ['work unknown', []],
    ['', [1, 2, 3, 4, 5]],
  ])('searches every normalized path token for %s', (query, expected) => {
    // Arrange / Act
    const matches = searchCategoryHierarchy(categories, query)
    // Assert
    expect(matches.map((category) => category.id)).toEqual(expected)
  })
})

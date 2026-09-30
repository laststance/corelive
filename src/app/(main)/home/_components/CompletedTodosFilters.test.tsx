import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import {
  CompletedTodosFilters,
  type CompletedFilterCategory,
} from './CompletedTodosFilters'

const CATEGORIES: CompletedFilterCategory[] = [
  { id: 1, name: 'Work', color: 'blue', parentId: null },
  { id: 2, name: 'CoreLive', color: 'blue', parentId: 1 },
  { id: 3, name: 'Design', color: 'green', parentId: 1 },
  { id: 4, name: 'Learning', color: 'rose', parentId: null },
  { id: 5, name: 'Design', color: 'rose', parentId: 4 },
]

const CALLBACKS = {
  onPeriodChange: vi.fn(),
  onCategoryChange: vi.fn(),
  onCustomDateRangeChange: vi.fn(),
  onClear: vi.fn(),
}

afterEach(cleanup)

test('a main category offers checked child inclusion and lets the user show direct entries only', () => {
  // Arrange
  const onInclude = vi.fn()
  render(
    <CompletedTodosFilters
      categories={CATEGORIES}
      period="all"
      categoryId={1}
      includeSubcategories
      onIncludeSubcategoriesChange={onInclude}
      {...CALLBACKS}
    />,
  )
  const toggle = screen.getByRole('checkbox', { name: 'Include subcategories' })
  expect(toggle).toBeChecked()
  // Act
  fireEvent.click(toggle)
  // Assert
  expect(onInclude).toHaveBeenCalledExactlyOnceWith(false)
})

test('all categories and individual children do not expose a misleading child inclusion control', () => {
  // Arrange
  const { rerender } = render(
    <CompletedTodosFilters
      categories={CATEGORIES}
      period="all"
      categoryId={null}
      {...CALLBACKS}
    />,
  )
  expect(
    screen.queryByRole('checkbox', { name: 'Include subcategories' }),
  ).toBeNull()
  // Act
  rerender(
    <CompletedTodosFilters
      categories={CATEGORIES}
      period="all"
      categoryId={2}
      {...CALLBACKS}
    />,
  )
  // Assert
  expect(
    screen.queryByRole('checkbox', { name: 'Include subcategories' }),
  ).toBeNull()
})

test('the selected history category displays its full path instead of an ambiguous child name', () => {
  // Arrange
  const selectedId = 5
  // Act
  render(
    <CompletedTodosFilters
      categories={CATEGORIES}
      period="all"
      categoryId={selectedId}
      {...CALLBACKS}
    />,
  )
  // Assert
  expect(
    screen.getByRole('combobox', { name: 'Filter wins by category' }),
  ).toHaveTextContent('Learning / Design')
})

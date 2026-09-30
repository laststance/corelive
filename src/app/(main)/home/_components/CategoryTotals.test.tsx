import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import type { RootCategoryTotal } from '@/lib/rollupCategoryTotals'

import { CategoryTotals } from './CategoryTotals'

const TOTALS: RootCategoryTotal[] = [
  {
    id: 1,
    name: 'Work',
    color: 'blue',
    count: 6,
    directCount: 1,
    children: [
      { id: 2, name: 'CoreLive', color: 'blue', count: 3 },
      { id: 3, name: 'Client work', color: 'green', count: 2 },
    ],
  },
  { id: 4, name: 'General', color: 'amber', count: 1 },
]

afterEach(cleanup)

test('parent totals start collapsed and disclose the matching direct and child counts', () => {
  // Arrange
  render(
    <CategoryTotals categories={TOTALS} label="Top categories this week" />,
  )
  const button = screen.getByRole('button', {
    name: 'Work: 6 entries, show breakdown',
  })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('region', { name: 'Work breakdown' })).toBeNull()
  // Act
  fireEvent.click(button)
  // Assert
  expect(button).toHaveAttribute('aria-expanded', 'true')
  const breakdown = screen.getByRole('region', { name: 'Work breakdown' })
  expect(within(breakdown).getByText('Directly in Work')).toBeVisible()
  expect(within(breakdown).getByText('CoreLive')).toBeVisible()
  expect(within(breakdown).getByText('3')).toBeVisible()
  expect(within(breakdown).getByText('Client work')).toBeVisible()
  expect(within(breakdown).getByText('2')).toBeVisible()
  expect(screen.queryByRole('button', { name: /General/ })).toBeNull()
})

test('opening a second parent closes the first and hides zero direct entries', () => {
  // Arrange
  render(
    <CategoryTotals
      categories={[
        ...TOTALS,
        {
          id: 5,
          name: 'Personal',
          color: 'rose',
          count: 2,
          directCount: 0,
          children: [{ id: 6, name: 'Reading', color: 'rose', count: 2 }],
        },
      ]}
      label="Top categories this year"
    />,
  )
  // Act
  fireEvent.click(
    screen.getByRole('button', { name: 'Work: 6 entries, show breakdown' }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Personal: 2 entries, show breakdown' }),
  )
  // Assert
  expect(screen.queryByRole('region', { name: 'Work breakdown' })).toBeNull()
  expect(
    screen.getByRole('region', { name: 'Personal breakdown' }),
  ).toBeVisible()
  expect(screen.queryByText('Directly in Personal')).toBeNull()
  expect(screen.getByText('Reading')).toBeVisible()
})

test('removing an opened parent does not leave a stale child breakdown', () => {
  // Arrange
  const { rerender } = render(
    <CategoryTotals categories={TOTALS} label="Day categories" />,
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Work: 6 entries, show breakdown' }),
  )
  // Act
  rerender(
    <CategoryTotals
      categories={[{ id: 4, name: 'General', color: 'amber', count: 7 }]}
      label="Day categories"
    />,
  )
  // Assert
  expect(screen.queryByRole('region')).toBeNull()
  expect(screen.getByText('General')).toBeVisible()
  expect(screen.queryByText('CoreLive')).toBeNull()
})

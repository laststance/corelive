import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import type { DayDetailTask } from '@/server/schemas/completed'

import { CompletedJournalRow } from './CompletedJournalRow'

const COMPLETED_ENTRY: DayDetailTask = {
  source: 'todo',
  id: 42,
  title: 'Ship the update',
  completedAt: new Date('2026-08-07T09:00:00Z'),
  category: null,
}

test('shows completed journal titles without strikethrough while retaining their quieter tone', () => {
  // Arrange
  const entry = COMPLETED_ENTRY

  // Act
  render(<CompletedJournalRow entry={entry} />)

  // Assert
  const title = screen.getByText('Ship the update')
  expect(title).toBeVisible()
  expect(title).not.toHaveClass('line-through')
  expect(title).toHaveClass('text-muted-foreground')
})

test('completed wins show the full parent path to distinguish same-named children', () => {
  // Arrange
  const entry: DayDetailTask = {
    ...COMPLETED_ENTRY,
    category: {
      id: 2,
      name: 'Design',
      color: 'blue',
      parent: { id: 1, name: 'Work', color: 'blue' },
    },
  }
  // Act
  render(<CompletedJournalRow entry={entry} />)
  // Assert
  expect(screen.getByText('Work / Design')).toBeVisible()
})

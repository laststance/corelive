import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { DayDetailTask } from '@/server/schemas/completed'

import { DayDetailDialog } from './DayDetailDialog'

const WORK = { id: 1, name: 'Work', color: 'blue', parent: null }
const CORE = { id: 2, name: 'CoreLive', color: 'blue', parent: WORK }
const CLIENT = { id: 3, name: 'Client work', color: 'green', parent: WORK }
const GENERAL = { id: 4, name: 'General', color: 'amber', parent: null }
const TASKS: DayDetailTask[] = [
  WORK,
  CORE,
  CORE,
  CORE,
  CLIENT,
  CLIENT,
  GENERAL,
].map((category, index) => ({
  source: 'completed',
  id: index + 1,
  title: `Win ${index + 1}`,
  completedAt: new Date('2026-05-11T09:00:00Z'),
  category,
}))
vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: (previous: unknown) => previous,
  useQuery: () => ({
    data: { date: '2026-05-11', count: 7, tasks: TASKS },
    isLoading: false,
    isPlaceholderData: false,
  }),
}))
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: { completed: { dayDetail: { queryOptions: () => ({}) } } },
}))
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))

afterEach(cleanup)

test('day details group seven entries into Work six and General one with full child paths', () => {
  // Arrange
  render(<DayDetailDialog date="2026-05-11" onOpenChange={vi.fn()} />)
  // Act
  fireEvent.click(
    screen.getByRole('button', { name: 'Work: 6 entries, show breakdown' }),
  )
  // Assert
  const breakdown = screen.getByRole('region', { name: 'Work breakdown' })
  expect(within(breakdown).getByText('Directly in Work')).toBeVisible()
  expect(within(breakdown).getByText('1')).toBeVisible()
  expect(within(breakdown).getByText('CoreLive')).toBeVisible()
  expect(within(breakdown).getByText('3')).toBeVisible()
  expect(within(breakdown).getByText('Client work')).toBeVisible()
  expect(within(breakdown).getByText('2')).toBeVisible()
  expect(screen.getAllByText('Work / CoreLive')).toHaveLength(3)
  expect(screen.getAllByText(/^Win \d$/)).toHaveLength(7)
  expect(screen.getByText('General', { selector: 'p' })).toBeVisible()
})

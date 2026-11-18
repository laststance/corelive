import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { RecentActivityCard } from './RecentActivityCard'

vi.mock('@/hooks/useLocalDayKey', () => ({
  useLocalDayKey: () => '2026-10-01',
}))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

test('changing the period updates the dates, totals, and category breakdown together', () => {
  // Arrange
  const work = { id: 1, name: 'Work', color: 'blue' }
  const data = new Map<string, HeatmapDay>([
    [
      '2026-10-01',
      {
        date: '2026-10-01',
        count: 7,
        categories: [
          { ...work, count: 1, parent: null },
          { id: 2, name: 'CoreLive', color: 'blue', count: 3, parent: work },
          {
            id: 3,
            name: 'Client work',
            color: 'green',
            count: 2,
            parent: work,
          },
        ],
      },
    ],
    [
      '2026-09-12',
      { date: '2026-09-12', count: 3, categories: [{ ...work, count: 3 }] },
    ],
  ])
  render(<RecentActivityCard dataByDate={data} />)
  expect(screen.getByText('Sep 25, 2026')).toBeVisible()
  expect(screen.getByText('Oct 1, 2026')).toBeVisible()
  expect(screen.getByText('7', { selector: 'dd' })).toBeVisible()
  expect(screen.getByText('1', { selector: 'dd' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Work: 6 entries, show breakdown' }),
  ).toBeVisible()
  expect(screen.getByText('Unassigned')).toBeVisible()

  // Act
  fireEvent.click(screen.getByRole('button', { name: '30 days' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Work: 9 entries, show breakdown' }),
  )

  // Assert
  expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(screen.getByText('Sep 2, 2026')).toBeVisible()
  expect(screen.getByText('10', { selector: 'dd' })).toBeVisible()
  expect(screen.getByText('2', { selector: 'dd' })).toBeVisible()
  const breakdown = screen.getByRole('region', { name: 'Work breakdown' })
  expect(within(breakdown).getByText('CoreLive')).toBeVisible()
  expect(within(breakdown).getByText('3')).toBeVisible()
  expect(within(breakdown).getByText('Directly in Work')).toBeVisible()
  expect(within(breakdown).getByText('4')).toBeVisible()
})

test('a quiet 7-day window can switch to show older completions', () => {
  // Arrange
  const data = new Map<string, HeatmapDay>([
    ['2026-09-12', { date: '2026-09-12', count: 3, categories: [] }],
  ])
  render(<RecentActivityCard dataByDate={data} />)
  expect(screen.getByText('No completions in this period.')).toBeVisible()
  expect(screen.queryByText('Daily completions')).toBeNull()

  // Act
  fireEvent.click(screen.getByRole('button', { name: '30 days' }))

  // Assert
  expect(screen.getByText('Daily completions')).toBeVisible()
  expect(screen.getByText('3', { selector: 'dd' })).toBeVisible()
  expect(screen.queryByText('No completions in this period.')).toBeNull()
})

test('the native day selector opens the chosen day and preserves the existing URL state', () => {
  // Arrange
  window.history.replaceState(null, '', '/home?force=2026-10-01#journal')
  const data = new Map<string, HeatmapDay>([
    ['2026-09-30', { date: '2026-09-30', count: 2, categories: [] }],
  ])
  render(<RecentActivityCard dataByDate={data} />)
  expect(
    screen.getByRole('option', { name: 'Sep 30, 2026 · 2 completed' }),
  ).toBeVisible()

  // Act
  fireEvent.change(screen.getByRole('combobox', { name: 'Day to view' }), {
    target: { value: '2026-09-30' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'View day' }))

  // Assert
  expect(
    window.location.pathname + window.location.search + window.location.hash,
  ).toBe('/home?force=2026-10-01&date=2026-09-30#journal')
})

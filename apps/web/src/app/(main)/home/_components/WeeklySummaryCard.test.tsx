import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { WeeklySummaryCard } from './WeeklySummaryCard'

vi.mock('@/lib/getLocalTodayIsoDate', () => ({
  getLocalTodayIsoDate: () => '2026-10-01',
}))
afterEach(cleanup)

test('weekly summary shows Work six and overall seven while child detail stays optional', () => {
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
          { id: 4, name: 'General', color: 'amber', count: 1, parent: null },
        ],
      },
    ],
  ])
  render(<WeeklySummaryCard dataByDate={data} />)
  expect(screen.queryByRole('region', { name: 'Work breakdown' })).toBeNull()
  // Act
  fireEvent.click(
    screen.getByRole('button', { name: 'Work: 6 entries, show breakdown' }),
  )
  // Assert
  expect(screen.getByLabelText('7 completed this week')).toBeVisible()
  const breakdown = screen.getByRole('region', { name: 'Work breakdown' })
  expect(within(breakdown).getByText('CoreLive')).toBeVisible()
  expect(within(breakdown).getByText('3')).toBeVisible()
  expect(within(breakdown).getByText('Directly in Work')).toBeVisible()
})

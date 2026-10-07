import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { YearInReviewModal } from './YearInReviewModal'

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: { id: 'qa-owner' } }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('force=2026-12-31'),
}))
afterEach(cleanup)

test('year review displays Work six and overall seven without ranking children as separate roots', async () => {
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
  render(<YearInReviewModal dataByDate={data} />)
  // Act
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Work: 6 entries, show breakdown',
    }),
  )
  // Assert
  expect(screen.getByLabelText('7 completed')).toBeVisible()
  expect(screen.getByLabelText('1 days shown up')).toBeVisible()
  expect(screen.queryByText(/streak/i)).not.toBeInTheDocument()
  const breakdown = screen.getByRole('region', { name: 'Work breakdown' })
  expect(within(breakdown).getByText('Directly in Work')).toBeVisible()
  expect(within(breakdown).getByText('CoreLive')).toBeVisible()
  expect(within(breakdown).getByText('3')).toBeVisible()
  expect(within(breakdown).getByText('Client work')).toBeVisible()
  expect(within(breakdown).getByText('2')).toBeVisible()
})

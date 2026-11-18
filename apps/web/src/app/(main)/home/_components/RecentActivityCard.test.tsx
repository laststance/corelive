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
  fireEvent.click(screen.getByRole('button', { name: 'View day' }))

  // Assert
  expect(window.location.search).toBe('?date=2026-10-01')

  // Act
  fireEvent.click(screen.getByRole('button', { name: '30 days' }))

  // Assert
  expect(screen.getByText('Daily completions')).toBeVisible()
  expect(screen.getByText('3', { selector: 'dd' })).toBeVisible()
  expect(screen.queryByText('No completions in this period.')).toBeNull()
})

test('the native day selector adds the chosen date to the URL and preserves its existing query and fragment', () => {
  // Arrange
  window.history.replaceState(null, '', '/home?force=2026-10-01#journal')
  const data = new Map<string, HeatmapDay>([
    ['2026-09-30', { date: '2026-09-30', count: 2, categories: [] }],
  ])
  render(<RecentActivityCard dataByDate={data} />)
  expect(screen.getAllByRole('option')[0]).toHaveTextContent(
    'Oct 1, 2026 · Rest day',
  )
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

test('clicking a rest-day marker selects its zero-completion date', async () => {
  // Arrange
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 480, 160),
  )
  const data = new Map<string, HeatmapDay>([
    ['2026-09-30', { date: '2026-09-30', count: 2, categories: [] }],
  ])
  render(<RecentActivityCard dataByDate={data} />)
  const marker = await screen.findByLabelText('Rest day, Oct 1, 2026')
  expect(screen.queryByLabelText('Rest day, Sep 30, 2026')).toBeNull()

  // Act
  fireEvent.click(marker)

  // Assert
  expect(window.location.search).toBe('?date=2026-10-01')
  expect(
    screen.getByRole('option', { name: 'Oct 1, 2026 · Rest day' }),
  ).toBeVisible()
})

test('adjacent rest days have separate tap targets in a narrow 30-day chart', async () => {
  // Arrange — a 320px viewport leaves 238px inside the mobile card.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 238, 160),
  )
  render(
    <RecentActivityCard
      dataByDate={
        new Map([
          ['2026-10-01', { date: '2026-10-01', count: 1, categories: [] }],
        ])
      }
    />,
  )

  // Act
  fireEvent.click(screen.getByRole('button', { name: '30 days' }))

  // Assert
  const first = (
    await screen.findByLabelText('Rest day, Sep 2, 2026')
  ).querySelector('rect')!
  const next = screen
    .getByLabelText('Rest day, Sep 3, 2026')
    .querySelector('rect')!
  const width = Number(first.getAttribute('width'))
  expect(width).toBeGreaterThan(0)
  expect(width).toBeLessThan(10)
  expect(Number(first.getAttribute('x')) + width).toBeCloseTo(
    Number(next.getAttribute('x')),
  )
})

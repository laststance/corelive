import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type PropsWithChildren, useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
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
const loadedDay = { date: '2026-05-11', count: 7, tasks: TASKS, categories: [] }
const loadDay = vi.fn<() => Promise<typeof loadedDay>>()
let client: QueryClient

vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      dayDetail: {
        queryOptions: ({ input }: { input: { date: string } }) => ({
          queryKey: [input.date],
        }),
      },
    },
  },
}))
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: vi.fn(),
}))

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.mocked(useClerkQueryReady).mockReturnValue(true)
  loadDay.mockReset()
  client = new QueryClient({
    defaultOptions: {
      queries: { queryFn: loadDay, retry: false, staleTime: Infinity },
    },
  })
  client.setQueryData(['2026-05-11'], loadedDay)
})

afterEach(() => {
  cleanup()
  client.clear()
  onlineManager.setOnline(true)
})

test('day details group seven entries into Work six and General one with full child paths', () => {
  // Arrange
  render(<DayDetailDialog date="2026-05-11" onOpenChange={vi.fn()} />, {
    wrapper: QueryWrapper,
  })
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

test('Escape returns keyboard focus to the dashboard control that opened the day', async () => {
  // Arrange
  const user = userEvent.setup()

  function Example() {
    const [date, setDate] = useState<string | null>(null)
    return (
      <>
        <button type="button" onClick={() => setDate('2026-05-11')}>
          View day
        </button>
        <DayDetailDialog date={date} onOpenChange={() => setDate(null)} />
      </>
    )
  }

  render(<Example />, { wrapper: QueryWrapper })
  const viewDay = screen.getByRole('button', { name: 'View day' })
  await user.tab()
  expect(viewDay).toHaveFocus()

  // Act
  await user.keyboard('{Enter}')
  expect(screen.getByRole('dialog')).toBeVisible()
  await user.keyboard('{Escape}')

  // Assert
  await waitFor(() => expect(viewDay).toHaveFocus())
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('a failed day can be retried and only its confirmed zero count shows a rest day', async () => {
  // Arrange
  loadDay.mockRejectedValueOnce(new Error('Unavailable'))
  loadDay.mockResolvedValueOnce({
    date: '2026-05-12',
    count: 0,
    tasks: [],
    categories: [],
  })
  render(<DayDetailDialog date="2026-05-12" onOpenChange={vi.fn()} />, {
    wrapper: QueryWrapper,
  })

  // Act
  const retry = await screen.findByRole('button', { name: 'Retry day details' })
  expect(screen.getByText('Day details could not load.')).toBeVisible()
  expect(screen.queryByText('rest day')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save as image' })).toBeDisabled()
  fireEvent.click(retry)

  // Assert
  expect(await screen.findByRole('heading', { name: 'rest day' })).toBeVisible()
  expect(loadDay).toHaveBeenCalledTimes(2)
})

test('the day waits for the account session before requesting or describing activity', () => {
  // Arrange
  vi.mocked(useClerkQueryReady).mockReturnValue(false)

  // Act
  render(<DayDetailDialog date="2026-05-12" onOpenChange={vi.fn()} />, {
    wrapper: QueryWrapper,
  })

  // Assert
  expect(screen.getByText('Waiting for your session…')).toBeVisible()
  expect(screen.queryByText('rest day')).toBeNull()
  expect(loadDay).not.toHaveBeenCalled()
})

test('an uncached offline day waits for a connection before showing its entries', async () => {
  // Arrange
  onlineManager.setOnline(false)
  loadDay.mockResolvedValue({ ...loadedDay, date: '2026-05-12' })
  render(<DayDetailDialog date="2026-05-12" onOpenChange={vi.fn()} />, {
    wrapper: QueryWrapper,
  })
  expect(
    screen.getByText('Connect to the internet to load this day.'),
  ).toBeVisible()
  expect(screen.queryByText('rest day')).toBeNull()
  expect(loadDay).not.toHaveBeenCalled()

  // Act
  await act(async () => onlineManager.setOnline(true))

  // Assert
  expect(await screen.findByText('Win 1')).toBeVisible()
})

test('a refresh failure keeps the selected day’s entries visible and identifies them as cached', async () => {
  // Arrange
  loadDay.mockRejectedValue(new Error('Unavailable'))
  render(<DayDetailDialog date="2026-05-11" onOpenChange={vi.fn()} />, {
    wrapper: QueryWrapper,
  })

  // Act
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['2026-05-11'] })
  })

  // Assert
  expect(
    await screen.findByText(
      'Day details could not refresh. Showing the last loaded entries.',
    ),
  ).toBeVisible()
  expect(screen.getByText('Win 1')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Retry day details' }),
  ).toBeEnabled()
})

test('moving to an uncached day clears the previous day and keeps focus on the navigation control', async () => {
  // Arrange
  const user = userEvent.setup()
  loadDay.mockReturnValue(new Promise(() => {}))
  function Example() {
    const [date, setDate] = useState('2026-05-11')
    return (
      <DayDetailDialog
        date={date}
        onOpenChange={vi.fn()}
        onNavigate={(offset) =>
          setDate(offset === 1 ? '2026-05-12' : '2026-05-11')
        }
      />
    )
  }
  render(<Example />, { wrapper: QueryWrapper })
  const nextDay = screen.getByRole('button', { name: 'Next day' })
  expect(screen.getByText('Win 1')).toBeVisible()

  // Act
  await user.click(nextDay)

  // Assert
  expect(screen.getByText('May 12, 2026')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Day details' })).toBeVisible()
  expect(screen.getByText('Loading day details…')).toBeVisible()
  expect(screen.queryByText('Win 1')).toBeNull()
  expect(nextDay).toHaveFocus()
  await user.keyboard('k')
  expect(screen.getByText('May 11, 2026')).toBeVisible()
  expect(screen.getByText('Win 1')).toBeVisible()
  expect(nextDay).toHaveFocus()
})

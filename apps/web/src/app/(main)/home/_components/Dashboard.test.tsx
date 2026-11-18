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
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import { orpc } from '@/lib/orpc/client-query'

import { Dashboard } from './Dashboard'
import { DASHBOARD_REFRESH_INTERVAL_MS } from './useDashboardFreshness'

const { heatmap } = vi.hoisted(() => ({ heatmap: vi.fn() }))
vi.mock('@/lib/orpc/create-client', () => ({
  createClient: () => ({
    completed: { heatmap, journal: async () => ({ entries: [], total: 0 }) },
    category: { list: async () => ({ categories: [] }) },
  }),
}))
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('./DayDetailDialog', () => ({ DayDetailDialog: () => null }))
vi.mock('./YearInReviewModal', () => ({ YearInReviewModal: () => null }))

const EMPTY_HEATMAP = {
  data: [],
  total: 0,
  streaks: { current: 0, longest: 0 },
}

beforeEach(() => {
  heatmap.mockReset().mockImplementation(async () => ({
    ...EMPTY_HEATMAP,
    throughDate: getLocalTodayIsoDate(),
  }))
})
afterEach(() => {
  cleanup()
  onlineManager.setOnline(true)
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('refreshes the activity heatmap every 15 seconds while Home stays open', async () => {
  // Arrange
  vi.useFakeTimers()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  await act(async () => {})
  expect(heatmap).toHaveBeenCalledTimes(1)

  // Act
  await act(async () => {
    await vi.advanceTimersByTimeAsync(14_999)
  })
  expect(heatmap).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })

  // Assert
  expect(heatmap).toHaveBeenCalledTimes(2)

  // Act
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })

  // Assert
  expect(heatmap).toHaveBeenCalledTimes(3)
  client.clear()
})

test('retrying a failed activity request shows an empty year only after the retry succeeds', async () => {
  // Arrange
  const firstRequest = Promise.withResolvers<never>()
  heatmap.mockReturnValueOnce(firstRequest.promise)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  expect(screen.getByText('Loading activity…')).toBeVisible()
  expect(
    screen.getByRole('region', { name: 'Completion journal' }),
  ).toBeVisible()
  await act(async () => firstRequest.reject(new Error('network down')))
  expect(await screen.findByText('Activity could not load.')).toBeVisible()
  expect(screen.queryByText('No completions in the last year')).toBeNull()

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }))

  // Assert
  expect(
    await screen.findByText('No completions in the last year'),
  ).toBeVisible()
  expect(heatmap).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('combobox', { name: 'Day to view' })).toBeVisible()
  const activityCard = screen
    .getByRole('heading', { name: 'Activity' })
    .closest<HTMLElement>('[data-slot="card"]')!
  expect(
    within(activityCard).getByRole('link', { name: /Get Mac app/ }),
  ).toBeVisible()
  expect(
    screen.getByRole('region', { name: 'Completion journal' }),
  ).toBeVisible()
  client.clear()
})

test.each(['failed', 'paused'])(
  'the journal link stays in view when a %s initial activity load recovers',
  async (initialState) => {
    // Arrange
    window.history.replaceState(null, '', '/home#journal')
    heatmap.mockResolvedValue({
      data: [{ date: '2026-10-01', count: 1, categories: [] }],
      total: 1,
      streaks: { current: 0, longest: 1 },
      throughDate: getLocalTodayIsoDate(),
    })
    if (initialState === 'paused') onlineManager.setOnline(false)
    else heatmap.mockRejectedValueOnce(new Error('network down'))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <Dashboard />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByText(
        initialState === 'paused'
          ? 'Activity will load when you’re back online.'
          : 'Activity could not load.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('No completions in the last year')).toBeNull()
    expect(
      screen.getByRole('region', { name: 'Completion journal' }),
    ).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // Act
    await act(async () => {
      if (initialState === 'paused') onlineManager.setOnline(true)
      else
        await client.invalidateQueries({
          queryKey: orpc.completed.heatmap.key(),
        })
    })

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Recent activity' }),
    ).toBeVisible()
    expect(screen.getByText('1 completed')).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Completion journal' }),
    ).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    client.clear()
  },
)

test('an offline refresh marks a cached empty year until activity is up to date', async () => {
  // Arrange
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  expect(
    await screen.findByText('No completions in the last year'),
  ).toBeVisible()

  // Act
  onlineManager.setOnline(false)
  void client.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })

  // Assert
  expect(
    await screen.findByText(
      'Activity refresh paused. Showing the last loaded data.',
    ),
  ).toBeVisible()
  expect(screen.queryByText('No completions in the last year')).toBeNull()
  expect(screen.queryByText('No completions in this period.')).toBeNull()
  expect(
    screen.getByText('Recent activity is showing the last loaded data.'),
  ).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Activity' }).parentElement,
  ).toHaveTextContent('0 completed')
  expect(heatmap).toHaveBeenCalledTimes(1)

  // Act — reconnect to resume the paused refresh.
  await act(async () => onlineManager.setOnline(true))

  // Assert
  expect(
    await screen.findByText('No completions in the last year'),
  ).toBeVisible()
  client.clear()
})

test('a Sunday recap dismissed without storage stays dismissed after a failed refresh and recovery', async () => {
  // Arrange
  vi.setSystemTime(new Date(2026, 9, 4, 12))
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Dismiss the Sunday recap until next week',
    }),
  )
  expect(screen.queryByText('a quiet sunday recap')).toBeNull()

  // Act
  heatmap.mockRejectedValueOnce(new Error('network down'))
  await act(async () => {
    await client.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
  })
  expect(
    await screen.findByText(
      'Activity could not refresh. Showing the last loaded data.',
    ),
  ).toBeVisible()
  expect(
    screen.getByText('Recent activity is showing the last loaded data.'),
  ).toBeVisible()
  expect(screen.queryByText('No completions in this period.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }))

  // Assert
  await waitFor(() =>
    expect(screen.getByText('No completions in the last year')).toBeVisible(),
  )
  expect(screen.queryByText('a quiet sunday recap')).toBeNull()
  client.clear()
})

test('an activity response started before midnight cannot confirm an empty new period', async ({
  onTestFinished,
}) => {
  // Arrange
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 1, 23, 59, 58))
  const svgWidth = Object.getOwnPropertyDescriptor(
    SVGElement.prototype,
    'clientWidth',
  )
  Object.defineProperty(SVGElement.prototype, 'clientWidth', {
    configurable: true,
    value: 850,
  })
  onTestFinished(() => {
    if (svgWidth)
      Object.defineProperty(SVGElement.prototype, 'clientWidth', svgWidth)
    else Reflect.deleteProperty(SVGElement.prototype, 'clientWidth')
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 640, 160),
  )
  const oldSnapshot = {
    data: [{ date: '2026-09-25', count: 1, categories: [] }],
    total: 1,
    streaks: { current: 0, longest: 1 },
    throughDate: '2026-10-01',
  }
  const delayedRefresh = Promise.withResolvers<typeof oldSnapshot>()
  heatmap
    .mockResolvedValueOnce(oldSnapshot)
    .mockReturnValue(delayedRefresh.promise)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const { container } = render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(screen.getByText('Daily completions')).toBeVisible()
  expect(container.querySelector('rect[data-date="2026/10/1"]')).toBeVisible()
  fireEvent(window, new Event('focus'))
  expect(heatmap).toHaveBeenCalledTimes(2)

  // Act — cross midnight while the previous day's request is still in flight.
  await act(async () => vi.advanceTimersByTimeAsync(2_000))

  // Assert
  expect(screen.queryByText('Oct 2, 2026')).toBeNull()
  expect(screen.queryByRole('option', { name: /Oct 2, 2026/ })).toBeNull()
  expect(container.querySelector('rect[data-date="2026/10/2"]')).toBeNull()
  expect(container.querySelector('rect[data-date="2026/10/1"]')).toBeVisible()
  expect(screen.queryByText('No completions in this period.')).toBeNull()
  expect(
    screen.getByText('Recent activity is showing the last loaded data.'),
  ).toBeVisible()

  // Act — receiving it today does not change the day that the response covers.
  await act(async () =>
    delayedRefresh.resolve({
      ...oldSnapshot,
      data: [],
      total: 0,
    }),
  )
  await act(async () => vi.advanceTimersByTimeAsync(1))

  // Assert
  expect(
    screen.getByRole('heading', { name: 'Activity' }).parentElement,
  ).toHaveTextContent('0 completed')
  expect(screen.queryByText('No completions in this period.')).toBeNull()
  expect(screen.queryByText('No completions in the last year')).toBeNull()
  expect(
    screen.getByText('Recent activity is showing the last loaded data.'),
  ).toBeVisible()

  // Act
  heatmap.mockResolvedValue({ ...EMPTY_HEATMAP, throughDate: '2026-10-02' })
  await act(async () =>
    vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS),
  )

  // Assert
  expect(heatmap).toHaveBeenCalledTimes(3)
  expect(screen.getByText('No completions in this period.')).toBeVisible()
  expect(screen.getByText('No completions in the last year')).toBeVisible()
  expect(
    screen.getByRole('option', { name: 'Oct 2, 2026 · Rest day' }),
  ).toBeVisible()
  expect(
    screen.queryByText('Recent activity is showing the last loaded data.'),
  ).toBeNull()
  client.clear()
})

test('a restored activity snapshot without date coverage shows no rest days until refresh', async () => {
  // Arrange
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  client.setQueryData(
    orpc.completed.heatmap.key({
      input: { days: 365, timezone },
      type: 'query',
    }),
    {
      data: [{ date: '2026-10-01', count: 1, categories: [] }],
      total: 1,
      streaks: { current: 1, longest: 1 },
    },
  )
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )

  // Assert
  expect(
    screen.getByText('Activity is showing the last loaded data.'),
  ).toBeVisible()
  expect(screen.getByText('1 completed')).toBeVisible()
  expect(screen.queryByText('Less')).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Day to view' })).toBeNull()

  // Act
  fireEvent(window, new Event('focus'))

  // Assert
  expect(
    await screen.findByText('No completions in this period.'),
  ).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Day to view' })).toBeVisible()
  client.clear()
})

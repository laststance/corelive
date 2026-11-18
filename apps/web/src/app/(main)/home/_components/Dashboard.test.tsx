// Value: protects=Home heatmap refresh while the desktop app writes elsewhere; fails_when=Dashboard stops mounting useDashboardFreshness (silent staleness); why_new=hook test never renders Dashboard; seam=none; no_claim=card layout, loading copy and the journal change check (hook test)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'

import { Dashboard } from './Dashboard'
import { DASHBOARD_REFRESH_INTERVAL_MS } from './useDashboardFreshness'

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))
const { useHeatmapData } = vi.hoisted(() => ({ useHeatmapData: vi.fn() }))

vi.mock('@/hooks/useHeatmapData', () => ({ useHeatmapData }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./CompletedTodos', () => ({
  CompletedTodos: () => <div>journal-card</div>,
}))
vi.mock('./DayDetailDialog', () => ({ DayDetailDialog: () => null }))
vi.mock('./SundayDigestCard', () => ({ SundayDigestCard: () => null }))
vi.mock('./YearInReviewModal', () => ({ YearInReviewModal: () => null }))

beforeEach(() => {
  useHeatmapData.mockReturnValue({
    dataByDate: new Map(),
    heatmapValues: [],
    total: 0,
    hasData: true,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })
  vi.useFakeTimers()
  // Network never answers, so no real request leaves the test.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Promise<Response>(() => {})),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Dashboard', () => {
  test('re-reads the activity heatmap on its own while Home stays open', async () => {
    // Arrange
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    const heatmapKey = orpc.completed.heatmap.key()
    client.setQueryData(heatmapKey, { fixture: 'old heatmap' })
    render(
      <QueryClientProvider client={client}>
        <Dashboard />
      </QueryClientProvider>,
    )
    await act(async () => {})
    expect(screen.getByText('journal-card')).toBeVisible()
    expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(false)

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS)
    })

    // Assert
    expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(true)
  })
})

test('a failed activity request can be retried while the journal stays visible', async () => {
  // Arrange
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const activity = useHeatmapData()
  const refetch = vi.fn()
  useHeatmapData.mockReturnValue({
    ...activity,
    hasData: false,
    isLoading: true,
    refetch,
  })
  const dashboard = (
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>
  )
  const { rerender } = render(dashboard)
  await act(async () => {})
  expect(screen.getByText('Loading activity…')).toBeVisible()
  expect(screen.getByText('journal-card')).toBeVisible()
  expect(screen.queryByText('No completions in the last year')).toBeNull()

  // Act
  useHeatmapData.mockReturnValue({
    ...activity,
    hasData: false,
    isError: true,
    refetch,
  })
  rerender(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }))

  // Assert
  expect(refetch).toHaveBeenCalledOnce()
  expect(screen.getByText('Activity could not load.')).toBeVisible()
  expect(screen.getByText('journal-card')).toBeVisible()
  expect(screen.queryByText('No completions in the last year')).toBeNull()
  expect(screen.queryByText('Recent activity')).toBeNull()

  useHeatmapData.mockReturnValue(activity)
  rerender(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
  await act(async () => {})
  expect(screen.getByText('No completions in the last year')).toBeVisible()
  expect(screen.getByRole('link', { name: /Get Mac app/ })).toBeVisible()
})

// Value: protects=Home heatmap refresh while the desktop app writes elsewhere; fails_when=Dashboard stops mounting useDashboardFreshness (silent staleness); why_new=hook test never renders Dashboard; seam=none; no_claim=card layout, loading copy and the journal change check (hook test)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'

import { Dashboard } from './Dashboard'
import { DASHBOARD_REFRESH_INTERVAL_MS } from './useDashboardFreshness'

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))
vi.mock('@/hooks/useHeatmapData', () => ({
  useHeatmapData: () => ({ dataByDate: new Map(), isLoading: false }),
}))
vi.mock('./CompletedTodos', () => ({
  CompletedTodos: () => <div>journal-card</div>,
}))
vi.mock('./ContributionGraph', () => ({ ContributionGraph: () => null }))
vi.mock('./SundayDigestCard', () => ({ SundayDigestCard: () => null }))
vi.mock('./WeeklySummaryCard', () => ({ WeeklySummaryCard: () => null }))
vi.mock('./YearInReviewModal', () => ({ YearInReviewModal: () => null }))

beforeEach(() => {
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

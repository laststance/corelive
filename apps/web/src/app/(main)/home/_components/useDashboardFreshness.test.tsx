import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'

import {
  DASHBOARD_REFRESH_INTERVAL_MS,
  useDashboardFreshness,
} from './useDashboardFreshness'

const INTERVAL_MS = 1_000
/** One refresh invalidates the category list, heatmap, day detail and home bootstrap. */
const INVALIDATIONS_PER_REFRESH = 4

/**
 * Pins `document.visibilityState` for the spec.
 * @param state - The visibility the document should report.
 * @returns Nothing.
 * @example
 * setVisibility('hidden')
 */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

/**
 * Mounts the hook under a fresh QueryClient.
 * @param intervalMs - Polling period handed to the hook.
 * @returns The QueryClient the hook invalidates.
 * @example
 * const client = mountFreshness(INTERVAL_MS)
 */
function mountFreshness(intervalMs: number = INTERVAL_MS): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  renderHook(() => useDashboardFreshness(intervalMs), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  return client
}

/**
 * Makes the next refresh of one cached view come back with different data, as a new completion would.
 * @param client - The client the hook refreshes.
 * @param changedKey - The view whose refetch returns `changedData`.
 * @param changedData - What the refetch stores.
 * @returns Nothing; later invalidations pass through to the real client.
 * @example
 * changeDataOnRefresh(client, orpc.completed.heatmap.key(), { total: 2 })
 */
function changeDataOnRefresh(
  client: QueryClient,
  changedKey: readonly unknown[],
  changedData: unknown,
): void {
  const invalidate = client.invalidateQueries.bind(client)
  vi.spyOn(client, 'invalidateQueries').mockImplementation(
    async (filters, options) => {
      // Stand in for the refetch: the server answers with newer data.
      if (JSON.stringify(filters?.queryKey) === JSON.stringify(changedKey))
        client.setQueryData(changedKey, changedData)
      return invalidate(filters, options)
    },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  setVisibility('visible')
})

describe('useDashboardFreshness', () => {
  test('defaults to refreshing every 15 seconds', () => {
    // Arrange / Act / Assert
    expect(DASHBOARD_REFRESH_INTERVAL_MS).toBe(15_000)
  })

  test('marks the activity heatmap stale after one visible interval', async () => {
    // Arrange
    const client = mountFreshness()
    const heatmapKey = orpc.completed.heatmap.key()
    client.setQueryData(heatmapKey, { total: 1 })

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    })

    // Assert
    expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(true)
  })

  test('leaves the loaded journal pages alone when no completion moved', async () => {
    // Arrange
    const client = mountFreshness()
    const journalKey = orpc.completed.journal.key()
    client.setQueryData(orpc.completed.heatmap.key(), { total: 1 })
    client.setQueryData(journalKey, { fixture: 'three loaded pages' })

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    })

    // Assert
    expect(client.getQueryState(journalKey)?.isInvalidated).toBe(false)
  })

  test('re-reads the journal when the refreshed heatmap shows a new completion', async () => {
    // Arrange
    const client = mountFreshness()
    const heatmapKey = orpc.completed.heatmap.key()
    const journalKey = orpc.completed.journal.key()
    client.setQueryData(heatmapKey, { total: 1 })
    client.setQueryData(journalKey, { fixture: 'old journal' })
    changeDataOnRefresh(client, heatmapKey, { total: 2 })

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    })

    // Assert
    expect(client.getQueryState(journalKey)?.isInvalidated).toBe(true)
  })

  test('re-reads the journal when the refreshed category list changed', async () => {
    // Arrange
    const client = mountFreshness()
    const categoryKey = orpc.category.list.key()
    const journalKey = orpc.completed.journal.key()
    client.setQueryData(categoryKey, { categories: ['General', 'Reading'] })
    client.setQueryData(journalKey, { fixture: 'old journal' })
    changeDataOnRefresh(client, categoryKey, { categories: ['General'] })

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    })

    // Assert
    expect(client.getQueryState(journalKey)?.isInvalidated).toBe(true)
  })

  test('does not refresh while the document is hidden', async () => {
    // Arrange
    setVisibility('hidden')
    const client = mountFreshness()
    const heatmapKey = orpc.completed.heatmap.key()
    client.setQueryData(heatmapKey, { total: 1 })

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)
    })

    // Assert
    expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(false)
  })

  test('refreshes when the window regains focus', async () => {
    // Arrange
    const client = mountFreshness()
    const heatmapKey = orpc.completed.heatmap.key()
    client.setQueryData(heatmapKey, { total: 1 })

    // Act
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    // Assert
    expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(true)
  })

  test('refreshes when the tab becomes visible again', async () => {
    // Arrange
    const client = mountFreshness()
    const heatmapKey = orpc.completed.heatmap.key()
    client.setQueryData(heatmapKey, { total: 1 })

    // Act
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Assert
    expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(true)
  })

  test('drops interval, focus and visibility triggers that arrive during one pending refresh', async () => {
    // Arrange
    const client = mountFreshness()
    const pendingRefresh = Promise.withResolvers<void>()
    const spy = vi
      .spyOn(client, 'invalidateQueries')
      .mockReturnValue(pendingRefresh.promise)

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Assert
    expect(spy).toHaveBeenCalledTimes(INVALIDATIONS_PER_REFRESH)
    await act(async () => pendingRefresh.resolve())
  })

  test('keeps polling activity without restarting a pending day detail request', async () => {
    // Arrange
    const client = mountFreshness()
    const heatmapKey = orpc.completed.heatmap.key()
    const dayDetailKey = orpc.completed.dayDetail.key()
    client.setQueryData(heatmapKey, { total: 1 })
    client.setQueryData(dayDetailKey, { count: 1 })
    const pendingDay = Promise.withResolvers<{ count: number }>()
    const abortDay = vi.fn()
    const readDay = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      signal.addEventListener('abort', abortDay)
      return pendingDay.promise
    })
    const readHeatmap = vi.fn(async () => ({ total: 1 }))
    const unsubscribeDay = new QueryObserver(client, {
      queryKey: dayDetailKey,
      queryFn: readDay,
    }).subscribe(() => undefined)
    const unsubscribeHeatmap = new QueryObserver(client, {
      queryKey: heatmapKey,
      queryFn: readHeatmap,
    }).subscribe(() => undefined)

    try {
      // Act
      await act(async () => vi.advanceTimersByTimeAsync(INTERVAL_MS * 3))

      // Assert
      expect(readHeatmap).toHaveBeenCalledTimes(3)
      expect(readDay).toHaveBeenCalledOnce()
      expect(abortDay).not.toHaveBeenCalled()

      // Act
      await act(async () => pendingDay.resolve({ count: 2 }))

      // Assert
      expect(client.getQueryData(dayDetailKey)).toEqual({ count: 2 })
    } finally {
      unsubscribeDay()
      unsubscribeHeatmap()
      client.clear()
    }
  })

  test('refreshes again on the next trigger after a rejected refresh', async () => {
    // Arrange
    const client = mountFreshness()
    const spy = vi
      .spyOn(client, 'invalidateQueries')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(spy).toHaveBeenCalledTimes(INVALIDATIONS_PER_REFRESH)

    // Act
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    // Assert
    expect(spy).toHaveBeenCalledTimes(INVALIDATIONS_PER_REFRESH * 2)
  })
})

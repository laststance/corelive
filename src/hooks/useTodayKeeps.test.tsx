/**
 * @fileoverview Today's count source switch. If these fail, the ember shows a
 * stranger the wrong number, shows a signed-in user 0 while offline, forgets
 * keeps made before sign-in, or keeps counting yesterday after midnight.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_COMPLETIONS_STORAGE_KEY } from '@/lib/live-editor/constants'
import { addLocalCompletion } from '@/lib/live-editor/localCompletionStore'

import { useTodayKeeps } from './useTodayKeeps'

const { clerkUserRef, heatmapQueryFn, dayKeyRef } = vi.hoisted(() => ({
  clerkUserRef: {
    current: { isLoaded: true, isSignedIn: false } as {
      isLoaded: boolean
      isSignedIn: boolean | undefined
    },
  },
  heatmapQueryFn: vi.fn(),
  dayKeyRef: { current: null as string | null },
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Real TanStack query over a fake heatmap fetch; the key mirrors the real
// utils' shape so it is the entry useCompletionWriter bumps.
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      heatmap: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ['completed', 'heatmap', { input }],
          queryFn: heatmapQueryFn,
        }),
      },
    },
  },
}))

// The local calendar day, overridable per spec to stand at "after midnight".
vi.mock('./useLocalDayKey', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    useLocalDayKey: () =>
      dayKeyRef.current ?? (original.useLocalDayKey as () => string)(),
  }
})

/**
 * Renders the hook inside a fresh QueryClient (no retries, so a failed fetch settles fast).
 * @returns The hook result handle.
 * @example
 * const { result } = renderTodayKeeps()
 */
function renderTodayKeeps() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { ...renderHook(() => useTodayKeeps(), { wrapper }), queryClient }
}

const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  clerkUserRef.current = { isLoaded: true, isSignedIn: false }
  dayKeyRef.current = null
  heatmapQueryFn.mockReset()
})

describe('useTodayKeeps — signed out, the device store', () => {
  it("counts only today's device keeps and moves the moment a line is kept", () => {
    // Arrange — two today, one three days ago.
    addLocalCompletion('one')
    addLocalCompletion('two')
    addLocalCompletion('old', new Date(Date.now() - 3 * DAY_MS))
    const { result } = renderTodayKeeps()
    expect(result.current).toBe(2)

    // Act — a keep lands (same tab, synchronous notify).
    act(() => {
      addLocalCompletion('three')
    })

    // Assert
    expect(result.current).toBe(3)
  })

  it('hears another tab keep a line (storage event) so both embers agree', () => {
    // Arrange
    const { result } = renderTodayKeeps()
    expect(result.current).toBe(0)

    // Act — the other tab wrote the key directly.
    act(() => {
      localStorage.setItem(
        LOCAL_COMPLETIONS_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          items: [
            {
              id: 'other-tab',
              title: 'from the other tab',
              completedAt: new Date().toISOString(),
            },
          ],
        }),
      )
      window.dispatchEvent(
        new StorageEvent('storage', { key: LOCAL_COMPLETIONS_STORAGE_KEY }),
      )
    })

    // Assert
    expect(result.current).toBe(1)
  })

  it("leaves yesterday's keeps behind once the local day rolls over", () => {
    // Arrange — one keep "today", then the clock passes midnight.
    addLocalCompletion('before midnight')
    dayKeyRef.current = '2099-01-01'

    // Act
    const { result } = renderTodayKeeps()

    // Assert
    expect(result.current).toBe(0)
  })
})

describe('useTodayKeeps — signed in, the account', () => {
  it("adds the account's total to keeps made on this device before sign-in that have not merged yet", async () => {
    // Arrange — server says 2; the device holds one unmerged and one merged keep today.
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
    heatmapQueryFn.mockResolvedValue({
      total: 2,
      data: [],
      streaks: { current: 1, longest: 1 },
    })
    addLocalCompletion('unmerged')
    localStorage.setItem(
      LOCAL_COMPLETIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'a',
            title: 'unmerged',
            completedAt: new Date().toISOString(),
          },
          {
            id: 'b',
            title: 'merged',
            completedAt: new Date().toISOString(),
            mergedBatchId: 'batch-1',
          },
        ],
      }),
    )

    // Act
    const { result } = renderTodayKeeps()

    // Assert — resolving first, then 2 + 1.
    expect(result.current).toBeUndefined()
    await waitFor(() => {
      expect(result.current).toBe(3)
    })
  })

  it('flags the account query as never-persisted, so a total from an older day cannot be replayed as today', async () => {
    // Arrange
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
    heatmapQueryFn.mockResolvedValue({
      total: 1,
      data: [],
      streaks: { current: 1, longest: 1 },
    })

    // Act
    const { result, queryClient } = renderTodayKeeps()
    await waitFor(() => {
      expect(result.current).toBe(1)
    })

    // Assert
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.meta),
    ).toEqual([{ persist: false }])
  })

  it("drops yesterday's total when the local day rolls over under a mounted editor, instead of counting it as today", async () => {
    // Arrange — an editor left open overnight: 4 keeps yesterday, 0 so far today.
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
    heatmapQueryFn.mockResolvedValue({
      total: 4,
      data: [],
      streaks: { current: 1, longest: 1 },
    })
    dayKeyRef.current = '2099-01-01'
    const { result, rerender } = renderTodayKeeps()
    await waitFor(() => {
      expect(result.current).toBe(4)
    })
    heatmapQueryFn.mockResolvedValue({
      total: 0,
      data: [],
      streaks: { current: 0, longest: 1 },
    })

    // Act — local midnight passes; nothing remounts, refocuses or reconnects.
    dayKeyRef.current = '2099-01-02'
    await act(async () => {
      rerender()
    })

    // Assert — today's number, never yesterday's.
    await waitFor(() => {
      expect(result.current).toBe(0)
    })
  })

  it('reports null — not 0 — when the fetch fails with nothing cached', async () => {
    // Arrange
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
    heatmapQueryFn.mockRejectedValue(new Error('offline'))

    // Act
    const { result } = renderTodayKeeps()

    // Assert
    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('stays undefined while Clerk has not loaded, so nothing is claimed too early', () => {
    // Arrange
    clerkUserRef.current = { isLoaded: false, isSignedIn: undefined }
    addLocalCompletion('one')

    // Act
    const { result } = renderTodayKeeps()

    // Assert
    expect(result.current).toBeUndefined()
    expect(heatmapQueryFn).not.toHaveBeenCalled()
  })

  it('never fetches the account total while signed out', () => {
    // Arrange / Act
    renderTodayKeeps()

    // Assert
    expect(heatmapQueryFn).not.toHaveBeenCalled()
  })
})

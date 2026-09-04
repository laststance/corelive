/**
 * @fileoverview The one write seam for LiveEditor keeps. If these fail, a keep
 * lands in the wrong store, the Today Ember moves late (or moves on a failure),
 * or an Undo after sign-in tries to delete a local uuid from the server.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import type * as LocalTodayIsoDateModule from '@/lib/getLocalTodayIsoDate'
import { LOCAL_COMPLETIONS_STORAGE_KEY } from '@/lib/live-editor/constants'
import { parseLocalCompletions } from '@/lib/live-editor/localCompletionStore'
import { getTodayHeatmapQueryKey } from '@/lib/query/todayHeatmapQuery'

import { useCompletionWriter } from './useCompletionWriter'

const { clerkUserRef, createCompletedFn, deleteCompletedFn, localDayRef } =
  vi.hoisted(() => ({
    clerkUserRef: { current: { isSignedIn: true } },
    createCompletedFn: vi.fn(),
    deleteCompletedFn: vi.fn(),
    localDayRef: { current: null as string | null },
  }))

// Real by default; a spec that needs to cross midnight sets `localDayRef`.
vi.mock('@/lib/getLocalTodayIsoDate', async (importOriginal) => {
  const actual = await importOriginal<typeof LocalTodayIsoDateModule>()
  return {
    ...actual,
    getLocalTodayIsoDate: () =>
      localDayRef.current ?? actual.getLocalTodayIsoDate(),
  }
})

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Real TanStack `useMutation` over fake mutation functions; the heatmap key
// mirrors the real utils' shape so the cache bump targets the same entry
// `useHeatmapData(1)` reads.
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      create: {
        mutationOptions: () => ({ mutationFn: createCompletedFn }),
      },
      delete: {
        mutationOptions: () => ({ mutationFn: deleteCompletedFn }),
      },
      heatmap: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ['completed', 'heatmap', { input }],
        }),
      },
    },
  },
}))

// The READER's key, built by the same function `useTodayKeeps` calls (over the
// mocked orpc above) rather than re-typed here: a bump that lands on a
// hand-copied literal proves nothing once the real key's shape drifts.
const todayHeatmapKey = getTodayHeatmapQueryKey(getLocalTodayIsoDate())

type CachedHeatmap = { total: number }

/**
 * Renders the writer inside a fresh QueryClient seeded with today's cached total.
 * @param cachedTotal - Today's total to seed, or null to leave the cache empty.
 * @returns The hook result plus the client for cache assertions.
 * @example
 * const { writer, queryClient } = renderWriter(2)
 */
function renderWriter(cachedTotal: number | null) {
  const queryClient = new QueryClient()
  if (cachedTotal !== null) {
    queryClient.setQueryData<CachedHeatmap>(todayHeatmapKey, {
      total: cachedTotal,
    })
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCompletionWriter(), { wrapper })
  return { writer: result.current, queryClient }
}

/**
 * Reads today's cached total back.
 * @param queryClient - The client the writer wrote to.
 * @returns The cached total, or undefined when nothing is cached.
 * @example
 * readCachedTotal(queryClient) // => 3
 */
function readCachedTotal(queryClient: QueryClient): number | undefined {
  return queryClient.getQueryData<CachedHeatmap>(todayHeatmapKey)?.total
}

beforeEach(() => {
  localStorage.clear()
  clerkUserRef.current = { isSignedIn: true }
  localDayRef.current = null
  createCompletedFn.mockReset()
  deleteCompletedFn.mockReset()
})

describe('useCompletionWriter — where a keep lands', () => {
  it('signed in, records the keep on the account and moves the ember up before any refetch', async () => {
    // Arrange
    createCompletedFn.mockResolvedValue({ id: 42 })
    const { writer, queryClient } = renderWriter(2)

    // Act
    const created = await writer.create({ categoryId: 1, title: 'buy milk' })

    // Assert
    expect(created).toEqual({ id: 42 })
    expect(createCompletedFn).toHaveBeenCalledWith(
      { categoryId: 1, title: 'buy milk' },
      expect.anything(),
    )
    expect(readCachedTotal(queryClient)).toBe(3)
    expect(localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY)).toBeNull()
  })

  it('leaves the ember untouched when the account write fails', async () => {
    // Arrange
    createCompletedFn.mockRejectedValue(new Error('offline'))
    const { writer, queryClient } = renderWriter(2)

    // Act / Assert
    await expect(
      writer.create({ categoryId: 1, title: 'buy milk' }),
    ).rejects.toThrow('offline')
    expect(readCachedTotal(queryClient)).toBe(2)
  })

  it('undo of an account keep deletes the row and moves the ember back down', async () => {
    // Arrange — the real Undo path: the toast only offers ids `create` returned.
    createCompletedFn.mockResolvedValue({ id: 42 })
    deleteCompletedFn.mockResolvedValue({ success: true })
    const { writer, queryClient } = renderWriter(2)
    await writer.create({ categoryId: 1, title: 'buy milk' })

    // Act
    await writer.remove({ id: 42 })

    // Assert
    expect(deleteCompletedFn).toHaveBeenCalledWith(
      { id: 42 },
      expect.anything(),
    )
    expect(readCachedTotal(queryClient)).toBe(2)
  })

  it('undo just after local midnight takes the keep off yesterday, not off today', async () => {
    // Arrange — keep filed on the 5th, Undo pressed on the 6th.
    createCompletedFn.mockResolvedValue({ id: 42 })
    deleteCompletedFn.mockResolvedValue({ success: true })
    localDayRef.current = '2099-01-05'
    const { writer, queryClient } = renderWriter(null)
    queryClient.setQueryData<CachedHeatmap>(
      getTodayHeatmapQueryKey('2099-01-05'),
      { total: 4 },
    )
    queryClient.setQueryData<CachedHeatmap>(
      getTodayHeatmapQueryKey('2099-01-06'),
      { total: 1 },
    )
    await writer.create({ categoryId: 1, title: 'buy milk' })
    localDayRef.current = '2099-01-06'

    // Act
    await writer.remove({ id: 42 })

    // Assert — yesterday absorbs both the +1 and the −1; today is untouched.
    expect(
      queryClient.getQueryData<CachedHeatmap>(
        getTodayHeatmapQueryKey('2099-01-05'),
      )?.total,
    ).toBe(4)
    expect(
      queryClient.getQueryData<CachedHeatmap>(
        getTodayHeatmapQueryKey('2099-01-06'),
      )?.total,
    ).toBe(1)
  })

  it('leaves the ember alone when undoing a keep it never saw created', async () => {
    // Arrange — no remembered day (a reload between keep and Undo); there is
    // nothing safe to decrement, so the ember waits for the refetch.
    deleteCompletedFn.mockResolvedValue({ success: true })
    const { writer, queryClient } = renderWriter(3)

    // Act
    await writer.remove({ id: 42 })

    // Assert
    expect(deleteCompletedFn).toHaveBeenCalledWith(
      { id: 42 },
      expect.anything(),
    )
    expect(readCachedTotal(queryClient)).toBe(3)
  })

  it('never invents a cached total when nothing was fetched yet', async () => {
    // Arrange
    createCompletedFn.mockResolvedValue({ id: 42 })
    const { writer, queryClient } = renderWriter(null)

    // Act
    await writer.create({ categoryId: 1, title: 'buy milk' })

    // Assert
    expect(readCachedTotal(queryClient)).toBeUndefined()
  })

  it('signed out, keeps the line on this device and never calls the server', async () => {
    // Arrange
    clerkUserRef.current = { isSignedIn: false }
    const { writer } = renderWriter(null)

    // Act
    const created = await writer.create({ categoryId: 0, title: 'buy milk' })

    // Assert
    expect(typeof created.id).toBe('string')
    expect(createCompletedFn).not.toHaveBeenCalled()
    expect(
      parseLocalCompletions(
        localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
      ).map((item) => item.title),
    ).toEqual(['buy milk'])
  })

  it('undo of a device-local keep removes it locally even after signing in', async () => {
    // Arrange: the keep was made signed out, then the user signed in.
    clerkUserRef.current = { isSignedIn: false }
    const { writer: signedOutWriter } = renderWriter(null)
    const created = await signedOutWriter.create({
      categoryId: 0,
      title: 'buy milk',
    })
    clerkUserRef.current = { isSignedIn: true }
    const { writer } = renderWriter(1)

    // Act
    await writer.remove({ id: created.id })

    // Assert
    expect(deleteCompletedFn).not.toHaveBeenCalled()
    expect(
      parseLocalCompletions(
        localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
      ),
    ).toEqual([])
  })
})

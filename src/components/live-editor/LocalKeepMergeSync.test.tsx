/**
 * @fileoverview The one-time sign-in merge that carries a visitor's signed-out
 * `/write` keeps into their new account. If these fail, someone loses the
 * history they earned before signing up, sees it counted twice, or watches the
 * Today Ember drop to zero the moment they sign in.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import {
  LOCAL_COMPLETIONS_STORAGE_KEY,
  LOCAL_PENDING_MERGE_SCHEMA_VERSION,
  LOCAL_PENDING_MERGE_STORAGE_KEY,
} from '@/lib/live-editor/constants'
import { parseLocalCompletions } from '@/lib/live-editor/localCompletionStore'
import { getTodayHeatmapQueryKey } from '@/lib/query/todayHeatmapQuery'

import { LocalKeepMergeSync } from './LocalKeepMergeSync'

const { clerkUserRef, importLocalFn } = vi.hoisted(() => ({
  clerkUserRef: { current: { isLoaded: true, isSignedIn: true } },
  importLocalFn: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Real TanStack `useMutation` over a fake mutation function; the heatmap key
// mirrors the real utils' shape so the cache bump targets the same entry
// `useTodayKeeps` reads.
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      key: () => ['completed'],
      importLocal: {
        mutationOptions: () => ({ mutationFn: importLocalFn }),
      },
      heatmap: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ['completed', 'heatmap', { input }],
        }),
      },
    },
  },
}))

const todayHeatmapKey = getTodayHeatmapQueryKey(getLocalTodayIsoDate())

type StoredKeep = {
  id: string
  title: string
  completedAt: string
  mergedBatchId?: string
}

/**
 * Seeds the device-local completions file.
 * @param items - Keeps to store, in the shape the real store writes.
 * @example
 * seedLocalKeeps([{ id: 'a', title: 'milk', completedAt: new Date().toISOString() }])
 */
function seedLocalKeeps(items: StoredKeep[]): void {
  window.localStorage.setItem(
    LOCAL_COMPLETIONS_STORAGE_KEY,
    JSON.stringify({ version: 1, items }),
  )
}

/** Reads the stored keeps back, so a spec can assert exactly which ones got tagged. */
function readStoredKeeps(): StoredKeep[] {
  return parseLocalCompletions(
    window.localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
  )
}

/**
 * Renders the merge component inside a fresh QueryClient seeded with today's total.
 * @param cachedTotal - Today's cached account total, or null to leave the cache empty.
 * @returns The client, for cache assertions.
 * @example
 * const queryClient = renderMergeSync(2)
 */
function renderMergeSync(cachedTotal: number | null): QueryClient {
  const queryClient = new QueryClient()
  if (cachedTotal !== null) {
    queryClient.setQueryData(todayHeatmapKey, {
      data: [],
      streaks: { current: 0, longest: 0 },
      total: cachedTotal,
    })
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  render(<LocalKeepMergeSync />, { wrapper })
  return queryClient
}

describe('LocalKeepMergeSync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    importLocalFn.mockReset()
    importLocalFn.mockResolvedValue({
      batchId: 'server-echo',
      imported: 1,
      alreadyImported: false,
    })
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }
  })

  it('sends a signed-out visitor every unmerged keep once they sign in', async () => {
    // Arrange
    const completedAt = new Date().toISOString()
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt },
      { id: 'b', title: 'push-ups', completedAt },
    ])

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(1))
    // TanStack passes (variables, context) to mutationFn; only the first matters.
    const [sent] = importLocalFn.mock.calls[0] ?? []
    expect(sent).toEqual({
      batchId: expect.any(String),
      items: [
        { title: 'push-ups', completedAt: new Date(completedAt) },
        { title: 'push-ups', completedAt: new Date(completedAt) },
      ],
    })
  })

  it('leaves the account alone for a visitor who never signed in', async () => {
    // Arrange
    clerkUserRef.current = { isLoaded: true, isSignedIn: false }
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => expect(importLocalFn).not.toHaveBeenCalled())
  })

  it('never re-imports keeps that a previous merge already tagged', async () => {
    // Arrange
    seedLocalKeeps([
      {
        id: 'a',
        title: 'push-ups',
        completedAt: new Date().toISOString(),
        mergedBatchId: 'earlier-batch',
      },
    ])

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => expect(importLocalFn).not.toHaveBeenCalled())
  })

  it('resumes an interrupted merge with the original batch, not the keeps added since', async () => {
    // Arrange — the response to batch `pending-1` was lost, so a and b are
    // still untagged; c was written afterwards and belongs to the NEXT batch.
    const completedAt = new Date().toISOString()
    seedLocalKeeps([
      { id: 'a', title: 'read', completedAt },
      { id: 'b', title: 'read', completedAt },
      { id: 'c', title: 'walk', completedAt },
    ])
    window.localStorage.setItem(
      LOCAL_PENDING_MERGE_STORAGE_KEY,
      JSON.stringify({
        version: LOCAL_PENDING_MERGE_SCHEMA_VERSION,
        batchId: 'pending-1',
        ids: ['a', 'b'],
      }),
    )
    importLocalFn.mockResolvedValue({
      batchId: 'pending-1',
      imported: 0,
      alreadyImported: true,
    })

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(1))
    const [sent] = importLocalFn.mock.calls[0] ?? []
    expect(sent).toEqual({
      batchId: 'pending-1',
      items: [
        { title: 'read', completedAt: new Date(completedAt) },
        { title: 'read', completedAt: new Date(completedAt) },
      ],
    })
    await waitFor(() => {
      const stored = readStoredKeeps()
      expect(stored.map((item) => item.mergedBatchId)).toEqual([
        'pending-1',
        'pending-1',
        undefined,
      ])
    })
  })

  it("keeps today's ember steady across the merge instead of dropping to the server's stale total", async () => {
    // Arrange — two keeps made today, currently counted locally; the cached
    // account total does not include them yet.
    const completedAt = new Date().toISOString()
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt },
      { id: 'b', title: 'push-ups', completedAt },
    ])
    importLocalFn.mockResolvedValue({
      batchId: 'fresh',
      imported: 2,
      alreadyImported: false,
    })

    // Act
    const queryClient = renderMergeSync(3)

    // Assert
    await waitFor(() => {
      const cached = queryClient.getQueryData<{ total: number }>(
        todayHeatmapKey,
      )
      expect(cached?.total).toBe(5)
    })
  })

  it("drops the heatmap fetch that started before the import, so a total short by the batch can't land afterwards", async () => {
    // Arrange
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])
    const queryClient = new QueryClient()
    const order: string[] = []
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => {
      order.push('cancel')
    })
    importLocalFn.mockImplementation(async () => {
      order.push('import')
      return { batchId: 'fresh', imported: 1, alreadyImported: false }
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // Act
    render(<LocalKeepMergeSync />, { wrapper })

    // Assert
    await waitFor(() => {
      expect(readStoredKeeps()[0]?.mergedBatchId).toEqual(expect.any(String))
    })
    expect(order).toEqual(['import', 'cancel'])
  })

  it('does not double-count a batch the server had already imported', async () => {
    // Arrange
    const completedAt = new Date().toISOString()
    seedLocalKeeps([{ id: 'a', title: 'push-ups', completedAt }])
    importLocalFn.mockResolvedValue({
      batchId: 'fresh',
      imported: 0,
      alreadyImported: true,
    })

    // Act
    const queryClient = renderMergeSync(4)

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(1))
    expect(
      queryClient.getQueryData<{ total: number }>(todayHeatmapKey)?.total,
    ).toBe(4)
  })

  it('waits for the refetch rather than painting a total when a resumed batch was already imported', async () => {
    // Arrange
    // The resume path runs on a FRESH page load, so the today-heatmap cache is
    // empty and the rows already sit in the account from the interrupted
    // attempt. Inventing a total here would paint a number nobody counted.
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])
    importLocalFn.mockResolvedValue({
      batchId: 'fresh',
      imported: 0,
      alreadyImported: true,
    })

    // Act
    const queryClient = renderMergeSync(null)

    // Assert
    await waitFor(() => {
      expect(readStoredKeeps()[0]?.mergedBatchId).toEqual(expect.any(String))
    })
    expect(queryClient.getQueryData(todayHeatmapKey)).toBeUndefined()
  })

  it('leaves the batch claimed when the import fails so the next session retries it', async () => {
    // Arrange
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])
    importLocalFn.mockRejectedValue(new Error('offline'))

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(
        window.localStorage.getItem(LOCAL_PENDING_MERGE_STORAGE_KEY),
      ).toContain('"ids":["a"]')
    })
    expect(readStoredKeeps()[0]?.mergedBatchId).toBeUndefined()
  })
})

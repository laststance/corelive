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
import { IMPORT_LOCAL_MAX_ITEMS } from '@/server/schemas/completed'

import { LocalKeepMergeSync } from './LocalKeepMergeSync'

const { clerkUserRef, importLocalFn } = vi.hoisted(() => ({
  clerkUserRef: {
    current: {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_a' } as { id: string } | undefined,
    },
  },
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

/** The payload shape `mutationFn` receives, so a spec can size a batch without `any`. */
type ImportPayload = { batchId: string; items: { title: string }[] }

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
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_a' },
    }
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
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: false,
      user: undefined,
    }
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
        clerkId: 'user_a',
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

    // Assert — the resumed request carries a and b only. c merges too, but in a
    // pass of its own under a fresh key; riding along on `pending-1` is what
    // would double-count a and b when that batch turns out to have landed.
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(2))
    const [resumed] = importLocalFn.mock.calls[0] ?? []
    expect(resumed).toEqual({
      batchId: 'pending-1',
      items: [
        { title: 'read', completedAt: new Date(completedAt) },
        { title: 'read', completedAt: new Date(completedAt) },
      ],
    })
    const next = importLocalFn.mock.calls[1]?.[0] as ImportPayload | undefined
    expect(next?.batchId).not.toBe('pending-1')
    expect(next?.items).toEqual([
      { title: 'walk', completedAt: new Date(completedAt) },
    ])
    await waitFor(() => {
      const stored = readStoredKeeps()
      expect(stored.map((item) => item.mergedBatchId)).toEqual([
        'pending-1',
        'pending-1',
        expect.any(String),
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

  it("discards a heatmap answer already in flight when the import landed, so today's count can't fall back", async () => {
    // Arrange — a heatmap request is already running and will answer with the
    // account total from BEFORE the import (3), missing the keep being merged.
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])
    const queryClient = new QueryClient()
    queryClient.setQueryData(todayHeatmapKey, {
      data: [],
      streaks: { current: 0, longest: 0 },
      total: 3,
    })
    let answerStaleFetch = (): void => undefined
    const staleFetch = queryClient.fetchQuery({
      queryKey: todayHeatmapKey,
      queryFn: async () =>
        new Promise((resolve) => {
          answerStaleFetch = () =>
            resolve({
              data: [],
              streaks: { current: 0, longest: 0 },
              total: 3,
            })
        }),
    })
    // Cancelling rejects this promise; production has nobody awaiting it either.
    staleFetch.catch(() => undefined)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // Act
    render(<LocalKeepMergeSync />, { wrapper })
    await waitFor(() => {
      expect(readStoredKeeps()[0]?.mergedBatchId).toEqual(expect.any(String))
    })
    // The stale request answers only now, after the merge already settled.
    answerStaleFetch()
    await staleFetch.catch(() => undefined)

    // Assert — the merged total stands; the stale 3 never overwrote it.
    expect(
      queryClient.getQueryData<{ total: number }>(todayHeatmapKey)?.total,
    ).toBe(4)
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

  it("never files another account's interrupted batch under whoever signs in next", async () => {
    // Arrange — user_a claimed this keep and lost the tab mid-merge, so it may
    // already sit in user_a's account. user_b is the one signing in now.
    seedLocalKeeps([
      { id: 'a', title: 'therapy', completedAt: new Date().toISOString() },
    ])
    window.localStorage.setItem(
      LOCAL_PENDING_MERGE_STORAGE_KEY,
      JSON.stringify({
        version: LOCAL_PENDING_MERGE_SCHEMA_VERSION,
        clerkId: 'user_a',
        batchId: 'a-batch',
        ids: ['a'],
      }),
    )
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_b' },
    }

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => {
      expect(readStoredKeeps()[0]?.mergedBatchId).toBe('a-batch')
    })
    expect(importLocalFn).not.toHaveBeenCalled()
  })

  it('merges a device holding more keeps than one request can carry', async () => {
    // Arrange — one keep more than a single batch may send.
    const completedAt = new Date().toISOString()
    seedLocalKeeps(
      Array.from({ length: IMPORT_LOCAL_MAX_ITEMS + 1 }, (_, index) => ({
        id: `k${index}`,
        title: 'push-ups',
        completedAt,
      })),
    )

    // Act
    renderMergeSync(0)

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(2))
    const first = importLocalFn.mock.calls[0]?.[0] as ImportPayload | undefined
    const second = importLocalFn.mock.calls[1]?.[0] as ImportPayload | undefined
    expect(first?.items).toHaveLength(IMPORT_LOCAL_MAX_ITEMS)
    expect(second?.items).toHaveLength(1)
    await waitFor(() => {
      expect(
        readStoredKeeps().filter((keep) => keep.mergedBatchId === undefined),
      ).toHaveLength(0)
    })
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

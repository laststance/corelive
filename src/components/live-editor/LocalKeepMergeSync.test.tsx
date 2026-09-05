/**
 * @fileoverview The one-time sign-in merge that carries a visitor's signed-out
 * `/write` keeps into their new account. If these fail, someone loses the
 * history they earned before signing up or sees it filed twice.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LOCAL_COMPLETIONS_STORAGE_KEY,
  LOCAL_PENDING_MERGE_SCHEMA_VERSION,
  LOCAL_PENDING_MERGE_STORAGE_KEY,
} from '@/lib/live-editor/constants'
import { parseLocalCompletions } from '@/lib/live-editor/localCompletionStore'
import type {
  ImportLocalInput,
  ImportLocalResponse,
} from '@/server/schemas/completed'

import { LocalKeepMergeSync } from './LocalKeepMergeSync'

const { clerkUserRef, importLocalFn } = vi.hoisted(() => ({
  clerkUserRef: {
    current: {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_a' } as { id: string } | undefined,
    },
  },
  // Typed from the procedure's own schema, so a batch missing a required field
  // fails to compile here instead of passing on a count alone.
  importLocalFn:
    vi.fn<(input: ImportLocalInput) => Promise<ImportLocalResponse>>(),
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Real TanStack `useMutation` over a fake mutation function.
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      key: () => ['completed'],
      importLocal: {
        mutationOptions: () => ({ mutationFn: importLocalFn }),
      },
    },
  },
}))

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
 * Renders the merge component inside a fresh QueryClient.
 * @example
 * renderMergeSync()
 */
function renderMergeSync(): void {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  render(<LocalKeepMergeSync />, { wrapper })
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
    renderMergeSync()

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(1))
    // TanStack passes (variables, context) to mutationFn; only the first matters.
    const [sent] = importLocalFn.mock.calls[0] ?? []
    expect(sent).toEqual({
      batchId: expect.any(String),
      items: [
        { localId: 'a', title: 'push-ups', completedAt: new Date(completedAt) },
        { localId: 'b', title: 'push-ups', completedAt: new Date(completedAt) },
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
    renderMergeSync()

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
    renderMergeSync()

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
    renderMergeSync()

    // Assert — the resumed request carries a and b only. c merges too, but in a
    // pass of its own under a fresh key; riding along on `pending-1` is what
    // would double-count a and b when that batch turns out to have landed.
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(2))
    const [resumed] = importLocalFn.mock.calls[0] ?? []
    expect(resumed).toEqual({
      batchId: 'pending-1',
      items: [
        { localId: 'a', title: 'read', completedAt: new Date(completedAt) },
        { localId: 'b', title: 'read', completedAt: new Date(completedAt) },
      ],
    })
    const next = importLocalFn.mock.calls[1]?.[0]
    expect(next?.batchId).not.toBe('pending-1')
    expect(next?.items).toEqual([
      { localId: 'c', title: 'walk', completedAt: new Date(completedAt) },
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
    renderMergeSync()

    // Assert
    await waitFor(() => {
      expect(readStoredKeeps()[0]?.mergedBatchId).toBe('a-batch')
    })
    expect(importLocalFn).not.toHaveBeenCalled()
  })

  it('merges a device holding more keeps than one request can carry', async () => {
    // Arrange — 2001 keeps: one more than the 2000 a single request may carry.
    // Hard-coded on purpose: if the cap moves, this spec must fail and be
    // re-decided, not silently follow it.
    const completedAt = new Date().toISOString()
    seedLocalKeeps(
      Array.from({ length: 2001 }, (_, index) => ({
        id: `k${index}`,
        title: 'push-ups',
        completedAt,
      })),
    )

    // Act
    renderMergeSync()

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(2))
    const first = importLocalFn.mock.calls[0]?.[0]
    const second = importLocalFn.mock.calls[1]?.[0]
    expect(first?.items).toHaveLength(2000)
    expect(second?.items).toHaveLength(1)
    await waitFor(() => {
      expect(
        readStoredKeeps().filter((keep) => keep.mergedBatchId === undefined),
      ).toHaveLength(0)
    })
  })

  it('still merges when the account arrives a render after the session does', async () => {
    // Arrange — the sign-UP redirect is this component's whole reason to exist,
    // and auth can report "signed in" a render before the user object lands.
    // Latching on that render would burn the one run the new account gets.
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: undefined,
    }
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { rerender } = render(<LocalKeepMergeSync />, { wrapper })
    expect(importLocalFn).not.toHaveBeenCalled()

    // Act — the user object resolves on the next render.
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_a' },
    }
    rerender(<LocalKeepMergeSync />)

    // Assert
    await waitFor(() => expect(importLocalFn).toHaveBeenCalledTimes(1))
  })

  it('leaves the batch claimed when the import fails so the next session retries it', async () => {
    // Arrange
    seedLocalKeeps([
      { id: 'a', title: 'push-ups', completedAt: new Date().toISOString() },
    ])
    importLocalFn.mockRejectedValue(new Error('offline'))

    // Act
    renderMergeSync()

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

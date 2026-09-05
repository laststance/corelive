/**
 * @fileoverview The one write seam for LiveEditor keeps. If these fail, a keep
 * lands in the wrong store, a failed account write passes for a success, or an
 * Undo after sign-in tries to delete a local uuid from the server.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_COMPLETIONS_STORAGE_KEY } from '@/lib/live-editor/constants'
import { parseLocalCompletions } from '@/lib/live-editor/localCompletionStore'

import { useCompletionWriter } from './useCompletionWriter'

const { clerkUserRef, createCompletedFn, deleteCompletedFn } = vi.hoisted(
  () => ({
    clerkUserRef: { current: { isSignedIn: true } },
    createCompletedFn: vi.fn(),
    deleteCompletedFn: vi.fn(),
  }),
)

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Real TanStack `useMutation` over fake mutation functions.
vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      create: {
        mutationOptions: () => ({ mutationFn: createCompletedFn }),
      },
      delete: {
        mutationOptions: () => ({ mutationFn: deleteCompletedFn }),
      },
    },
  },
}))

/**
 * Renders the writer inside a fresh QueryClient.
 * @returns The hook result.
 * @example
 * const writer = renderWriter()
 */
function renderWriter() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCompletionWriter(), { wrapper })
  return result.current
}

beforeEach(() => {
  localStorage.clear()
  clerkUserRef.current = { isSignedIn: true }
  createCompletedFn.mockReset()
  deleteCompletedFn.mockReset()
})

describe('useCompletionWriter — where a keep lands', () => {
  it('signed in, records the keep on the account and nothing on this device', async () => {
    // Arrange
    createCompletedFn.mockResolvedValue({ id: 42 })
    const writer = renderWriter()

    // Act
    const created = await writer.create({ categoryId: 1, title: 'buy milk' })

    // Assert
    expect(created).toEqual({ id: 42 })
    expect(createCompletedFn).toHaveBeenCalledWith(
      { categoryId: 1, title: 'buy milk' },
      expect.anything(),
    )
    expect(localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY)).toBeNull()
  })

  it('surfaces a failed account write instead of passing it off as kept', async () => {
    // Arrange
    createCompletedFn.mockRejectedValue(new Error('offline'))
    const writer = renderWriter()

    // Act / Assert
    await expect(
      writer.create({ categoryId: 1, title: 'buy milk' }),
    ).rejects.toThrow('offline')
    expect(localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY)).toBeNull()
  })

  it('undo of an account keep deletes the row on the server', async () => {
    // Arrange — the real Undo path: the toast only offers ids `create` returned.
    createCompletedFn.mockResolvedValue({ id: 42 })
    deleteCompletedFn.mockResolvedValue({ success: true })
    const writer = renderWriter()
    await writer.create({ categoryId: 1, title: 'buy milk' })

    // Act
    await writer.remove({ id: 42 })

    // Assert
    expect(deleteCompletedFn).toHaveBeenCalledWith(
      { id: 42 },
      expect.anything(),
    )
  })

  it('signed out, keeps the line on this device and never calls the server', async () => {
    // Arrange
    clerkUserRef.current = { isSignedIn: false }
    const writer = renderWriter()

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
    const signedOutWriter = renderWriter()
    const created = await signedOutWriter.create({
      categoryId: 0,
      title: 'buy milk',
    })
    clerkUserRef.current = { isSignedIn: true }
    const writer = renderWriter()

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

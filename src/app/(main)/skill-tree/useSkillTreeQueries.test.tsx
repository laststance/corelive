import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useSkillTreeQueries } from './useSkillTreeQueries'

const { authReady, fetchTree, fetchPool } = vi.hoisted(() => ({
  authReady: { current: false },
  fetchTree: vi.fn(async () => ({ nodes: [], edges: [] })),
  fetchPool: vi.fn(async () => []),
}))

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => authReady.current,
}))

vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    skillTree: {
      getMyTree: {
        queryOptions: () => ({ queryKey: ['tree'], queryFn: fetchTree }),
      },
      getUnassignedPool: {
        queryOptions: () => ({ queryKey: ['pool'], queryFn: fetchPool }),
      },
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  authReady.current = false
})
afterEach(cleanup)

test('opening Skill Tree waits for the signed-in session before requesting either protected data source', async () => {
  // Arrange
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  // Act
  const { result, rerender } = renderHook(() => useSkillTreeQueries(), {
    wrapper,
  })

  // Assert
  expect(fetchTree).not.toHaveBeenCalled()
  expect(fetchPool).not.toHaveBeenCalled()
  expect(result.current.isLoading).toBe(true)

  // Act
  authReady.current = true
  rerender()

  // Assert
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(fetchTree).toHaveBeenCalledTimes(1)
  expect(fetchPool).toHaveBeenCalledTimes(1)
  expect(result.current.isError).toBe(false)
  expect(result.current.tree).toEqual({ nodes: [], edges: [] })
  expect(result.current.pool).toEqual([])
})

/**
 * @fileoverview Nothing here is stubbed above the socket. The real TanStack
 * Query, the real oRPC client and the real RPC wire format all run; MSW answers
 * `/api/orpc/*` from an in-memory table. A mocked `useMutation` never invokes
 * `onError`, so these specs would stay green forever after the toast was gone.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

import { broadcastCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'
import {
  armNetworkFailure,
  orpcServer,
  readCategories,
  resetOrpcServer,
} from '@/test/orpcServer'

import { useCategoryMutations } from './useCategoryMutations'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

// BroadcastChannel has no listener here; onSettled fires it on every write.
vi.mock('@/lib/category-sync-channel', () => ({
  broadcastCategorySync: vi.fn(),
}))

/** The same cache entry the hook snapshots and rolls back. */
const categoryListKey = orpc.category.list.queryOptions({}).queryKey

/**
 * Builds a category row the fake table can serve.
 * @param overrides - Fields to change on top of a plain non-default category.
 * @returns One `CategoryWithCount`.
 * @example
 * buildCategory({ id: 1, name: 'General', isDefault: true })
 */
function buildCategory(
  overrides: Partial<CategoryWithCount> = {},
): CategoryWithCount {
  return {
    id: 12,
    name: 'Work',
    color: 'blue',
    isDefault: false,
    userId: 1,
    _count: { todos: 0 },
    createdAt: new Date('2026-09-07T00:00:00.000Z'),
    updatedAt: new Date('2026-09-07T00:00:00.000Z'),
    ...overrides,
  }
}

const defaultCategory = buildCategory({
  id: 1,
  name: 'General',
  isDefault: true,
})

/**
 * Renders {@link useCategoryMutations} under a real QueryClient, so TanStack runs
 * the hook's own onMutate/onError against real HTTP responses.
 * @returns The renderHook result plus the client holding the list cache.
 * @example
 * const { result, queryClient } = renderCategoryMutations()
 */
function renderCategoryMutations() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)

  return {
    ...renderHook(() => useCategoryMutations(), { wrapper }),
    queryClient,
  }
}

beforeAll(() => orpcServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => orpcServer.resetHandlers())
afterAll(() => orpcServer.close())

beforeEach(() => {
  vi.clearAllMocks()
  resetOrpcServer([defaultCategory, buildCategory()])
})

describe('category writes the server rejects', () => {
  test('repeats the duplicate-name reason when a create collides', async () => {
    // Arrange — "Work" already exists, so this hits the unique constraint.
    const { result } = renderCategoryMutations()

    // Act
    result.current.createMutation.mutate({ name: 'Work' })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Category "Work" already exists')
    })
  })

  test('repeats the duplicate-name reason when a rename collides', async () => {
    // Arrange — renaming "Work" onto the existing "General".
    const { result } = renderCategoryMutations()

    // Act
    result.current.updateMutation.mutate({ id: 12, data: { name: 'General' } })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Category "General" already exists',
      )
    })
  })

  test('explains that the default category cannot be deleted', async () => {
    // Arrange
    const { result } = renderCategoryMutations()

    // Act
    result.current.deleteMutation.mutate({ id: 1 })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Cannot delete the default category',
      )
    })
  })

  test('falls back to our own words when the request never reaches the server', async () => {
    // Arrange — a dead connection; "Failed to fetch" is not user-facing copy.
    armNetworkFailure()
    const { result } = renderCategoryMutations()

    // Act
    result.current.createMutation.mutate({ name: 'Reading' })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't save that change — try again.",
      )
    })
  })

  test('puts the previous list back when a create is rejected', async () => {
    // Arrange — the optimistic row must not survive the rejection.
    const { result, queryClient } = renderCategoryMutations()
    queryClient.setQueryData(categoryListKey, { categories: [defaultCategory] })

    // Act — "General" is taken, so this create conflicts.
    result.current.createMutation.mutate({ name: 'General' })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(
      queryClient.getQueryData<{ categories: CategoryWithCount[] }>(
        categoryListKey,
      )?.categories,
    ).toEqual([defaultCategory])
  })

  test('puts the old name back when a rename is rejected', async () => {
    // Arrange — the optimistic rename is written straight into the list cache,
    // so without the rollback the user keeps reading a name the server refused.
    const { result, queryClient } = renderCategoryMutations()
    queryClient.setQueryData(categoryListKey, {
      categories: [defaultCategory, buildCategory()],
    })

    // Act — "General" is taken, so renaming "Work" onto it conflicts.
    result.current.updateMutation.mutate({ id: 12, data: { name: 'General' } })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(
      queryClient
        .getQueryData<{ categories: CategoryWithCount[] }>(categoryListKey)
        ?.categories.map((category) => category.name),
    ).toEqual(['General', 'Work'])
  })

  test('puts the removed row back when a delete is rejected', async () => {
    // Arrange — the optimistic delete filters the row out of the cache, so
    // without the rollback a category the server kept vanishes from the picker.
    armNetworkFailure()
    const { result, queryClient } = renderCategoryMutations()
    queryClient.setQueryData(categoryListKey, {
      categories: [defaultCategory, buildCategory()],
    })

    // Act
    result.current.deleteMutation.mutate({ id: 12 })

    // Assert
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(
      queryClient
        .getQueryData<{ categories: CategoryWithCount[] }>(categoryListKey)
        ?.categories.map((category) => category.name),
    ).toEqual(['General', 'Work'])
  })
})

describe('category writes the server accepts', () => {
  test('stores a new category as blue and says nothing to the user', async () => {
    // Arrange — the dialog omits colour on purpose; the schema default supplies it.
    const { result } = renderCategoryMutations()

    // Act
    result.current.createMutation.mutate({ name: 'Reading' })

    // Assert — read back from the server's table, not the client's belief.
    await waitFor(() => {
      expect(
        readCategories().find((category) => category.name === 'Reading'),
      ).toMatchObject({ name: 'Reading', color: 'blue', isDefault: false })
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  test('removes a category the server accepted deleting', async () => {
    // Arrange
    const { result } = renderCategoryMutations()

    // Act
    result.current.deleteMutation.mutate({ id: 12 })

    // Assert
    await waitFor(() => {
      expect(readCategories().map((category) => category.name)).toEqual([
        'General',
      ])
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  test('stores the colour picked in the dialog', async () => {
    // Arrange — recolour is the one update the create path cannot reach: new
    // categories are always blue and only the pencil row changes that.
    const { result } = renderCategoryMutations()

    // Act
    result.current.updateMutation.mutate({ id: 12, data: { color: 'green' } })

    // Assert — read back from the server's table, not the client's belief.
    await waitFor(() => {
      expect(
        readCategories().find((category) => category.id === 12),
      ).toMatchObject({ name: 'Work', color: 'green' })
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  test.each([
    [
      'create',
      (m: ReturnType<typeof useCategoryMutations>) =>
        m.createMutation.mutate({ name: 'Reading' }),
    ],
    [
      'rename',
      (m: ReturnType<typeof useCategoryMutations>) =>
        m.updateMutation.mutate({ id: 12, data: { name: 'Errands' } }),
    ],
    [
      'delete',
      (m: ReturnType<typeof useCategoryMutations>) =>
        m.deleteMutation.mutate({ id: 12 }),
    ],
  ])('tells other windows about a %s', async (_label, fire) => {
    // Arrange — the listening half is useCategorySync; without this call a
    // category changed here stays in the other window's picker.
    const { result } = renderCategoryMutations()

    // Act
    fire(result.current)

    // Assert
    await waitFor(() => {
      expect(broadcastCategorySync).toHaveBeenCalled()
    })
  })
})

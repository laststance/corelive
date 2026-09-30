/**
 * @fileoverview Nothing is stubbed here: a real BroadcastChannel carries the
 * event, the real TanStack cache decides whether to refetch, and MSW answers
 * `/api/orpc/*`. A mocked channel would prove only that the mock was called.
 */
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  vi,
  test,
} from 'vitest'

import { broadcastCategorySync } from '@/lib/category-sync-channel'
import { registerLiveDraftAppender } from '@/lib/live-editor/appendCategoryDraft'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'
import { orpcServer, resetOrpcServer } from '@/test/orpcServer'

import { useCategorySync } from './useCategorySync'

/**
 * Builds a category row the fake table can serve.
 * @param overrides - Fields to change on top of a plain non-default category.
 * @returns One `CategoryWithCount`.
 * @example
 * buildCategory({ id: 12, name: 'Work' })
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
    parentId: null,
    recordCount: 0,
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
 * Renders a category list that also mounts {@link useCategorySync}, standing in
 * for `/write`, `/live-editor` and the `/home` sidebar.
 * `staleTime: Infinity` removes every refetch TanStack would do on its own, so
 * anything that appears got there through the broadcast.
 * @returns Nothing; assert against the rendered names.
 * @example
 * renderCategoryListWithSync()
 */
function renderCategoryListWithSync() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  function CategoryList() {
    useCategorySync()
    const { data } = useQuery(orpc.category.list.queryOptions({}))
    return (
      <ul>
        {data?.categories.map((category) => (
          <li key={category.id}>{category.name}</li>
        ))}
      </ul>
    )
  }

  render(
    <QueryClientProvider client={queryClient}>
      <CategoryList />
    </QueryClientProvider>,
  )
}

beforeAll(() => orpcServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => orpcServer.resetHandlers())
afterAll(() => orpcServer.close())

beforeEach(() => {
  resetOrpcServer([defaultCategory])
})

test('shows a category another window added, without a reload', async () => {
  // Arrange — this window is showing the list it fetched on mount.
  renderCategoryListWithSync()
  expect(await screen.findByText('General')).toBeVisible()

  // Act — another window created "Work" and announced it on the channel.
  resetOrpcServer([defaultCategory, buildCategory()])
  act(() => {
    broadcastCategorySync()
  })

  // Assert
  expect(await screen.findByText('Work')).toBeVisible()
})

test('holds the fetched list until a window announces a change', async () => {
  // Arrange — the positive control for the spec above: without it, a refetch
  // TanStack did on its own would look like the subscription working.
  renderCategoryListWithSync()
  expect(await screen.findByText('General')).toBeVisible()

  // Act — the table changes, but nothing tells this window.
  resetOrpcServer([defaultCategory, buildCategory()])
  await act(async () => {
    await Promise.resolve()
  })

  // Assert
  expect(screen.queryByText('Work')).not.toBeInTheDocument()
})

test('invalidates parent retrospectives and refreshes a persisted rescued draft on peer notification', async () => {
  // Arrange
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const heatmapKey = orpc.completed.heatmap.key()
  const journalKey = orpc.completed.journal.key()
  const bootstrapKey = orpc.home.bootstrap.key()
  client.setQueryData(heatmapKey, { fixture: 'old root' })
  client.setQueryData(journalKey, { fixture: 'old path' })
  client.setQueryData(bootstrapKey, { fixture: 'old metadata' })
  const refresh = vi.fn(async () => true)
  const unregister = registerLiveDraftAppender(
    async () => false,
    undefined,
    refresh,
  )
  renderHook(() => useCategorySync(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  // Act
  act(() => {
    const peer = new BroadcastChannel('corelive-category-sync')
    peer.postMessage({
      type: 'category-sync',
      senderId: 'other-window',
      draftCategoryId: 12,
      draftRescue: { receipt: '12:1', baseText: 'base', text: 'rescued' },
    })
    peer.close()
  })
  // Assert
  await waitFor(() =>
    expect(refresh).toHaveBeenCalledWith(12, {
      receipt: '12:1',
      baseText: 'base',
      text: 'rescued',
    }),
  )
  expect(client.getQueryState(heatmapKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(journalKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(bootstrapKey)?.isInvalidated).toBe(true)
  unregister()
})

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

import {
  useAutoSelectDefaultCategory,
  useSelectedCategory,
} from './useSelectedCategory'

const { listCategories } = vi.hoisted(() => ({ listCategories: vi.fn() }))
vi.mock('@/lib/orpc/create-client', () => ({
  createClient: () => ({ category: { list: listCategories } }),
}))

const GENERAL: CategoryWithCount = {
  id: 1,
  name: 'General',
  color: 'blue',
  parentId: null,
  isDefault: true,
  userId: 1,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  recordCount: 0,
  _count: { todos: 0 },
}
const CREATED: CategoryWithCount = {
  ...GENERAL,
  id: 12,
  name: 'Newly created',
  isDefault: false,
}
const OTHER: CategoryWithCount = {
  ...GENERAL,
  id: 3,
  name: 'Work',
  isDefault: false,
}
const clients: QueryClient[] = []

/** Renders the real storage subscription and category observer used by sidebar/editor peers.
 * @example const peer = useCategoryPeer()
 */
function useCategoryPeer() {
  const [selectedId, select] = useSelectedCategory()
  const { data } = useQuery(orpc.category.list.queryOptions({}))
  useAutoSelectDefaultCategory(selectedId, select, data?.categories ?? [])
  return { selectedId, select }
}

/** Provides an isolated tab cache so one peer can lag the server and creator.
 * @example const wrapper = tabWrapper(client)
 */
function tabWrapper(client: QueryClient) {
  return function TabProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/** Seeds the existing category cache under the real oRPC key without background fetching.
 * @example const client = createTab([GENERAL])
 */
function createTab(categories: CategoryWithCount[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 0 },
    },
  })
  client.setQueryData(orpc.category.list.queryOptions({}).queryKey, {
    categories,
  })
  clients.push(client)
  return client
}

beforeEach(() => {
  localStorage.clear()
  listCategories.mockReset()
})
afterEach(() => {
  cleanup()
  for (const client of clients) client.clear()
  clients.length = 0
})

test('a peer with an old category cache keeps a newly confirmed shared selection after verifying the server list', async () => {
  // Arrange
  localStorage.setItem('corelive-selected-category', '1')
  listCategories.mockResolvedValue({ categories: [GENERAL, CREATED] })
  const creator = renderHook(useCategoryPeer, {
    wrapper: tabWrapper(createTab([GENERAL, CREATED])),
  })
  const peerClient = createTab([GENERAL])
  const peer = renderHook(useCategoryPeer, { wrapper: tabWrapper(peerClient) })
  // Act
  act(() => creator.result.current.select(12))
  // Assert — a positive server-confirmed ID must never be replaced by this peer's stale General.
  expect(creator.result.current.selectedId).toBe(12)
  expect(peer.result.current.selectedId).toBe(12)
  await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(
      peerClient.getQueryData(orpc.category.list.queryOptions({}).queryKey),
    ).toEqual({ categories: [GENERAL, CREATED] }),
  )
  expect(localStorage.getItem('corelive-selected-category')).toBe('12')
})

test.each(['deleted', 'foreign-owned'])(
  'a genuinely %s remembered category falls back only after a fresh owned list confirms absence',
  async () => {
    // Arrange
    localStorage.setItem('corelive-selected-category', '99')
    let resolveList: (value: {
      categories: CategoryWithCount[]
    }) => void = () => {
      throw new Error('request not started')
    }
    listCategories.mockReturnValue(
      new Promise<{ categories: CategoryWithCount[] }>((resolve) => {
        resolveList = resolve
      }),
    )
    const peer = renderHook(useCategoryPeer, {
      wrapper: tabWrapper(createTab([GENERAL])),
    })
    expect(peer.result.current.selectedId).toBe(99)
    // Act
    await act(async () => {
      resolveList({ categories: [GENERAL] })
    })
    // Assert
    await waitFor(() => expect(peer.result.current.selectedId).toBe(1))
    expect(localStorage.getItem('corelive-selected-category')).toBe('1')
  },
)

test('a failed verification preserves an unknown positive selection instead of resetting writing', async () => {
  // Arrange
  localStorage.setItem('corelive-selected-category', '12')
  listCategories.mockRejectedValue(new Error('offline'))
  const peer = renderHook(useCategoryPeer, {
    wrapper: tabWrapper(createTab([GENERAL])),
  })
  // Act
  await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(1))
  await act(async () => {
    await Promise.resolve()
  })
  // Assert
  expect(peer.result.current.selectedId).toBe(12)
  expect(localStorage.getItem('corelive-selected-category')).toBe('12')
})

test('initial empty selection immediately chooses confirmed General without a server verification', () => {
  // Arrange
  const client = createTab([GENERAL])
  // Act
  const peer = renderHook(useCategoryPeer, { wrapper: tabWrapper(client) })
  // Assert
  expect(peer.result.current.selectedId).toBe(1)
  expect(listCategories).not.toHaveBeenCalled()
})

test('a slow absence response cannot replace a later valid category choice', async () => {
  // Arrange
  localStorage.setItem('corelive-selected-category', '99')
  let resolveList: (value: {
    categories: CategoryWithCount[]
  }) => void = () => {
    throw new Error('request not started')
  }
  listCategories.mockReturnValue(
    new Promise<{ categories: CategoryWithCount[] }>((resolve) => {
      resolveList = resolve
    }),
  )
  const peer = renderHook(useCategoryPeer, {
    wrapper: tabWrapper(createTab([GENERAL, OTHER])),
  })
  // Act
  act(() => peer.result.current.select(3))
  await act(async () => {
    resolveList({ categories: [GENERAL, OTHER] })
  })
  // Assert
  expect(peer.result.current.selectedId).toBe(3)
  expect(localStorage.getItem('corelive-selected-category')).toBe('3')
})

test('a verification finishing after the peer unmounts cannot change shared selection', async () => {
  // Arrange
  localStorage.setItem('corelive-selected-category', '99')
  let resolveList: (value: {
    categories: CategoryWithCount[]
  }) => void = () => {
    throw new Error('request not started')
  }
  listCategories.mockReturnValue(
    new Promise<{ categories: CategoryWithCount[] }>((resolve) => {
      resolveList = resolve
    }),
  )
  const peer = renderHook(useCategoryPeer, {
    wrapper: tabWrapper(createTab([GENERAL])),
  })
  peer.unmount()
  // Act
  await act(async () => {
    resolveList({ categories: [GENERAL] })
  })
  // Assert
  expect(localStorage.getItem('corelive-selected-category')).toBe('99')
})

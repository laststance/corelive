import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { CompletedTodos } from './CompletedTodos'

const { journal } = vi.hoisted(() => ({ journal: vi.fn() }))
vi.mock('@/lib/orpc/create-client', () => ({
  createClient: () => ({ completed: { journal } }),
}))
vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))
vi.mock('@/hooks/useLocalDayKey', () => ({
  useLocalDayKey: () => '2026-10-01',
}))

const CATEGORIES = [
  { id: 1, name: 'Work', color: 'blue' as const, parentId: null },
  { id: 2, name: 'CoreLive', color: 'blue' as const, parentId: 1 },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test('switching a parent history to direct entries starts a fresh first page without old child rows', async () => {
  // Arrange
  const user = userEvent.setup()
  const observerCallbacks: IntersectionObserverCallback[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  journal.mockImplementation(
    async (input: {
      categoryId?: number
      offset: number
      includeSubcategories?: boolean
    }) => {
      const directOnly = input.categoryId === 1 && !input.includeSubcategories
      const offset = input.offset
      return {
        entries: [
          {
            source: 'completed',
            id: offset + 1,
            title: directOnly
              ? 'Direct Work win'
              : offset === 0
                ? 'First child win'
                : 'Second child page',
            completedAt: new Date('2026-10-01T09:00:00Z'),
            category: directOnly
              ? { id: 1, name: 'Work', color: 'blue', parent: null }
              : {
                  id: 2,
                  name: 'CoreLive',
                  color: 'blue',
                  parent: { id: 1, name: 'Work', color: 'blue' },
                },
          },
        ],
        total: directOnly ? 1 : 12,
        nextOffset: !directOnly && offset === 0 ? 10 : null,
        hasMore: !directOnly && offset === 0,
      }
    },
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )
  await screen.findByText('First child win')
  await user.click(
    screen.getByRole('combobox', { name: 'Filter wins by category' }),
  )
  await user.click(screen.getByRole('option', { name: 'Work' }))
  await waitFor(() =>
    expect(journal).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 1,
        includeSubcategories: true,
        offset: 0,
      }),
      expect.anything(),
    ),
  )
  const callback = observerCallbacks.at(-1)!
  callback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
  await screen.findByText('Second child page')

  // Act
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Include subcategories' }),
  )

  // Assert
  expect(await screen.findByText('Direct Work win')).toBeVisible()
  expect(screen.queryByText('Second child page')).toBeNull()
  expect(screen.queryByText('First child win')).toBeNull()
  expect(
    screen.getByLabelText('1 completed tasks in current view'),
  ).toBeVisible()
  expect(journal).toHaveBeenLastCalledWith(
    expect.objectContaining({
      categoryId: 1,
      includeSubcategories: false,
      offset: 0,
    }),
    expect.anything(),
  )
  client.clear()
})

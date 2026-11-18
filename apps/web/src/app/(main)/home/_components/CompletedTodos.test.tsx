import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { CompletedTodos } from './CompletedTodos'

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (onChange: () => void) => {
    window.addEventListener('popstate', onChange)
    return (): void => window.removeEventListener('popstate', onChange)
  }
  return {
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(subscribe, () => window.location.search),
      ),
  }
})

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

beforeEach(() => {
  const pushState = window.history.pushState.bind(window.history)
  // Next notifies useSearchParams subscribers about both pushState and traversal.
  vi.spyOn(window.history, 'pushState').mockImplementation((...args) => {
    pushState(...args)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('applies search only when submitted, keeps other URL parameters, and distinguishes no matches from empty history', async () => {
  // Arrange
  window.history.replaceState(null, '', '/home?date=2026-10-01&force=demo#top')
  const user = userEvent.setup()
  journal.mockResolvedValue({ entries: [], total: 0, hasMore: false })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )
  expect(await screen.findByText('Your year starts here')).toBeVisible()
  const input = screen.getByRole('searchbox', {
    name: 'Search completed tasks',
  })

  // Act
  await user.type(input, '  Release_50%  ')
  expect(journal).toHaveBeenCalledTimes(1)
  expect(journal).toHaveBeenLastCalledWith(
    { limit: 10, offset: 0 },
    expect.anything(),
  )
  await user.keyboard('{Enter}')

  // Assert
  expect(await screen.findByText('No matching wins')).toBeVisible()
  expect(screen.queryByText('Your year starts here')).toBeNull()
  expect(journal).toHaveBeenLastCalledWith(
    { limit: 10, offset: 0, search: 'Release_50%' },
    expect.anything(),
  )
  expect(input).toHaveValue('Release_50%')
  expect(input).toHaveFocus()
  const { hash, searchParams } = new URL(window.location.href)
  expect(searchParams.get('date')).toBe('2026-10-01')
  expect(searchParams.get('force')).toBe('demo')
  expect(searchParams.get('search')).toBe('Release_50%')
  expect(hash).toBe('#top')
  client.clear()
})

test('reopens a journal search from its URL and Clear resets search, category, and completion period', async () => {
  // Arrange
  window.history.replaceState(null, '', '/home?search=Release&date=2026-10-01')
  const user = userEvent.setup()
  journal.mockResolvedValue({ entries: [], total: 0, hasMore: false })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )
  expect(await screen.findByText('No matching wins')).toBeVisible()
  const input = screen.getByRole('searchbox', {
    name: 'Search completed tasks',
  })
  expect(input).toHaveValue('Release')
  expect(journal).toHaveBeenLastCalledWith(
    { limit: 10, offset: 0, search: 'Release' },
    expect.anything(),
  )

  // Act
  await user.click(
    screen.getByRole('radio', { name: 'Show wins completed this month' }),
  )
  await user.click(
    screen.getByRole('combobox', { name: 'Filter wins by category' }),
  )
  await user.click(screen.getByRole('option', { name: 'Work' }))
  expect(window.location.search).toBe(
    '?search=Release&date=2026-10-01&category=1',
  )
  await user.clear(input)
  await user.type(input, 'Updated term')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(journal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        offset: 0,
        search: 'Updated term',
        categoryId: 1,
        completedFrom: expect.any(Date),
        completedBefore: expect.any(Date),
      }),
      expect.anything(),
    ),
  )
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))

  // Assert
  expect(await screen.findByText('Your year starts here')).toBeVisible()
  expect(input).toHaveValue('')
  expect(input).toHaveFocus()
  expect(window.location.search).toBe('?date=2026-10-01')
  expect(journal).toHaveBeenLastCalledWith(
    { limit: 10, offset: 0 },
    expect.anything(),
  )
  client.clear()
})

test.each(['/home#journal', '/home?search=Release&filter=pending'])(
  'a link to %s scrolls to and focuses the journal after the Dashboard finishes loading',
  async (href) => {
    // Arrange
    window.history.replaceState(null, '', href)
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    journal.mockResolvedValue({ entries: [], total: 0, nextOffset: null })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const { rerender } = render(<p>Loading Dashboard…</p>)

    // Act
    rerender(
      <QueryClientProvider client={client}>
        <CompletedTodos categories={CATEGORIES} />
      </QueryClientProvider>,
    )

    // Assert
    const region = await screen.findByRole('region', {
      name: 'Completion journal',
    })
    expect(region).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalled()
    client.clear()
  },
)

test('the journal stays in view when activity cards expand after opening a journal link', async () => {
  // Arrange
  window.history.replaceState(null, '', '/home#journal')
  const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
  journal.mockResolvedValue({ entries: [], total: 0, nextOffset: null })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} isActivityLoading />
    </QueryClientProvider>,
  )
  const region = await screen.findByRole('region', {
    name: 'Completion journal',
  })
  expect(region).toHaveFocus()
  expect(scrollIntoView).toHaveBeenCalledTimes(1)

  // Act
  rerender(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} isActivityLoading={false} />
    </QueryClientProvider>,
  )

  // Assert
  expect(region).toHaveFocus()
  expect(scrollIntoView).toHaveBeenCalledTimes(2)
  client.clear()
})

test('a journal category link opens with its search and is restored by Back and Forward', async () => {
  // Arrange
  window.history.replaceState(
    null,
    '',
    '/home?search=Release&category=2#journal',
  )
  const user = userEvent.setup()
  journal.mockResolvedValue({ entries: [], total: 0, nextOffset: null })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )
  await screen.findByText('No matching wins')
  const category = screen.getByRole('combobox', {
    name: 'Filter wins by category',
  })
  expect(category).toHaveTextContent('CoreLive')
  expect(journal).toHaveBeenCalledWith(
    {
      limit: 10,
      offset: 0,
      categoryId: 2,
      includeSubcategories: true,
      search: 'Release',
    },
    expect.anything(),
  )

  // Act
  await user.click(category)
  await user.click(screen.getByRole('option', { name: 'All categories' }))

  // Assert
  expect(category).toHaveTextContent('All categories')
  expect(window.location.search).toBe('?search=Release')
  expect(window.location.hash).toBe('#journal')

  window.history.back()
  await waitFor(() => expect(category).toHaveTextContent('CoreLive'))
  expect(window.location.search).toBe('?search=Release&category=2')

  window.history.forward()
  await waitFor(() => expect(category).toHaveTextContent('All categories'))
  expect(window.location.search).toBe('?search=Release')
  client.clear()
})

test('a category link filters the first journal page before the category list is available and can be cleared', async () => {
  // Arrange
  window.history.replaceState(null, '', '/home?category=2#journal')
  const user = userEvent.setup()
  journal.mockResolvedValue({ entries: [], total: 0, nextOffset: null })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  // Act
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={undefined} />
    </QueryClientProvider>,
  )

  // Assert
  expect(await screen.findByText('No wins in this view yet')).toBeVisible()
  expect(
    screen.getByRole('combobox', { name: 'Filter wins by category' }),
  ).toHaveTextContent('Selected category')
  expect(journal).toHaveBeenCalledExactlyOnceWith(
    { limit: 10, offset: 0, categoryId: 2, includeSubcategories: true },
    expect.anything(),
  )

  await user.click(screen.getByRole('button', { name: 'Clear' }))
  expect(await screen.findByText('Your year starts here')).toBeVisible()
  expect(
    window.location.pathname + window.location.search + window.location.hash,
  ).toBe('/home#journal')
  client.clear()
})

test('a category removed while the journal is open falls back to all categories and keeps the search', async () => {
  // Arrange
  window.history.replaceState(
    null,
    '',
    '/home?category=2&search=Release#journal',
  )
  journal.mockResolvedValue({ entries: [], total: 0, nextOffset: null })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )
  await screen.findByText('No matching wins')
  const category = screen.getByRole('combobox', {
    name: 'Filter wins by category',
  })
  expect(category).toHaveTextContent('CoreLive')

  // Act
  rerender(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={[CATEGORIES[0]!]} />
    </QueryClientProvider>,
  )

  // Assert
  expect(category).toHaveTextContent('All categories')
  expect(await screen.findByText('No matching wins')).toBeVisible()
  expect(journal).toHaveBeenLastCalledWith(
    { limit: 10, offset: 0, search: 'Release' },
    expect.anything(),
  )
  client.clear()
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
      observe(): void {}
      disconnect(): void {}
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

test('an empty history invites the visitor to write in the desktop app and links to the Mac download', async () => {
  // Arrange
  journal.mockResolvedValue({
    entries: [],
    total: 0,
    nextOffset: null,
    hasMore: false,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  // Act
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )

  // Assert
  expect(await screen.findByText('Your year starts here')).toBeVisible()
  expect(
    screen.getByText(
      "Check a line off in the CoreLive desktop app — it'll appear here",
    ),
  ).toBeVisible()
  const downloadLink = screen.getByRole('link', {
    name: 'Get Mac app (opens GitHub in a new tab)',
  })
  expect(downloadLink).toHaveAttribute(
    'href',
    'https://github.com/laststance/corelive/releases/latest',
  )
  expect(downloadLink).toHaveAttribute('target', '_blank')
  client.clear()
})

test('a failed background refetch keeps the loaded history visible instead of an error block', async () => {
  // Arrange
  journal.mockResolvedValueOnce({
    entries: [
      {
        source: 'completed',
        id: 1,
        title: 'Shipped the thing',
        completedAt: new Date('2026-10-01T09:00:00Z'),
        category: { id: 1, name: 'Work', color: 'blue', parent: null },
      },
    ],
    total: 1,
    nextOffset: null,
    hasMore: false,
  })
  journal.mockRejectedValue(new Error('network down'))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  render(
    <QueryClientProvider client={client}>
      <CompletedTodos categories={CATEGORIES} />
    </QueryClientProvider>,
  )
  await screen.findByText('Shipped the thing')

  // Act
  await client.refetchQueries()

  // Assert
  await waitFor(() => expect(journal).toHaveBeenCalledTimes(2))
  expect(screen.getByText('Shipped the thing')).toBeVisible()
  expect(screen.queryByText('An error occurred')).toBeNull()
  client.clear()
})

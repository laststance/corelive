import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createClient } from '@/lib/orpc/create-client'

import { installHomeFixture } from '../../scripts/qa-dashboard/homeFixture'

// The fixture's Vite aliases are mirrored with vi.mock so the page renders exactly as `pnpm qa:dashboard` does.
vi.mock('@clerk/nextjs', async () => import('../../scripts/qa-dashboard/clerk'))
vi.mock(
  'next/navigation',
  async () => import('../../scripts/qa-dashboard/navigation'),
)
vi.mock('next/link', async () => import('../../scripts/qa-dashboard/link'))

let fixture: ReturnType<typeof installHomeFixture> | undefined

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 10, 18, 12))
})

afterEach(() => {
  cleanup()
  fixture?.uninstall()
  fixture = undefined
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

test('the last seven days show eight completions and opening today reveals an entry from the journal', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams('view=home'))
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={query}>{fixture.element}</QueryClientProvider>,
  )
  const viewDay = await screen.findByRole('button', { name: 'View day' })
  const journal = screen.getByRole('region', { name: 'Completion journal' })
  expect(
    await within(journal).findByText('Sketch the first spread'),
  ).toBeVisible()

  // Act
  fireEvent.click(viewDay)
  // Happy DOM lacks Chromium's currententrychange event for history writes.
  fireEvent.popState(window)

  // Assert
  const completed = screen.getByText('Completed', {
    selector: 'dt',
  }).nextElementSibling
  expect(completed).toBeVisible()
  expect(completed).toHaveTextContent(/^8$/)
  const day = await screen.findByRole('dialog')
  expect(await within(day).findByText('Sketch the first spread')).toBeVisible()
})

test('deleting Reading moves its seven completions into General without changing their timestamps', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams())
  const client = createClient()
  const before = await client.category.list()
  expect(
    before.categories.map(({ name, recordCount }) => [name, recordCount]),
  ).toEqual([
    ['General', 9],
    ['Reading', 7],
  ])

  // Act
  await client.category.delete({ id: 2, targetCategoryId: 1 })

  // Assert
  const [list, journal, day, heatmap] = await Promise.all([
    client.category.list(),
    client.completed.journal({ categoryId: 1 }),
    client.completed.dayDetail({ date: '2026-11-18' }),
    client.completed.heatmap({ days: 365 }),
  ])
  expect(
    list.categories.map(({ name, recordCount }) => [name, recordCount]),
  ).toEqual([['General', 16]])
  expect(journal.total).toBe(16)
  expect(journal.entries).toContainEqual({
    id: 2,
    source: 'completed',
    title: 'Read the chapter on color',
    category: { id: 1, name: 'General', color: 'blue', parent: null },
    completedAt: new Date(2026, 10, 18, 9),
  })
  expect(day.categories).toEqual([
    { id: 1, name: 'General', color: 'blue', count: 2, parent: null },
  ])
  expect(heatmap.total).toBe(16)
  expect(heatmap.data[0]?.categories).toEqual([
    { id: 1, name: 'General', color: 'blue', count: 2, parent: null },
  ])
})

test('a missing destination leaves Reading and its completions in place', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams())
  const client = createClient()

  // Act
  const deletion = client.category.delete({ id: 2, targetCategoryId: 999 })

  // Assert
  await expect(deletion).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect((await client.category.list()).categories).toContainEqual(
    expect.objectContaining({ id: 2, name: 'Reading', recordCount: 7 }),
  )
  expect((await client.completed.journal({ categoryId: 2 })).total).toBe(7)
})

test('the Journal link preserves search, category, and the active QA modes', async () => {
  // Arrange
  window.history.replaceState(
    null,
    '',
    '/?view=home&activity=empty&delete=pending&search=Release&category=2',
  )
  fixture = installHomeFixture(new URLSearchParams(window.location.search))
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  // Act
  render(
    <QueryClientProvider client={query}>{fixture.element}</QueryClientProvider>,
  )

  // Assert
  expect(
    await screen.findByText('No completions in the last year'),
  ).toBeVisible()
  expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute(
    'href',
    '/home?search=Release&category=2&activity=empty&delete=pending#journal',
  )
})

test.each([
  ['General', '?view=home&search=color&category=1'],
  ['Journal', '?search=color'],
])(
  'opening %s keeps moved completions in the current page',
  async (link, search) => {
    // Arrange
    window.history.replaceState(null, '', '/?view=home&search=color')
    fixture = installHomeFixture(new URLSearchParams(window.location.search))
    await createClient().category.delete({ id: 2, targetCategoryId: 1 })
    const query = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={query}>
        {fixture.element}
      </QueryClientProvider>,
    )
    const journal = await screen.findByRole('region', {
      name: 'Completion journal',
    })

    // Act
    const destination = await screen.findByRole('link', {
      name: link,
    })
    destination.focus()
    const usesNativeNavigation = fireEvent.click(destination)

    // Assert
    expect(usesNativeNavigation).toBe(false)
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe('/home' + search + '#journal')
    expect(journal).toHaveFocus()
    const movedEntry = await within(journal).findByText(
      'Read the chapter on color',
    )
    expect(movedEntry).toBeVisible()
    expect(movedEntry.parentElement).toHaveTextContent('General')
    expect(screen.queryByRole('link', { name: 'Reading' })).toBeNull()
  },
)

test('restarting the fixture restores browser globals and starts a fresh scenario', async () => {
  // Arrange
  const fetch = window.fetch
  const controls = Object.getOwnPropertyDescriptor(window, '__homeFixture')
  const client = createClient()
  fixture = installHomeFixture(new URLSearchParams())
  expect((await client.completed.journal({})).total).toBe(16)

  // Act
  fixture.uninstall()

  // Assert
  expect(window.fetch).toBe(fetch)
  expect(Object.getOwnPropertyDescriptor(window, '__homeFixture')).toEqual(
    controls,
  )
  fixture = installHomeFixture(new URLSearchParams('delete=pending'))
  expect((await client.completed.journal({})).total).toBe(0)
  expect(
    (await client.category.list()).categories.map(
      ({ recordCount }) => recordCount,
    ),
  ).toEqual([0, 0])
})

test('uninstalling cancels both pending deletes and restores fetch', async () => {
  // Arrange
  const originalFetch = window.fetch
  fixture = installHomeFixture(new URLSearchParams('delete=pending'))
  const dispatch = vi.fn(window.fetch)
  window.fetch = dispatch
  const client = createClient()
  const requests = Promise.allSettled([
    client.category.delete({ id: 2, targetCategoryId: 1 }),
    client.category.delete({ id: 2, targetCategoryId: 1 }),
  ])
  await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))

  // Act
  fixture.uninstall()
  fixture = undefined

  // Assert
  expect(window.fetch).toBe(originalFetch)
  expect(await requests).toEqual([
    {
      status: 'rejected',
      reason: expect.objectContaining({ code: 'CLIENT_CLOSED_REQUEST' }),
    },
    {
      status: 'rejected',
      reason: expect.objectContaining({ code: 'CLIENT_CLOSED_REQUEST' }),
    },
  ])
})

test('releasing pending deletes removes Reading once and settles both requests', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams('delete=pending'))
  const browser: Window & { __homeFixture?: { release: () => void } } = window
  const dispatch = vi.fn(window.fetch)
  window.fetch = dispatch
  const client = createClient()
  const requests = Promise.allSettled([
    client.category.delete({ id: 2, targetCategoryId: 1 }),
    client.category.delete({ id: 2, targetCategoryId: 1 }),
  ])
  await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))
  expect(
    (await client.category.list()).categories.map(({ name }) => name),
  ).toEqual(['General', 'Reading'])

  // Act
  browser.__homeFixture?.release()

  // Assert
  const outcomes = await requests
  expect(outcomes).toContainEqual({
    status: 'fulfilled',
    value: { success: true, movedToCategoryId: 1, promotedCategoryIds: [] },
  })
  expect(outcomes).toContainEqual({
    status: 'rejected',
    reason: expect.objectContaining({ code: 'NOT_FOUND' }),
  })
  expect(
    (await client.category.list()).categories.map(({ name }) => name),
  ).toEqual(['General'])
})

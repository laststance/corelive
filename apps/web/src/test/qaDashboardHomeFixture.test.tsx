import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
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
  vi.unstubAllEnvs()
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
    client.completed.dayDetail({
      date: '2026-11-18',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    client.completed.heatmap({
      days: 365,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
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

test('the heatmap limits buckets, totals, and streaks to the requested local days', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams())
  const client = createClient()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Act
  const oneDay = await client.completed.heatmap({ days: 1, timezone })
  const year = await client.completed.heatmap({ days: 365, timezone })

  // Assert
  expect(oneDay.data.map(({ date, count }) => [date, count])).toEqual([
    ['2026-11-18', 2],
  ])
  expect(oneDay.total).toBe(2)
  expect(oneDay).toMatchObject({ throughDate: '2026-11-18' })
  expect(oneDay.streaks).toEqual({ current: 1, longest: 1 })
  expect(year.total).toBe(16)
})

test('early morning activity keeps both of today’s completions at or before the current time', async () => {
  // Arrange
  vi.setSystemTime(new Date(2026, 10, 18, 8))
  fixture = installHomeFixture(new URLSearchParams())
  const client = createClient()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Act
  const [heatmap, day, journal] = await Promise.all([
    client.completed.heatmap({ days: 1, timezone }),
    client.completed.dayDetail({ date: '2026-11-18', timezone }),
    client.completed.journal({ limit: 2 }),
  ])

  // Assert
  expect(heatmap.total).toBe(2)
  expect(day.count).toBe(2)
  expect(day.tasks.map(({ completedAt }) => completedAt)).toEqual([
    new Date(2026, 10, 18, 8),
    new Date(2026, 10, 18, 8),
  ])
  expect(journal.entries).toEqual(day.tasks)
})

test('day detail uses UTC by default and shows Auckland entries on their local date when requested', async () => {
  // Arrange
  vi.stubEnv('TZ', 'Pacific/Auckland')
  vi.setSystemTime(new Date('2026-11-17T23:00:00.000Z'))
  fixture = installHomeFixture(new URLSearchParams())
  const client = createClient()

  // Act
  const local = await client.completed.dayDetail({
    date: '2026-11-18',
    timezone: 'Pacific/Auckland',
  })
  const utc = await client.completed.dayDetail({ date: '2026-11-18' })
  const invalidZone = await client.completed.dayDetail({
    date: '2026-11-18',
    timezone: 'Invalid/Zone',
  })
  const previousUtcDay = await client.completed.dayDetail({
    date: '2026-11-17',
  })

  // Assert
  expect(local.count).toBe(2)
  expect(utc.count).toBe(0)
  expect(invalidZone.count).toBe(0)
  expect(previousUtcDay.tasks.map(({ title }) => title)).toEqual([
    'Sketch the first spread',
    'Read the chapter on color',
  ])
})

test('invalid heatmap input leaves the simulated failure available for a valid request', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams('activity=retry'))
  const client = createClient()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Act and assert each request against the fixture's one-shot failure.
  await expect(
    client.completed.heatmap({ days: 0, timezone }),
  ).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  })
  await expect(
    client.completed.heatmap({ days: 1, timezone }),
  ).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  })
  await expect(
    client.completed.heatmap({ days: 1, timezone }),
  ).resolves.toMatchObject({
    total: 2,
  })
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

test('single-line searches find fixture entries with line breaks in their original titles', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams())
  const client = createClient()

  // Act
  const result = await client.completed.journal({
    search: 'review the archive',
  })

  // Assert
  expect(result.total).toBe(1)
  expect(result.entries.map(({ title }) => title)).toEqual([
    'Review the\r\n archive',
  ])
})

test.each(['ΛΌΓΟΣ', 'λόγοσ'])(
  'journal search %s finds the title with a final sigma',
  async (search) => {
    // Arrange
    fixture = installHomeFixture(new URLSearchParams())
    const client = createClient()

    // Act
    const result = await client.completed.journal({ search })

    // Assert
    expect(result.total).toBe(1)
    expect(result.entries.map(({ title }) => title)).toEqual([
      'Copy the word λόγος',
    ])
  },
)

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
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings?activity=empty&delete=pending&view=appearance',
  )
  expect(screen.getByRole('link', { name: 'Skill Tree' })).toHaveAttribute(
    'href',
    '/skill-tree?activity=empty&delete=pending&view=skill-tree',
  )
})

test('journal results follow direct History API writes in the current page', async () => {
  // Arrange
  fixture = installHomeFixture(new URLSearchParams())
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={query}>{fixture.element}</QueryClientProvider>,
  )
  const journal = screen.getByRole('region', { name: 'Completion journal' })
  expect(
    await within(journal).findByText('Sketch the first spread'),
  ).toBeVisible()
  act(() => {
    window.history.pushState(null, '', '/?search=review+the+archive')
  })
  expect(await within(journal).findByText('Review the archive')).toBeVisible()

  // Act
  act(() => {
    window.history.replaceState(null, '', '/?search=revise')
  })

  // Assert
  expect(
    await within(journal).findByText('Revise the cover illustration'),
  ).toBeVisible()
  expect(within(journal).queryByText('Review the archive')).toBeNull()
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
  const historyMethods = [window.history.pushState, window.history.replaceState]
  const pushState = Object.getOwnPropertyDescriptor(window.history, 'pushState')
  const replaceState = Object.getOwnPropertyDescriptor(
    window.history,
    'replaceState',
  )
  const client = createClient()
  fixture = installHomeFixture(new URLSearchParams())
  expect((await client.completed.journal({})).total).toBe(16)

  // Act
  fixture.uninstall()

  // Assert
  expect(window.fetch).toBe(fetch)
  expect([window.history.pushState, window.history.replaceState]).toEqual(
    historyMethods,
  )
  expect(Object.getOwnPropertyDescriptor(window.history, 'pushState')).toEqual(
    pushState,
  )
  expect(
    Object.getOwnPropertyDescriptor(window.history, 'replaceState'),
  ).toEqual(replaceState)
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

test.each([
  {
    target: window.history,
    key: 'replaceState',
    value: window.history.replaceState,
  },
  { target: window, key: 'fetch', value: window.fetch },
])(
  'a rejected $key override leaves no fixture globals and the next install works',
  async ({ target, key, value }) => {
    // Arrange
    const { history } = window
    const original = Object.getOwnPropertyDescriptor(target, key)
    Object.defineProperty(target, key, {
      configurable: true,
      value,
      writable: false,
    })
    const pushState = Object.getOwnPropertyDescriptor(history, 'pushState')
    const replaceState = Object.getOwnPropertyDescriptor(
      history,
      'replaceState',
    )
    const fetch = Object.getOwnPropertyDescriptor(window, 'fetch')
    const controls = Object.getOwnPropertyDescriptor(window, '__homeFixture')

    try {
      // Act
      const install = () => installHomeFixture(new URLSearchParams())

      // Assert
      expect(install).toThrow(TypeError)
      expect(Object.getOwnPropertyDescriptor(history, 'pushState')).toEqual(
        pushState,
      )
      expect(Object.getOwnPropertyDescriptor(history, 'replaceState')).toEqual(
        replaceState,
      )
      expect(Object.getOwnPropertyDescriptor(window, 'fetch')).toEqual(fetch)
      expect(Object.getOwnPropertyDescriptor(window, '__homeFixture')).toEqual(
        controls,
      )
    } finally {
      if (original) Object.defineProperty(target, key, original)
      else Reflect.deleteProperty(target, key)
    }

    fixture = installHomeFixture(new URLSearchParams())
    expect((await createClient().completed.journal({})).total).toBe(16)
  },
)

test('rejecting an overlapping fixture leaves the current delete controls usable', async () => {
  // Arrange
  const home = installHomeFixture(new URLSearchParams('delete=pending'))
  fixture = home
  const client = createClient()
  const fetch = window.fetch
  const controls = Object.getOwnPropertyDescriptor(window, '__homeFixture')
  const browser: Window & { __homeFixture?: { release: () => void } } = window
  const deletion = Promise.allSettled([
    client.category.delete({ id: 2, targetCategoryId: 1 }),
  ])
  await waitFor(() => expect(home.pendingDeleteCount).toBe(1))

  // Act and assert the second install, then use the original controls.
  expect(() => installHomeFixture(new URLSearchParams())).toThrow(
    'The Home QA fixture is already installed in this window',
  )
  expect(window.fetch).toBe(fetch)
  expect(Object.getOwnPropertyDescriptor(window, '__homeFixture')).toEqual(
    controls,
  )
  browser.__homeFixture?.release()
  expect(await deletion).toMatchObject([
    { status: 'fulfilled', value: { success: true } },
  ])
})

test('uninstalling cancels both pending deletes and restores fetch', async () => {
  // Arrange
  const originalFetch = window.fetch
  const home = installHomeFixture(new URLSearchParams('delete=pending'))
  fixture = home
  const client = createClient()
  const requests = Promise.allSettled([
    client.category.delete({ id: 2, targetCategoryId: 1 }),
    client.category.delete({ id: 2, targetCategoryId: 1 }),
  ])
  await waitFor(() => expect(home.pendingDeleteCount).toBe(2))

  // Act
  home.uninstall()
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
  expect(home.pendingDeleteCount).toBe(0)
})

test('releasing pending deletes removes Reading once and settles both requests', async () => {
  // Arrange
  const home = installHomeFixture(new URLSearchParams('delete=pending'))
  fixture = home
  const browser: Window & { __homeFixture?: { release: () => void } } = window
  const client = createClient()
  const requests = Promise.allSettled([
    client.category.delete({ id: 2, targetCategoryId: 1 }),
    client.category.delete({ id: 2, targetCategoryId: 1 }),
  ])
  await waitFor(() => expect(home.pendingDeleteCount).toBe(2))
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
  expect(home.pendingDeleteCount).toBe(0)
  expect(outcomes).toContainEqual({
    status: 'rejected',
    reason: expect.objectContaining({ code: 'NOT_FOUND' }),
  })
  expect(
    (await client.category.list()).categories.map(({ name }) => name),
  ).toEqual(['General'])
})

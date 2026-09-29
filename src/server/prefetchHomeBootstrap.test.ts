// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { auth } from '@clerk/nextjs/server'
import { type DehydratedState, hydrate } from '@tanstack/react-query'
import { eq } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { categoryTable, todoTable, userTable } from '@/db/schema'
import { HOME_TIMEZONE_COOKIE_NAME } from '@/lib/constants/home'
import { createQueryClient } from '@/lib/query/createQueryClient'
import {
  getHomeCategoryListQueryKey,
  getHomeHeatmapQueryKey,
  getHomeJournalQueryKey,
} from '@/lib/query/homeBootstrapQueries'
import { describeIfDb } from '@/server/procedures/describeIfDb'
import type { HomeBootstrapResponse } from '@/server/schemas/home'

import { prefetchHomeBootstrap } from './prefetchHomeBootstrap'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))

/**
 * Real-DB suite for the Home SSR prefetch: Clerk and the Next request stores
 * stay mocked, while the `home.bootstrap` procedure runs for real against
 * Postgres. Several sequential DB round trips per case, so the suite gets a
 * generous timeout.
 */
vi.setConfig({ testTimeout: 30_000 })

const mockedAuth = vi.mocked(auth)
const mockedCookies = vi.mocked(cookies)
const mockedHeaders = vi.mocked(headers)

/** Options half of the heatmap query key, `{ input: { days, timezone }, type }`; only the zone matters here. */
const HeatmapQueryKeyOptionsSchema = z.object({
  input: z.object({ timezone: z.string() }),
})

// Every Clerk ID a test signs in with, so teardown removes exactly the rows it made.
const createdClerkIds = new Set<string>()

/**
 * Signs the request in as a Clerk ID no other test (or the dev seed user) owns, and registers it for teardown.
 * @returns The Clerk user identifier the mocked `auth()` now resolves.
 * @example
 * const clerkId = signInFreshViewer() // => 'test_home_prefetch_3f2b…'
 */
function signInFreshViewer(): string {
  const clerkId = `test_home_prefetch_${randomUUID()}`
  createdClerkIds.add(clerkId)
  mockedAuth.mockResolvedValue({ userId: clerkId } as Awaited<
    ReturnType<typeof auth>
  >)
  return clerkId
}

/** Stubs the per-request cookie and header stores for one scenario, since the prefetch reads them to guess the viewer zone. @param requestState - Optional timezone cookie and Vercel geo header values. @returns Nothing after installing the mocks. @example `mockRequestState({ cookieTimeZone: 'Asia/Tokyo' })` */
function mockRequestState({
  cookieTimeZone,
  geoTimeZone,
}: {
  cookieTimeZone?: string
  geoTimeZone?: string
} = {}): void {
  const cookieValues = new Map<string, string>()
  if (cookieTimeZone !== undefined) {
    cookieValues.set(HOME_TIMEZONE_COOKIE_NAME, cookieTimeZone)
  }
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      cookieValues.has(name)
        ? { name, value: cookieValues.get(name) }
        : undefined,
  } as Awaited<ReturnType<typeof cookies>>)
  mockedHeaders.mockResolvedValue(
    new Headers(
      geoTimeZone !== undefined ? { 'x-vercel-ip-timezone': geoTimeZone } : {},
    ),
  )
}

/**
 * Reads the viewer zone the dehydrated heatmap slice is keyed by, the observable output of the zone-guessing chain.
 * @param dehydratedState - What {@link prefetchHomeBootstrap} returned.
 * @returns
 * - The `timezone` inside the heatmap cache key
 * - `undefined` when no heatmap slice was dehydrated
 * @example
 * dehydratedHeatmapTimeZone(await prefetchHomeBootstrap()) // => 'Asia/Tokyo'
 */
function dehydratedHeatmapTimeZone(
  dehydratedState: DehydratedState | undefined,
): string | undefined {
  // Nothing dehydrated means the prefetch fell back to client fetching.
  if (!dehydratedState) return undefined
  const queryClient = createQueryClient()
  hydrate(queryClient, dehydratedState)
  const [heatmapQuery] = queryClient
    .getQueryCache()
    .findAll({ queryKey: [['completed', 'heatmap']] })
  if (!heatmapQuery) return undefined
  const [, keyOptions] = heatmapQuery.queryKey
  return HeatmapQueryKeyOptionsSchema.parse(keyOptions).input.timezone
}

/**
 * Reads back every stored user row for one Clerk ID, to see whether a request created an account.
 * @param clerkId - Clerk user identifier to look up.
 * @returns The matching rows' ids; `[]` when no account exists.
 * @example
 * await selectUserIdsByClerkId('test_home_prefetch_…') // => [{ id: 12 }]
 */
async function selectUserIdsByClerkId(clerkId: string) {
  return db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequestState({ cookieTimeZone: 'Asia/Tokyo' })
})

afterEach(async () => {
  vi.useRealTimers()
  for (const clerkId of createdClerkIds) {
    const [user] = await selectUserIdsByClerkId(clerkId)
    if (!user) continue
    // Todo rows restrict their category's delete, and categories the user's.
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('prefetchHomeBootstrap', () => {
  test('leaves a signed-out visit on the client-fetch path without creating an account row', async () => {
    // Arrange — a bootstrap call here would authenticate as "Bearer null" and
    // lazily create an account for the Clerk ID "null".
    mockedAuth.mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)
    createdClerkIds.add('null')

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert
    expect(dehydratedState).toBeUndefined()
    expect(await selectUserIdsByClerkId('null')).toEqual([])
  })

  test('hands Home its category, heatmap and journal caches already filled, so the first paint fetches nothing', async () => {
    // Arrange — "now" is pinned so the 365-day heatmap window and the streaks
    // are fixed; the viewer has one open todo and one completion yesterday (Tokyo).
    vi.useFakeTimers({
      now: new Date('2026-07-19T03:00:00.000Z'),
      toFake: ['Date'],
    })
    const clerkId = signInFreshViewer()
    const viewer = requireRow(
      await db
        .insert(userTable)
        .values({ clerkId })
        .returning({ id: userTable.id }),
      'user.insert',
    )
    const workCategory = requireRow(
      await db
        .insert(categoryTable)
        .values({
          name: 'Work',
          color: 'blue',
          isDefault: true,
          userId: viewer.id,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        })
        .returning({ id: categoryTable.id }),
      'category.insert',
    )
    await db.insert(todoTable).values({
      text: 'plan next release',
      completed: false,
      userId: viewer.id,
      categoryId: workCategory.id,
    })
    const shippedTodo = requireRow(
      await db
        .insert(todoTable)
        .values({
          text: 'ship release',
          completed: true,
          completedAt: new Date('2026-07-18T10:30:00.000Z'),
          userId: viewer.id,
          categoryId: workCategory.id,
        })
        .returning({ id: todoTable.id }),
      'todo.insert',
    )
    const expectedBootstrap: HomeBootstrapResponse = {
      category: {
        categories: [
          {
            id: workCategory.id,
            name: 'Work',
            color: 'blue',
            isDefault: true,
            userId: viewer.id,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
            _count: { todos: 1 },
          },
        ],
      },
      heatmap: {
        data: [
          {
            date: '2026-07-18',
            count: 1,
            categories: [
              { id: workCategory.id, name: 'Work', color: 'blue', count: 1 },
            ],
          },
        ],
        streaks: { current: 1, longest: 1 },
        total: 1,
      },
      journal: {
        entries: [
          {
            source: 'todo',
            id: shippedTodo.id,
            title: 'ship release',
            completedAt: new Date('2026-07-18T10:30:00.000Z'),
            category: { id: workCategory.id, name: 'Work', color: 'blue' },
          },
        ],
        total: 1,
        hasMore: false,
      },
    }

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert — the dehydrated payload survives the RSC JSON boundary and lands
    // on the exact keys the client hooks read (the cookie zone, journal page
    // one), holding the signed-in viewer's rows with Dates revived
    const queryClient = createQueryClient()
    hydrate(queryClient, JSON.parse(JSON.stringify(dehydratedState)))

    expect(queryClient.getQueryData(getHomeCategoryListQueryKey())).toEqual(
      expectedBootstrap.category,
    )
    expect(
      queryClient.getQueryData(getHomeHeatmapQueryKey('Asia/Tokyo')),
    ).toEqual(expectedBootstrap.heatmap)

    const journalCache = queryClient.getQueryData(getHomeJournalQueryKey()) as {
      pageParams: number[]
      pages: HomeBootstrapResponse['journal'][]
    }
    expect(journalCache).toEqual({
      pageParams: [0],
      pages: [expectedBootstrap.journal],
    })
    expect(journalCache.pages[0]?.entries[0]?.completedAt).toBeInstanceOf(Date)
  })

  test('falls back to client fetching when the bootstrap call fails instead of crashing Home', async () => {
    // Arrange — a stored category color outside the palette makes the real
    // bootstrap call reject on its output contract.
    const clerkId = signInFreshViewer()
    const viewer = requireRow(
      await db
        .insert(userTable)
        .values({ clerkId })
        .returning({ id: userTable.id }),
      'user.insert',
    )
    await db
      .insert(categoryTable)
      .values({ name: 'Legacy', color: 'chartreuse', userId: viewer.id })

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert
    expect(dehydratedState).toBeUndefined()
  })

  test('ignores a garbage timezone cookie and uses the Vercel geo header instead', async () => {
    // Arrange
    signInFreshViewer()
    mockRequestState({
      cookieTimeZone: 'Not/A_Real_Zone',
      geoTimeZone: 'America/New_York',
    })

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert
    expect(dehydratedHeatmapTimeZone(dehydratedState)).toBe('America/New_York')
  })

  test('falls back to the server zone when neither cookie nor geo header exists', async () => {
    // Arrange
    signInFreshViewer()
    mockRequestState({})

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert
    expect(dehydratedHeatmapTimeZone(dehydratedState)).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
  })
})

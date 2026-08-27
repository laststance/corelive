// @vitest-environment node
import { auth } from '@clerk/nextjs/server'
import { call } from '@orpc/server'
import type * as OrpcServerModule from '@orpc/server'
import { hydrate } from '@tanstack/react-query'
import { cookies, headers } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HOME_TIMEZONE_COOKIE_NAME } from '@/lib/constants/home'
import { createQueryClient } from '@/lib/query/createQueryClient'
import {
  getHomeCategoryListQueryKey,
  getHomeHeatmapQueryKey,
  getHomeJournalQueryKey,
} from '@/lib/query/homeBootstrapQueries'
import type { HomeBootstrapResponse } from '@/server/schemas/home'

import { prefetchHomeBootstrap } from './prefetchHomeBootstrap'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@orpc/server', async (importOriginal) => ({
  ...(await importOriginal<typeof OrpcServerModule>()),
  call: vi.fn(),
}))

const mockedAuth = vi.mocked(auth)
const mockedCall = vi.mocked(call)
const mockedCookies = vi.mocked(cookies)
const mockedHeaders = vi.mocked(headers)

const BOOTSTRAP_FIXTURE: HomeBootstrapResponse = {
  category: {
    categories: [
      {
        id: 1,
        name: 'Work',
        color: 'blue',
        isDefault: true,
        userId: 7,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        _count: { todos: 1 },
      },
    ],
  },
  heatmap: {
    data: [{ date: '2026-07-18', count: 2, categories: [] }],
    streaks: { current: 1, longest: 3 },
    total: 2,
  },
  journal: {
    entries: [
      {
        source: 'todo',
        id: 34,
        title: 'ship release',
        completedAt: new Date('2026-07-18T10:30:00.000Z'),
        category: { id: 1, name: 'Work', color: 'blue' },
      },
    ],
    total: 1,
    hasMore: false,
  },
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
    ) as Awaited<ReturnType<typeof headers>>,
  )
}

/** Extracts the heatmap timezone the prefetch handed to `home.bootstrap`, the observable output of the zone-guessing chain. @returns The `timezone` string of the single recorded call. @example `bootstrapCallTimezone() // => 'Asia/Tokyo'` */
function bootstrapCallTimezone(): string {
  const [, input] = mockedCall.mock.calls[0] as [
    unknown,
    { heatmap: { timezone: string } },
  ]
  return input.heatmap.timezone
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.mockResolvedValue({ userId: 'user_ssr_home' } as Awaited<
    ReturnType<typeof auth>
  >)
  mockRequestState({ cookieTimeZone: 'Asia/Tokyo' })
  mockedCall.mockResolvedValue(BOOTSTRAP_FIXTURE)
})

describe('prefetchHomeBootstrap', () => {
  it('leaves a signed-out visit on the client-fetch path without calling the bootstrap procedure', async () => {
    // Arrange
    mockedAuth.mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert
    expect(dehydratedState).toBeUndefined()
    expect(mockedCall).not.toHaveBeenCalled()
  })

  it('hydrates all three Home slices onto the exact client cache keys through one bootstrap call', async () => {
    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert — one procedure call carrying the canonical input and Bearer contract
    expect(mockedCall).toHaveBeenCalledTimes(1)
    const [, input, options] = mockedCall.mock.calls[0] as [
      unknown,
      unknown,
      { context: { headers: Headers } },
    ]
    expect(input).toEqual({
      heatmap: { days: 365, timezone: 'Asia/Tokyo' },
      journal: { limit: 10, offset: 0 },
    })
    expect(options.context.headers.get('authorization')).toBe(
      'Bearer user_ssr_home',
    )

    // Assert — the dehydrated payload survives the RSC JSON boundary and lands
    // on the exact keys the client hooks read, with Dates revived
    const queryClient = createQueryClient()
    hydrate(queryClient, JSON.parse(JSON.stringify(dehydratedState)))

    expect(queryClient.getQueryData(getHomeCategoryListQueryKey())).toEqual(
      BOOTSTRAP_FIXTURE.category,
    )
    expect(
      queryClient.getQueryData(getHomeHeatmapQueryKey('Asia/Tokyo')),
    ).toEqual(BOOTSTRAP_FIXTURE.heatmap)

    const journalCache = queryClient.getQueryData(getHomeJournalQueryKey()) as {
      pageParams: number[]
      pages: HomeBootstrapResponse['journal'][]
    }
    expect(journalCache).toEqual({
      pageParams: [0],
      pages: [BOOTSTRAP_FIXTURE.journal],
    })
    expect(journalCache.pages[0]?.entries[0]?.completedAt).toBeInstanceOf(Date)
  })

  it('falls back to client fetching when the bootstrap call fails instead of crashing Home', async () => {
    // Arrange
    mockedCall.mockRejectedValue(new Error('database unreachable'))

    // Act
    const dehydratedState = await prefetchHomeBootstrap()

    // Assert
    expect(dehydratedState).toBeUndefined()
  })

  it('ignores a garbage timezone cookie and uses the Vercel geo header instead', async () => {
    // Arrange
    mockRequestState({
      cookieTimeZone: 'Not/A_Real_Zone',
      geoTimeZone: 'America/New_York',
    })

    // Act
    await prefetchHomeBootstrap()

    // Assert
    expect(bootstrapCallTimezone()).toBe('America/New_York')
  })

  it('falls back to the server zone when neither cookie nor geo header exists', async () => {
    // Arrange
    mockRequestState({})

    // Act
    await prefetchHomeBootstrap()

    // Assert
    expect(bootstrapCallTimezone()).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
  })
})

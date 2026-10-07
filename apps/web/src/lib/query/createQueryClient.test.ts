import { dehydrate, hydrate } from '@tanstack/react-query'
import { describe, expect, test, vi } from 'vitest'

import { createQueryClient } from './createQueryClient'

describe('createQueryClient', () => {
  test('reuses server-prefetched Home data in the browser without an immediate duplicate query', async () => {
    // Arrange
    const queryKey = [
      ['todo', 'list'],
      {
        input: { completed: false, limit: 100, offset: 0 },
        type: 'query',
      },
    ]
    const prefetchedAt = new Date('2026-07-16T05:00:00.000Z')
    const serverQueryClient = createQueryClient()
    serverQueryClient.setQueryData(queryKey, {
      prefetchedAt,
      title: "Review Sarah's PR before standup",
    })
    const browserQueryClient = createQueryClient()
    hydrate(browserQueryClient, dehydrate(serverQueryClient))
    const fetchHomeData = vi.fn(async () => ({
      prefetchedAt: new Date('2026-07-16T06:00:00.000Z'),
      title: 'duplicate request',
    }))

    // Act
    const data = await browserQueryClient.fetchQuery({
      queryKey,
      queryFn: fetchHomeData,
    })

    // Assert
    expect(data).toEqual({
      prefetchedAt,
      title: "Review Sarah's PR before standup",
    })
    expect(fetchHomeData).not.toHaveBeenCalled()
  })

  test('keeps a query flagged meta.persist=false out of the dehydrated cache, so a one-day total never replays from an older day', async () => {
    // Arrange — two successful queries, one flagged as never-persisted.
    const queryClient = createQueryClient()
    await queryClient.fetchQuery({
      queryKey: ['completed', 'heatmap', { input: { days: 365 } }],
      queryFn: async () => ({ total: 120 }),
    })
    await queryClient.fetchQuery({
      queryKey: ['completed', 'heatmap', { input: { days: 1 } }],
      queryFn: async () => ({ total: 3 }),
      meta: { persist: false },
    })

    // Act
    const dehydrated = dehydrate(queryClient)

    // Assert
    expect(dehydrated.queries.map((query) => query.queryKey)).toEqual([
      ['completed', 'heatmap', { input: { days: 365 } }],
    ])
  })

  test('shares cache entries when Date input fields arrive in a different object order', () => {
    // Arrange
    const queryClient = createQueryClient()
    const completedFrom = new Date('2026-09-01T00:00:00.000Z')
    const completedBefore = new Date('2026-10-01T00:00:00.000Z')
    const serverKey = [
      ['completed', 'journal'],
      { input: { completedFrom, completedBefore }, type: 'query' },
    ]
    const browserKey = [
      ['completed', 'journal'],
      { type: 'query', input: { completedBefore, completedFrom } },
    ]

    // Act
    queryClient.setQueryData(serverKey, { total: 7 })

    // Assert
    expect(queryClient.getQueryData(browserKey)).toEqual({ total: 7 })
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1)
  })

  test('keeps filtered, unfiltered, and string-valued journal inputs in separate cache entries', () => {
    // Arrange
    const queryClient = createQueryClient()
    const dateKey = [
      ['completed', 'journal'],
      {
        input: { completedFrom: new Date('2026-09-01T00:00:00.000Z') },
        type: 'infinite',
      },
    ]
    const stringKey = [
      ['completed', 'journal'],
      {
        input: { completedFrom: '2026-09-01T00:00:00.000Z' },
        type: 'infinite',
      },
    ]
    const unfilteredKey = [
      ['completed', 'journal'],
      { input: { limit: 10, offset: 0 }, type: 'infinite' },
    ]

    // Act
    queryClient.setQueryData(dateKey, { total: 7 })
    queryClient.setQueryData(stringKey, { total: 8 })
    queryClient.setQueryData(unfilteredKey, { total: 9 })

    // Assert
    expect(queryClient.getQueryData(dateKey)).toEqual({ total: 7 })
    expect(queryClient.getQueryData(stringKey)).toEqual({ total: 8 })
    expect(queryClient.getQueryData(unfilteredKey)).toEqual({ total: 9 })
    expect(queryClient.getQueryCache().getAll()).toHaveLength(3)
  })
})

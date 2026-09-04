import { dehydrate, hydrate } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from './createQueryClient'

describe('createQueryClient', () => {
  it('reuses server-prefetched Home data in the browser without an immediate duplicate query', async () => {
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

  it('keeps a query flagged meta.persist=false out of the dehydrated cache, so a one-day total never replays from an older day', async () => {
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
})

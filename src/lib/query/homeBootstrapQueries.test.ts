// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'
import { getUnfilteredCompletedJournalInput } from '@/lib/utils/getUnfilteredCompletedJournalInput'

import { createQueryClient } from './createQueryClient'
import {
  buildHomeBootstrapInput,
  getHomeCategoryListQueryKey,
  getHomeHeatmapQueryKey,
  getHomeJournalQueryKey,
} from './homeBootstrapQueries'

describe('home bootstrap query keys', () => {
  test('hydrates category data onto the key every category consumer queries with empty input', () => {
    // Arrange
    const queryClient = createQueryClient()
    const categoryClientKey = orpc.category.list.queryOptions({}).queryKey

    // Act
    const ssrKey = getHomeCategoryListQueryKey()
    queryClient.setQueryData(ssrKey, { categories: [] })

    // Assert
    expect(ssrKey).toEqual([['category', 'list'], { type: 'query' }])
    expect(queryClient.getQueryData(categoryClientKey)).toEqual({
      categories: [],
    })
  })

  test('hydrates heatmap data onto the key useHeatmapData builds for the same zone', () => {
    // Arrange — match the heatmap input values consumed by useHeatmapData.
    const queryClient = createQueryClient()
    const heatmapClientKey = orpc.completed.heatmap.queryOptions({
      input: { days: 365, timezone: 'Asia/Tokyo' },
    }).queryKey

    // Act
    const ssrKey = getHomeHeatmapQueryKey('Asia/Tokyo')
    queryClient.setQueryData(ssrKey, {
      data: [],
      streaks: { current: 0, longest: 0 },
      total: 3,
    })

    // Assert
    expect(ssrKey).toEqual([
      ['completed', 'heatmap'],
      { input: { days: 365, timezone: 'Asia/Tokyo' }, type: 'query' },
    ])
    expect(queryClient.getQueryData(heatmapClientKey)).toEqual({
      data: [],
      streaks: { current: 0, longest: 0 },
      total: 3,
    })
  })

  test('seeds journal page one onto the infinite key CompletedTodos reads unfiltered', () => {
    // Arrange — mirror CompletedTodos' infinite options at default filters
    // (period 'all' spreads {}, categoryId null spreads {})
    const queryClient = createQueryClient()
    const journalClientKey = orpc.completed.journal.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        ...getUnfilteredCompletedJournalInput(pageParam),
      }),
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    }).queryKey

    // Act
    const ssrKey = getHomeJournalQueryKey()
    queryClient.setQueryData(ssrKey, {
      pages: [{ entries: [], total: 3, hasMore: false }],
      pageParams: [0],
    })

    // Assert
    expect(ssrKey).toEqual([
      ['completed', 'journal'],
      { input: { limit: 10, offset: 0 }, type: 'infinite' },
    ])
    expect(queryClient.getQueryData(journalClientKey)).toEqual({
      pages: [{ entries: [], total: 3, hasMore: false }],
      pageParams: [0],
    })
  })

  test('sends the bootstrap procedure the same three inputs the client queries send individually', () => {
    // Arrange
    const timezone = 'Asia/Tokyo'

    // Act
    const bootstrapInput = buildHomeBootstrapInput(timezone)

    // Assert
    expect(bootstrapInput).toEqual({
      heatmap: { days: 365, timezone: 'Asia/Tokyo' },
      journal: { limit: 10, offset: 0 },
    })
  })
})

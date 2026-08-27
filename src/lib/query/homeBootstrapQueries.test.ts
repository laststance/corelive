// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'
import { serializer } from '@/lib/orpc/serializer'
import { getUnfilteredCompletedJournalInput } from '@/lib/utils/getUnfilteredCompletedJournalInput'

import {
  buildHomeBootstrapInput,
  getHomeCategoryListQueryKey,
  getHomeHeatmapQueryKey,
  getHomeJournalQueryKey,
} from './homeBootstrapQueries'

/** Mirrors the app QueryClient's queryKeyHashFn so equality is asserted at the hash level the cache actually matches on (the oRPC serializer preserves property order, so `toEqual` alone would miss order drift). @param queryKey - Key produced by either the SSR builders or the client hooks. @returns The exact cache hash string. @example `hashLikeAppQueryClient([['completed','heatmap']]) // => '{"json":[...],"meta":[]}'` */
function hashLikeAppQueryClient(queryKey: unknown): string {
  const [json, meta] = serializer.serialize(queryKey)
  return JSON.stringify({ json, meta })
}

describe('home bootstrap query keys', () => {
  it('hydrates category data onto the key every category consumer queries with empty input', () => {
    // Arrange
    const categoryClientKey = orpc.category.list.queryOptions({}).queryKey

    // Act
    const ssrKey = getHomeCategoryListQueryKey()

    // Assert
    expect(ssrKey).toEqual([['category', 'list'], { type: 'query' }])
    expect(hashLikeAppQueryClient(ssrKey)).toBe(
      hashLikeAppQueryClient(categoryClientKey),
    )
  })

  it('hydrates heatmap data onto the key useHeatmapData builds for the same zone', () => {
    // Arrange — mirror useHeatmapData's `{ days, timezone }` input order
    const heatmapClientKey = orpc.completed.heatmap.queryOptions({
      input: { days: 365, timezone: 'Asia/Tokyo' },
    }).queryKey

    // Act
    const ssrKey = getHomeHeatmapQueryKey('Asia/Tokyo')

    // Assert
    expect(ssrKey).toEqual([
      ['completed', 'heatmap'],
      { input: { days: 365, timezone: 'Asia/Tokyo' }, type: 'query' },
    ])
    expect(hashLikeAppQueryClient(ssrKey)).toBe(
      hashLikeAppQueryClient(heatmapClientKey),
    )
  })

  it('seeds journal page one onto the infinite key CompletedTodos reads unfiltered', () => {
    // Arrange — mirror CompletedTodos' infinite options at default filters
    // (period 'all' spreads {}, categoryId null spreads {})
    const journalClientKey = orpc.completed.journal.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        ...getUnfilteredCompletedJournalInput(pageParam),
      }),
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    }).queryKey

    // Act
    const ssrKey = getHomeJournalQueryKey()

    // Assert
    expect(ssrKey).toEqual([
      ['completed', 'journal'],
      { input: { limit: 10, offset: 0 }, type: 'infinite' },
    ])
    expect(hashLikeAppQueryClient(ssrKey)).toBe(
      hashLikeAppQueryClient(journalClientKey),
    )
  })

  it('sends the bootstrap procedure the same three inputs the client queries send individually', () => {
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

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
  getHomeTodoListQueryKey,
} from './homeBootstrapQueries'

/** Mirrors the app QueryClient's queryKeyHashFn so equality is asserted at the hash level the cache actually matches on (the oRPC serializer preserves property order, so `toEqual` alone would miss order drift). @param queryKey - Key produced by either the SSR builders or the client hooks. @returns The exact cache hash string. @example `hashLikeAppQueryClient([['todo','list']]) // => '{"json":[...],"meta":[]}'` */
function hashLikeAppQueryClient(queryKey: unknown): string {
  const [json, meta] = serializer.serialize(queryKey)
  return JSON.stringify({ json, meta })
}

describe('home bootstrap query keys', () => {
  it('hydrates todo data onto the exact key TodoList reads on a default first load', () => {
    // Arrange — mirror TodoList's inline input construction (retain OFF, no category)
    const isRetaining = false
    const todoListClientKey = orpc.todo.list.queryOptions({
      input: {
        ...(isRetaining ? {} : { completed: false }),
        limit: 100,
        offset: 0,
      },
    }).queryKey

    // Act
    const ssrKey = getHomeTodoListQueryKey()

    // Assert
    expect(ssrKey).toEqual([
      ['todo', 'list'],
      { input: { completed: false, limit: 100, offset: 0 }, type: 'query' },
    ])
    expect(hashLikeAppQueryClient(ssrKey)).toBe(
      hashLikeAppQueryClient(todoListClientKey),
    )
  })

  it('hydrates todo data onto the exact category-filtered key TodoList reads when a sidebar selection is persisted', () => {
    // Arrange — mirror TodoList's inline construction with a selected category
    const isRetaining = false
    const selectedCategoryId = 3
    const todoListClientKey = orpc.todo.list.queryOptions({
      input: {
        ...(isRetaining ? {} : { completed: false }),
        limit: 100,
        offset: 0,
        ...(selectedCategoryId !== null && { categoryId: selectedCategoryId }),
      },
    }).queryKey

    // Act
    const ssrKey = getHomeTodoListQueryKey(3)

    // Assert
    expect(ssrKey).toEqual([
      ['todo', 'list'],
      {
        input: { completed: false, limit: 100, offset: 0, categoryId: 3 },
        type: 'query',
      },
    ])
    expect(hashLikeAppQueryClient(ssrKey)).toBe(
      hashLikeAppQueryClient(todoListClientKey),
    )
  })

  it('hydrates todo data onto the exact retain-mode key TodoList reads when 居残りモード is on', () => {
    // Arrange — mirror TodoList's input construction with retain mode ON
    // (居残りモード spreads {} instead of { completed: false })
    const isRetaining = true
    const selectedCategoryId = null
    const todoListClientKey = orpc.todo.list.queryOptions({
      input: {
        ...(isRetaining ? {} : { completed: false }),
        limit: 100,
        offset: 0,
        ...(selectedCategoryId !== null && { categoryId: selectedCategoryId }),
      },
    }).queryKey

    // Act
    const ssrKey = getHomeTodoListQueryKey(undefined, true)

    // Assert
    expect(ssrKey).toEqual([
      ['todo', 'list'],
      { input: { limit: 100, offset: 0 }, type: 'query' },
    ])
    expect(hashLikeAppQueryClient(ssrKey)).toBe(
      hashLikeAppQueryClient(todoListClientKey),
    )
  })

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

  it('sends the bootstrap procedure the same four inputs the client queries send individually', () => {
    // Arrange
    const timezone = 'Asia/Tokyo'

    // Act
    const bootstrapInput = buildHomeBootstrapInput(timezone)

    // Assert
    expect(bootstrapInput).toEqual({
      todo: { completed: false, limit: 100, offset: 0 },
      heatmap: { days: 365, timezone: 'Asia/Tokyo' },
      journal: { limit: 10, offset: 0 },
    })
  })

  it('carries a persisted category selection into the bootstrap todo slice', () => {
    // Arrange
    const timezone = 'Asia/Tokyo'
    const selectedCategoryId = 3

    // Act
    const bootstrapInput = buildHomeBootstrapInput(timezone, selectedCategoryId)

    // Assert
    expect(bootstrapInput.todo).toEqual({
      completed: false,
      limit: 100,
      offset: 0,
      categoryId: 3,
    })
  })

  it('drops the completed filter in the bootstrap todo slice when 居残りモード is on', () => {
    // Arrange
    const timezone = 'Asia/Tokyo'
    const selectedCategoryId = undefined
    const isRetaining = true

    // Act
    const bootstrapInput = buildHomeBootstrapInput(
      timezone,
      selectedCategoryId,
      isRetaining,
    )

    // Assert — 居残りモード omits completed so the active list holds ALL todos
    expect(bootstrapInput.todo).toEqual({ limit: 100, offset: 0 })
  })
})

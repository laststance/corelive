import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { dehydrate, type QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { orpc } from '@/lib/orpc/client-query'
import { HeatmapInputSchema } from '@/server/schemas/completed'

import { createQueryClient } from './createQueryClient'
import {
  getTodayHeatmapQueryKey,
  todayHeatmapQueryOptions,
} from './todayHeatmapQuery'

vi.mock('@/lib/utils/getViewerTimeZone', () => ({
  getViewerTimeZone: () => 'Asia/Tokyo',
}))

const initialUrl = window.location.href
const clients = new Set<QueryClient>()

afterEach(() => {
  for (const client of clients) client.clear()
  clients.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.href = initialUrl
})

describe('Today Ember with real oRPC query options', () => {
  test('fetches the one-day input into its day-specific cache, supports prefix invalidation, and excludes it from dehydration', async () => {
    // Arrange
    window.location.href = 'https://corelive.example/write'
    const receivedInput = vi.fn()
    const handler = new RPCHandler({
      completed: {
        heatmap: os.input(HeatmapInputSchema).handler(({ input }) => {
          receivedInput(input)
          return { data: [], streaks: { current: 0, longest: 0 }, total: 3 }
        }),
      },
    })
    const fetchRequest = vi.fn(async (url: string, init: RequestInit) => {
      const request = new Request(url, init)
      const { response } = await handler.handle(request, {
        prefix: '/api/orpc',
        context: {},
      })
      if (!response) throw new Error('The heatmap request did not match')
      return response
    })
    vi.stubGlobal('fetch', fetchRequest)
    const queryClient = createQueryClient()
    clients.add(queryClient)
    const options = todayHeatmapQueryOptions('2026-10-02')

    // Act
    const result = await queryClient.fetchQuery(options)
    await queryClient.invalidateQueries({
      queryKey: orpc.completed.heatmap.key(),
      refetchType: 'none',
    })
    const dehydrated = dehydrate(queryClient)

    // Assert
    expect(options.queryKey).toEqual([
      ['completed', 'heatmap'],
      { input: { days: 1, timezone: 'Asia/Tokyo' }, type: 'query' },
      '2026-10-02',
    ])
    expect(
      queryClient.getQueryCache().find({ queryKey: options.queryKey })?.meta,
    ).toEqual({ persist: false })
    expect(receivedInput).toHaveBeenCalledExactlyOnceWith({
      days: 1,
      timezone: 'Asia/Tokyo',
    })
    expect(fetchRequest.mock.calls[0]![0]).toBe(
      'https://corelive.example/api/orpc/completed/heatmap',
    )
    expect(result).toEqual({
      data: [],
      streaks: { current: 0, longest: 0 },
      total: 3,
    })
    expect(
      queryClient.getQueryData(getTodayHeatmapQueryKey('2026-10-02')),
    ).toEqual({ data: [], streaks: { current: 0, longest: 0 }, total: 3 })
    expect(
      queryClient.getQueryData(getTodayHeatmapQueryKey('2026-10-03')),
    ).toBeUndefined()
    expect(queryClient.getQueryState(options.queryKey)?.isInvalidated).toBe(
      true,
    )
    expect(dehydrated.queries).toEqual([])
  })
})

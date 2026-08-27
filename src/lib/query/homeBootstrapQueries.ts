import { COMPLETED_JOURNAL_INITIAL_OFFSET } from '@/lib/constants/completed'
import { HOME_HEATMAP_DAYS } from '@/lib/constants/home'
import { orpc } from '@/lib/orpc/client-query'
import { getUnfilteredCompletedJournalInput } from '@/lib/utils/getUnfilteredCompletedJournalInput'
import type { HomeBootstrapInput } from '@/server/schemas/home'

/**
 * Shared input/key builders for the three critical Home queries.
 *
 * The SSR prefetch (`prefetchHomeBootstrap`) must write bootstrap data onto the
 * EXACT cache keys the Home client hooks read on first mount, or hydration
 * silently misses and the client re-fetches. The app's `queryKeyHashFn`
 * serializes keys with the oRPC serializer, which preserves object property
 * order — so every input built here mirrors the client-side property order
 * character for character (e.g. `{ days, timezone }` in useHeatmapData).
 */

/** Builds the heatmap input `useHeatmapData` sends for the given zone, keeping SSR writes aligned with the client's `{ days, timezone }` property order. @param timezone - IANA zone the viewer buckets local days by. @returns The canonical heatmap query input. @example `buildHomeHeatmapInput('Asia/Tokyo') // => { days: 365, timezone: 'Asia/Tokyo' }` */
export function buildHomeHeatmapInput(timezone: string) {
  return {
    days: HOME_HEATMAP_DAYS,
    timezone,
  }
}

/** Assembles the one `home.bootstrap` input covering all three Home slices whenever the SSR prefetch runs. @param timezone - Viewer IANA zone for heatmap bucketing. @returns The raw (pre-Zod) bootstrap input. @example `buildHomeBootstrapInput('Asia/Tokyo') // => { heatmap: { days: 365, timezone: 'Asia/Tokyo' }, journal: { limit: 10, offset: 0 } }` */
export function buildHomeBootstrapInput(timezone: string): HomeBootstrapInput {
  return {
    heatmap: buildHomeHeatmapInput(timezone),
    journal: getUnfilteredCompletedJournalInput(
      COMPLETED_JOURNAL_INITIAL_OFFSET,
    ),
  }
}

/** Returns the cache key Dashboard/Category/CategoryManageDialog read category data from, for SSR hydration writes. @returns The `category.list` query key with empty input. @example `getHomeCategoryListQueryKey() // => [['category','list'], { type: 'query' }]` */
export function getHomeCategoryListQueryKey() {
  return orpc.category.list.queryOptions({}).queryKey
}

/** Returns the cache key `useHeatmapData` reads for the given zone, for SSR hydration writes. @param timezone - IANA zone the client reports via `Intl`. @returns The `completed.heatmap` query key. @example `getHomeHeatmapQueryKey('Asia/Tokyo') // => [['completed','heatmap'], { input: { days: 365, timezone: 'Asia/Tokyo' }, type: 'query' }]` */
export function getHomeHeatmapQueryKey(timezone: string) {
  return orpc.completed.heatmap.queryOptions({
    input: buildHomeHeatmapInput(timezone),
  }).queryKey
}

/** Returns the infinite cache key CompletedTodos' unfiltered journal reads, for SSR hydration writes seeding page one. @returns The `completed.journal` infinite query key. @example `getHomeJournalQueryKey() // => [['completed','journal'], { input: { limit: 10, offset: 0 }, type: 'infinite' }]` */
export function getHomeJournalQueryKey() {
  return orpc.completed.journal.infiniteKey({
    input: getUnfilteredCompletedJournalInput,
    initialPageParam: COMPLETED_JOURNAL_INITIAL_OFFSET,
  })
}

/**
 * @fileoverview The Today Ember's account query, in one place. `useTodayKeeps`
 * reads this cache entry and `useCompletionWriter` bumps it optimistically, so
 * the input and the key must be built identically — two independent builders is
 * how the bump starts writing to an entry nobody reads.
 *
 * @module lib/query/todayHeatmapQuery
 */
import { orpc } from '@/lib/orpc/client-query'
import { getViewerTimeZone } from '@/lib/utils/getViewerTimeZone'

/** One-day heatmap window: the ember asks the server for today alone (`total` is today-only). */
export const TODAY_HEATMAP_DAYS = 1

/**
 * Builds today's heatmap input in the property order the app's `queryKeyHashFn`
 * hashes, so reader and writer address the same cache entry.
 * @returns `{ days: 1, timezone }` for the viewer's zone.
 * @example
 * buildTodayHeatmapInput() // => { days: 1, timezone: 'Asia/Tokyo' }
 */
function buildTodayHeatmapInput() {
  return { days: TODAY_HEATMAP_DAYS, timezone: getViewerTimeZone() }
}

/**
 * Query options for today's account total: never persisted, because a one-day
 * total replayed from an older day counts yesterday as today and hides a failed
 * fetch behind a stale number. Carried here rather than at the call site so a
 * second observer cannot re-register the query without the opt-out.
 * @returns oRPC's heatmap options plus `meta: { persist: false }`.
 * @example
 * useQuery({ ...todayHeatmapQueryOptions(), enabled: isSignedIn === true })
 */
export function todayHeatmapQueryOptions() {
  return {
    ...orpc.completed.heatmap.queryOptions({ input: buildTodayHeatmapInput() }),
    meta: { persist: false },
  }
}

/**
 * Query key of the one-day window whose `total` the Today Ember reads — the
 * entry `useCompletionWriter` bumps and `useTodayKeeps` resets at local midnight.
 * @returns The exact TanStack key {@link todayHeatmapQueryOptions} registers.
 * @example
 * getTodayHeatmapQueryKey() // => ['completed', 'heatmap', { input: { days: 1, timezone: 'Asia/Tokyo' } }, …]
 */
export function getTodayHeatmapQueryKey() {
  return todayHeatmapQueryOptions().queryKey
}

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
 * @param dayKey - The viewer's local `YYYY-MM-DD`, from `useLocalDayKey()`.
 * @returns oRPC's heatmap options, keyed by the local day, plus `meta: { persist: false }`.
 * @example
 * useQuery({ ...todayHeatmapQueryOptions('2026-09-05'), enabled: isSignedIn === true })
 */
export function todayHeatmapQueryOptions(dayKey: string) {
  const options = orpc.completed.heatmap.queryOptions({
    input: buildTodayHeatmapInput(),
  })
  return {
    ...options,
    // The one-day input carries no date, so an observer that stays mounted
    // across local midnight (the always-on-top panel, a `/write` tab left open)
    // would keep reading yesterday's entry. Making the day part of the KEY turns
    // the rollover into a cache miss: `data` is `undefined` on the very render
    // the day flips, so the ember shows its resolving word rather than
    // yesterday's number for a frame. An effect cannot do this — it runs after
    // that frame has already painted. Appended last so a prefix invalidation on
    // `orpc.completed.heatmap.key()` still matches.
    queryKey: [...options.queryKey, dayKey],
    meta: { persist: false },
  }
}

/**
 * Query key of the one-day window whose `total` the Today Ember reads — the
 * entry `useCompletionWriter` bumps. Pass the SAME `dayKey` the reader used, or
 * the bump lands on an entry nobody is watching.
 * @param dayKey - The viewer's local `YYYY-MM-DD`, from `useLocalDayKey()`.
 * @returns The exact TanStack key {@link todayHeatmapQueryOptions} registers.
 * @example
 * getTodayHeatmapQueryKey('2026-09-05') // => ['completed', 'heatmap', { input: { days: 1, timezone: 'Asia/Tokyo' } }, …, '2026-09-05']
 */
export function getTodayHeatmapQueryKey(dayKey: string) {
  return todayHeatmapQueryOptions(dayKey).queryKey
}

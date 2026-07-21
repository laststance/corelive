import { COMPLETED_JOURNAL_INITIAL_OFFSET } from '@/lib/constants/completed'
import {
  HOME_HEATMAP_DAYS,
  HOME_TODO_QUERY_LIMIT,
  HOME_TODO_QUERY_OFFSET,
} from '@/lib/constants/home'
import { orpc } from '@/lib/orpc/client-query'
import { getUnfilteredCompletedJournalInput } from '@/lib/utils/getUnfilteredCompletedJournalInput'
import type { CategoryWithCount } from '@/server/schemas/category'
import type { HomeBootstrapInput } from '@/server/schemas/home'

/**
 * Shared input/key builders for the four critical Home queries.
 *
 * The SSR prefetch (`prefetchHomeBootstrap`) must write bootstrap data onto the
 * EXACT cache keys the Home client hooks read on first mount, or hydration
 * silently misses and the client re-fetches. The app's `queryKeyHashFn`
 * serializes keys with the oRPC serializer, which preserves object property
 * order — so every input built here mirrors the client-side property order
 * character for character (e.g. `{ completed, limit, offset }` in TodoList).
 */

/** Builds the pending-list input TodoList queries on first load, mirroring TodoList's exact conditional-spread order: 居残りモード drops the `completed` filter (active list then holds ALL todos), category filter appended only when selected — so SSR and client hash to one key. @param selectedCategoryId - Persisted sidebar selection, or null/undefined for the All view. @param isRetaining - 居残りモード (keep completed in list); omits `completed` when true. @returns The canonical `{ [completed,] limit, offset[, categoryId] }` input in TodoList's property order. @example `buildHomeTodoListInput(3) // => { completed: false, limit: 100, offset: 0, categoryId: 3 }` @example `buildHomeTodoListInput(null, true) // => { limit: 100, offset: 0 }` */
export function buildHomeTodoListInput(
  selectedCategoryId?: number | null,
  isRetaining = false,
): {
  completed?: boolean
  limit: number
  offset: number
  categoryId?: number
} {
  return {
    // 居残りモード ON drops the completed:false filter — MUST match TodoList's
    // spread order (completed first) or the SSR key hashes differently.
    ...(isRetaining ? {} : { completed: false }),
    limit: HOME_TODO_QUERY_LIMIT,
    offset: HOME_TODO_QUERY_OFFSET,
    ...(selectedCategoryId !== null &&
      selectedCategoryId !== undefined && { categoryId: selectedCategoryId }),
  }
}

/** Resolves the Home category once for SSR, hydration, and the client query so a first visit cannot drift from the default-category cache key. @param selectedCategoryId - Persisted category selection, or null/undefined before the browser has one. @param categories - Hydrated category records containing the default marker. @returns The persisted ID, default category ID, or undefined when no category exists. @example `resolveHomeSelectedCategoryId(undefined, [{ id: 3, isDefault: true }]) // => 3` */
export function resolveHomeSelectedCategoryId(
  selectedCategoryId: number | null | undefined,
  categories: ReadonlyArray<Pick<CategoryWithCount, 'id' | 'isDefault'>>,
): number | undefined {
  return (
    selectedCategoryId ?? categories.find((category) => category.isDefault)?.id
  )
}

/** Builds the heatmap input `useHeatmapData` sends for the given zone, keeping SSR writes aligned with the client's `{ days, timezone }` property order. @param timezone - IANA zone the viewer buckets local days by. @returns The canonical heatmap query input. @example `buildHomeHeatmapInput('Asia/Tokyo') // => { days: 365, timezone: 'Asia/Tokyo' }` */
export function buildHomeHeatmapInput(timezone: string) {
  return {
    days: HOME_HEATMAP_DAYS,
    timezone,
  }
}

/** Assembles the one `home.bootstrap` input covering all four Home slices whenever the SSR prefetch runs. @param timezone - Viewer IANA zone for heatmap bucketing. @param selectedCategoryId - Cookie-mirrored sidebar selection, or undefined for the All view. @param isRetaining - Cookie-mirrored 居残りモード setting; drops the todo `completed` filter when true. @returns The raw (pre-Zod) bootstrap input. @example `buildHomeBootstrapInput('Asia/Tokyo', 3) // => { todo: {…, categoryId: 3}, heatmap: {…}, journal: { limit: 10, offset: 0 } }` */
export function buildHomeBootstrapInput(
  timezone: string,
  selectedCategoryId?: number,
  isRetaining = false,
): HomeBootstrapInput {
  return {
    todo: buildHomeTodoListInput(selectedCategoryId, isRetaining),
    heatmap: buildHomeHeatmapInput(timezone),
    journal: getUnfilteredCompletedJournalInput(
      COMPLETED_JOURNAL_INITIAL_OFFSET,
    ),
  }
}

/** Returns the cache key TodoList/Category/CategoryManageDialog read category data from, for SSR hydration writes. @returns The `category.list` query key with empty input. @example `getHomeCategoryListQueryKey() // => [['category','list'], { type: 'query' }]` */
export function getHomeCategoryListQueryKey() {
  return orpc.category.list.queryOptions({}).queryKey
}

/** Returns the cache key TodoList's first-load pending query reads (All view or the persisted category view, retain-aware), for SSR hydration writes. @param selectedCategoryId - Cookie-mirrored sidebar selection, or undefined for the All view. @param isRetaining - Cookie-mirrored 居残りモード setting; selects the retain-mode key (no `completed`) when true. @returns The `todo.list` query key for that first-load input. @example `getHomeTodoListQueryKey() // => [['todo','list'], { input: { completed: false, limit: 100, offset: 0 }, type: 'query' }]` */
export function getHomeTodoListQueryKey(
  selectedCategoryId?: number,
  isRetaining = false,
) {
  return orpc.todo.list.queryOptions({
    input: buildHomeTodoListInput(selectedCategoryId, isRetaining),
  }).queryKey
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

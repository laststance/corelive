import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { shiftIsoDate } from './shiftIsoDate'

/**
 * Length (in days) of the "current" and "prior" sliding windows used to
 * compute the per-category week-over-week trend. Anchored on the day
 * supplied as `today` so tests/SSR stay deterministic.
 */
const CATEGORY_WINDOW_DAYS = 7

/**
 * Discriminated trend state surfaced per category. Re-mirrored from
 * {@link import('./aggregate-last-seven-days').WeeklyTrend} on purpose:
 * keeping this module standalone means the chip component can be
 * unit-tested without pulling in the weekly aggregator's test fixtures.
 *
 * @example
 * { kind: 'firstWeek' }            // category never touched in last 14 days
 * @example
 * { kind: 'flat' }                 // both windows zero, but older activity
 * @example
 * { kind: 'new' }                  // prior 0, current > 0 (no +Infinity%)
 * @example
 * { kind: 'percent', value: 25 }   // current up 25% vs prior week
 */
export type CategoryTrend =
  | { kind: 'firstWeek' }
  | { kind: 'flat' }
  | { kind: 'new' }
  | { kind: 'percent'; value: number }

/**
 * Per-category rollup surfaced to `CategoryFilterChips`. `currentCount`
 * mirrors the count the user sees on the chip; `trend` is what the small
 * arrow + delta reads off.
 *
 * @example
 * {
 *   id: 3,
 *   name: 'writing',
 *   color: 'blue',
 *   currentCount: 5,
 *   priorCount: 4,
 *   trend: { kind: 'percent', value: 25 },
 * }
 */
export type CategoryTrendEntry = {
  id: number
  name: string
  color: string
  currentCount: number
  priorCount: number
  trend: CategoryTrend
}

/**
 * Sums per-category counts within a sliding `CATEGORY_WINDOW_DAYS` window
 * ending at `windowEndIsoDate`. Returns a Map so caller can union with the
 * prior-window Map without re-walking the heatmap data twice.
 *
 * @param dataByDate - Heatmap data keyed by YYYY-MM-DD UTC date
 * @param windowEndIsoDate - Inclusive end of the window (YYYY-MM-DD)
 * @returns
 * - Map of categoryId → { id, name, color, count } over the window
 * @example
 * sumCategoriesInWindow(map, '2026-05-11')
 * // => Map { 1 => { id: 1, name: 'writing', color: 'blue', count: 5 }, ... }
 */
function sumCategoriesInWindow(
  dataByDate: Map<string, HeatmapDay>,
  windowEndIsoDate: string,
): Map<number, { id: number; name: string; color: string; count: number }> {
  const counts = new Map<
    number,
    { id: number; name: string; color: string; count: number }
  >()

  for (let dayOffset = 0; dayOffset < CATEGORY_WINDOW_DAYS; dayOffset++) {
    const isoDate = shiftIsoDate(windowEndIsoDate, -dayOffset)
    const day = dataByDate.get(isoDate)
    if (!day) continue

    for (const category of day.categories) {
      const existing = counts.get(category.id)
      if (existing) {
        existing.count += category.count
      } else {
        counts.set(category.id, {
          id: category.id,
          name: category.name,
          color: category.color,
          count: category.count,
        })
      }
    }
  }

  return counts
}

/**
 * Picks the trend `kind` for a single category given its current vs prior
 * window counts. Mirrors `aggregateLastSevenDays` semantics so the visual
 * vocabulary stays consistent between the WeeklySummaryCard headline and
 * the per-chip indicators.
 *
 * @param currentCount - Sum of category completions in the current window
 * @param priorCount - Sum of category completions in the prior window
 * @returns
 * - `firstWeek` when the category never appeared in either window
 * - `flat` when both windows are zero but the category exists elsewhere
 * - `new` when prior is zero and current is non-zero
 * - `percent` with rounded value otherwise
 * @example
 * computeCategoryTrend(0, 0, false) // => { kind: 'firstWeek' }
 * computeCategoryTrend(0, 0, true)  // => { kind: 'flat' }
 * computeCategoryTrend(5, 0, false) // => { kind: 'new' }
 * computeCategoryTrend(5, 4, false) // => { kind: 'percent', value: 25 }
 */
function computeCategoryTrend(
  currentCount: number,
  priorCount: number,
  hasHistoricalActivity: boolean,
): CategoryTrend {
  if (currentCount === 0 && priorCount === 0) {
    return hasHistoricalActivity ? { kind: 'flat' } : { kind: 'firstWeek' }
  }
  if (priorCount === 0) return { kind: 'new' }
  const value = ((currentCount - priorCount) / priorCount) * 100
  return { kind: 'percent', value: Math.round(value) }
}

/**
 * Aggregates per-category 7-day totals and WoW trends from the heatmap
 * response that the home page already fetched. Pure client-side math —
 * no new oRPC procedure needed. Anchored on the caller-supplied `todayIso`
 * local-day key so tests can pin the window.
 *
 * Ordering: descending by `currentCount`; ties broken alphabetically by
 * `name` (locale-insensitive `'en'` so CI runners stay deterministic).
 * Categories with zero counts in BOTH windows are still surfaced so the
 * user sees the full label set — chips for inactive categories read
 * "quiet week" instead of disappearing, matching DESIGN.md's voice.
 *
 * @param dataByDate - Per-day heatmap entries from `useHeatmapData()`
 * @param todayIso - "Today" as a YYYY-MM-DD local-day key (callers pass
 *   `getLocalTodayIsoDate()`)
 * @returns
 * - Array of `CategoryTrendEntry` sorted by `currentCount` desc
 * @example
 * aggregateCategoryTrends(new Map(), '2026-05-12')
 * // => []
 * @example
 * aggregateCategoryTrends(dataByDate, '2026-05-12')
 * // => [{ id: 1, name: 'writing', color: 'blue', currentCount: 5, priorCount: 4, trend: { kind: 'percent', value: 25 } }, ...]
 */
export function aggregateCategoryTrends(
  dataByDate: Map<string, HeatmapDay>,
  todayIso: string,
): CategoryTrendEntry[] {
  const priorWindowEndIso = shiftIsoDate(todayIso, -CATEGORY_WINDOW_DAYS)

  const currentCounts = sumCategoriesInWindow(dataByDate, todayIso)
  const priorCounts = sumCategoriesInWindow(dataByDate, priorWindowEndIso)

  // Union of category ids seen in either window — a category active only
  // in the prior window must still be surfaced (showing a `↓` trend) so the
  // chip row reflects the user's actual taxonomy, not just last week's wins.
  const allCategoryIds = new Set<number>([
    ...currentCounts.keys(),
    ...priorCounts.keys(),
  ])

  // "hasHistoricalActivity" lets us distinguish "your first week" copy
  // (heatmap fully empty) from "a quiet week" (older activity exists but
  // not in the 14-day inspection window). Map size is the cheapest signal.
  const hasHistoricalActivity = dataByDate.size > 0

  const entries: CategoryTrendEntry[] = []
  for (const categoryId of allCategoryIds) {
    const currentEntry = currentCounts.get(categoryId)
    const priorEntry = priorCounts.get(categoryId)

    // At least one of `currentEntry`/`priorEntry` is defined by Set
    // construction above; prefer the current week's name/color when it
    // exists so a recent rename surfaces immediately.
    const reference = currentEntry ?? priorEntry
    if (!reference) continue // appeases TS; unreachable in practice

    entries.push({
      id: categoryId,
      name: reference.name,
      color: reference.color,
      currentCount: currentEntry?.count ?? 0,
      priorCount: priorEntry?.count ?? 0,
      trend: computeCategoryTrend(
        currentEntry?.count ?? 0,
        priorEntry?.count ?? 0,
        hasHistoricalActivity,
      ),
    })
  }

  return entries.sort((a, b) => {
    if (b.currentCount !== a.currentCount) {
      return b.currentCount - a.currentCount
    }
    return a.name.localeCompare(b.name, 'en')
  })
}

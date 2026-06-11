import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { shiftIsoDate } from './shiftIsoDate'

/**
 * Length of the "current" and "prior" windows used by the weekly summary.
 * Seven calendar days each, rolling, anchored on the day passed as `today`.
 */
const WEEKLY_WINDOW_DAYS = 7

/**
 * Length (in days) of the prior comparison window used to compute WoW%.
 * Held as a separate constant so a future product change (e.g. "compare to
 * the same week last month") doesn't have to dig through aggregation code.
 */
const WOW_PRIOR_WINDOW_DAYS = 7

/**
 * Maximum number of categories surfaced in the WeeklySummaryCard's chip row.
 * Three keeps the card scannable; ties beyond rank 3 are broken alphabetically.
 */
const TOP_CATEGORIES_COUNT = 3

/**
 * Single category surfaced in the weekly summary's top-categories chip row.
 * Mirrors the `HeatmapCategory` shape but is re-stated here so the util
 * can be tested without pulling in the heatmap hook's transitive types.
 */
export type TopCategory = {
  id: number
  name: string
  color: string
  count: number
}

/**
 * Discriminated trend state surfaced to the WeeklySummaryCard. Renderer
 * picks the right copy and visual treatment off the `kind` field; numeric
 * `value` is only present in the `'percent'` arm.
 *
 * @example
 * { kind: 'firstWeek' }   // user has no activity in the last 14 days at all
 * @example
 * { kind: 'flat' }        // both windows are zero but older activity exists
 * @example
 * { kind: 'new' }         // prior was zero, current is non-zero
 * @example
 * { kind: 'percent', value: 25 }  // current 25% above prior
 * @example
 * { kind: 'percent', value: -50 } // current 50% below prior
 */
export type WeeklyTrend =
  | { kind: 'firstWeek' }
  | { kind: 'flat' }
  | { kind: 'new' }
  | { kind: 'percent'; value: number }

/**
 * Output of {@link aggregateLastSevenDays}. `totalCompleted` and `priorTotal`
 * are summed over the same local-day keys as the heatmap data they were
 * derived from, so the windows line up with what the user actually sees.
 *
 * @example
 * {
 *   totalCompleted: 12,
 *   priorTotal: 8,
 *   topCategories: [
 *     { id: 1, name: 'writing', color: 'blue', count: 5 },
 *     { id: 2, name: 'reading', color: 'green', count: 4 },
 *   ],
 *   trend: { kind: 'percent', value: 50 },
 * }
 */
export type WeeklyStats = {
  totalCompleted: number
  priorTotal: number
  topCategories: TopCategory[]
  trend: WeeklyTrend
}

/**
 * Sums the per-day counts and folds the per-day category rollups in a
 * sliding window of `WEEKLY_WINDOW_DAYS` ending at `windowEndIsoDate`. The
 * fold is the same shape the heatmap response already returns, so the
 * weekly summary stays consistent with what the heatmap renders.
 *
 * @param dataByDate - Heatmap data keyed by local YYYY-MM-DD date
 * @param windowEndIsoDate - Inclusive end of the window (YYYY-MM-DD)
 * @param windowLength - How many days the window covers (>=1)
 * @returns
 * - total: Sum of `count` across days in the window
 * - categoryCounts: Map of categoryId → { name, color, count }
 * @example
 * sumWindow(map, '2026-05-11', 7)
 * // => { total: 12, categoryCounts: Map { 1 => { name: 'writing', color: 'blue', count: 5 }, ... } }
 */
function sumWindow(
  dataByDate: Map<string, HeatmapDay>,
  windowEndIsoDate: string,
  windowLength: number,
): {
  total: number
  categoryCounts: Map<number, TopCategory>
} {
  const categoryCounts = new Map<number, TopCategory>()
  let total = 0

  for (let dayOffset = 0; dayOffset < windowLength; dayOffset++) {
    const isoDate = shiftIsoDate(windowEndIsoDate, -dayOffset)
    const day = dataByDate.get(isoDate)
    if (!day) continue
    total += day.count

    for (const category of day.categories) {
      const existing = categoryCounts.get(category.id)
      if (existing) {
        existing.count += category.count
      } else {
        categoryCounts.set(category.id, {
          id: category.id,
          name: category.name,
          color: category.color,
          count: category.count,
        })
      }
    }
  }

  return { total, categoryCounts }
}

/**
 * Derives weekly summary stats (count, top categories, WoW trend) from the
 * heatmap response that the home page already fetches. Pure client-side
 * computation — no new procedure needed. Today is supplied by the caller as a
 * local-day key so tests can pin the anchor; production callers pass
 * `getLocalTodayIsoDate()`.
 *
 * Trend state semantics:
 * - `firstWeek` — heatmap is empty for the entire 14-day inspection window;
 *   prefer a welcoming "your first week" copy over a zero-vs-zero diff.
 * - `flat` — both windows have zero completions but older activity exists.
 *   The user took a break; render a quiet em-dash instead of "0%".
 * - `new` — prior window is zero, current is non-zero. Avoids `+Infinity%`.
 * - `percent` — both windows non-zero; `value` is `(current - prior) / prior * 100`.
 *
 * @param dataByDate - Per-day heatmap entries from `useHeatmapData()`
 * @param todayIso - "Today" as a YYYY-MM-DD local-day key (callers pass
 *   `getLocalTodayIsoDate()`)
 * @returns
 * - `WeeklyStats` with totals, top-3 categories, and discriminated trend
 * @example
 * aggregateLastSevenDays(new Map(), '2026-05-11')
 * // => { totalCompleted: 0, priorTotal: 0, topCategories: [], trend: { kind: 'firstWeek' } }
 * @example
 * // Map has 7 entries in current window, 0 in prior window
 * aggregateLastSevenDays(dataByDate, '2026-05-11')
 * // => { totalCompleted: 7, priorTotal: 0, topCategories: [...], trend: { kind: 'new' } }
 */
export function aggregateLastSevenDays(
  dataByDate: Map<string, HeatmapDay>,
  todayIso: string,
): WeeklyStats {
  const priorWindowEnd = shiftIsoDate(todayIso, -WEEKLY_WINDOW_DAYS)

  const current = sumWindow(dataByDate, todayIso, WEEKLY_WINDOW_DAYS)
  const prior = sumWindow(dataByDate, priorWindowEnd, WOW_PRIOR_WINDOW_DAYS)

  const topCategories = Array.from(current.categoryCounts.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      // Stable alphabetical tie-break; locale-insensitive `localeCompare` keeps
      // deterministic ordering across CI runners with different default locales.
      return a.name.localeCompare(b.name, 'en')
    })
    .slice(0, TOP_CATEGORIES_COUNT)

  // First-week heuristic: dataByDate has no entries anywhere in the 14-day
  // inspection window. dataByDate could still have older entries (a 365-day
  // response with activity 30 days ago); that case falls into `flat` because
  // we want the "your first week" copy reserved for true new users.
  const hasAnyActivity = dataByDate.size > 0
  const trend = ((): WeeklyTrend => {
    if (current.total === 0 && prior.total === 0) {
      return hasAnyActivity ? { kind: 'flat' } : { kind: 'firstWeek' }
    }
    if (prior.total === 0) return { kind: 'new' }
    const value = ((current.total - prior.total) / prior.total) * 100
    return { kind: 'percent', value: Math.round(value) }
  })()

  return {
    totalCompleted: current.total,
    priorTotal: prior.total,
    topCategories,
    trend,
  }
}

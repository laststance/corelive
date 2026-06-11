import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { calcStreak } from './calc-streak'

/**
 * Minimum distinct active UTC days a user must have within the trailing
 * 365-day window to qualify for an automatic Year-in-Review banner.
 *
 * Picked to be generous toward casual users (DESIGN.md voice: additive,
 * never KPI guilt) while still excluding the "I opened the app twice in
 * 2026" edge case where YIR copy would read sarcastic instead of warm.
 */
export const YIR_MIN_ACTIVE_DAYS = 30

/**
 * Output of {@link aggregateYearInReview}. Everything is derived from
 * the same `dataByDate` Map the heatmap already uses — no new oRPC
 * call needed.
 *
 * @example
 * {
 *   totalCompleted: 412,
 *   activeDays: 178,
 *   longestStreak: 31,
 *   topCategories: [
 *     { id: 1, name: 'writing', color: 'blue', count: 92 },
 *     { id: 2, name: 'reading', color: 'green', count: 71 },
 *     { id: 3, name: 'exercise', color: 'rose', count: 54 },
 *   ],
 *   year: 2026,
 *   eligible: true,
 * }
 */
export type YearInReview = {
  totalCompleted: number
  activeDays: number
  longestStreak: number
  topCategories: Array<{
    id: number
    name: string
    color: string
    count: number
  }>
  /** Calendar year the review is anchored on (year of the local `todayIso`). */
  year: number
  /**
   * Whether the user has enough distinct active days for the modal to
   * auto-open. The modal STILL surfaces totals when `eligible` is false
   * — the field is a gate on auto-open, not on render.
   */
  eligible: boolean
}

/**
 * Maximum categories surfaced in the modal's "top categories" block.
 * Three keeps the modal scannable on a phone without scrolling and
 * mirrors the WeeklySummaryCard's chip cap.
 */
const TOP_CATEGORIES_COUNT = 3

/**
 * Aggregates the calendar year the supplied `today` falls in. Walks
 * every entry in `dataByDate` once, summing per-category counts and
 * counting distinct active days. Pure client-side math — same Map the
 * heatmap already fetched.
 *
 * The function is intentionally tolerant of `dataByDate` carrying
 * entries outside the anchor year (e.g. a 365-day window crossing
 * year boundaries): only entries whose ISO key starts with `${year}-`
 * are counted, so the rollup stays year-pure.
 *
 * @param dataByDate - Per-day heatmap entries from `useHeatmapData()`
 * @param todayIso - "Today" as a YYYY-MM-DD local-day key — production callers
 *   pass `getLocalTodayIsoDate()`
 * @returns
 * - `YearInReview` summary for `todayIso`'s calendar year
 * @example
 * aggregateYearInReview(new Map(), '2026-12-15')
 * // => { totalCompleted: 0, activeDays: 0, longestStreak: 0, topCategories: [], year: 2026, eligible: false }
 */
export function aggregateYearInReview(
  dataByDate: Map<string, HeatmapDay>,
  todayIso: string,
): YearInReview {
  const year = Number(todayIso.slice(0, 4))
  const yearPrefix = `${year}-`

  let totalCompleted = 0
  let activeDays = 0
  const categoryTotals = new Map<
    number,
    { id: number; name: string; color: string; count: number }
  >()

  for (const [isoDate, day] of dataByDate) {
    if (!isoDate.startsWith(yearPrefix)) continue
    if (day.count > 0) {
      activeDays++
      totalCompleted += day.count
    }
    for (const category of day.categories) {
      const existing = categoryTotals.get(category.id)
      if (existing) {
        existing.count += category.count
      } else {
        categoryTotals.set(category.id, {
          id: category.id,
          name: category.name,
          color: category.color,
          count: category.count,
        })
      }
    }
  }

  const topCategories = Array.from(categoryTotals.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      // Deterministic tie-break — same locale-insensitive 'en' compare
      // used elsewhere so CI runners stay consistent.
      return a.name.localeCompare(b.name, 'en')
    })
    .slice(0, TOP_CATEGORIES_COUNT)

  // Year-scoped streak: filter dataByDate to the review year before passing
  // to calcStreak so a streak spanning Dec→Jan doesn't inflate the YIR
  // longest. The modal recaps "your <year>", not "your longest ever".
  const yearScopedData = new Map<string, HeatmapDay>()
  for (const [isoDate, day] of dataByDate) {
    if (isoDate.startsWith(yearPrefix)) yearScopedData.set(isoDate, day)
  }
  const { longestStreak } = calcStreak(yearScopedData, todayIso)

  return {
    totalCompleted,
    activeDays,
    longestStreak,
    topCategories,
    year,
    eligible: activeDays >= YIR_MIN_ACTIVE_DAYS,
  }
}

/**
 * Decides whether the Year-in-Review modal should auto-open for the
 * supplied date + summary. The modal opens when:
 *
 * 1. The anchor date is in December (local month 12), AND
 * 2. The user has crossed {@link YIR_MIN_ACTIVE_DAYS} active days for
 *    the year.
 *
 * Why December: a year-end retrospective is a calmer prompt than a
 * mid-year banner — see DESIGN.md "Year-in-Review" §, which calls for
 * the modal to feel like a fireside recap, not a quarterly KPI.
 *
 * The `?force=YYYY-12-31` URL flag bypasses this gate for QA so we can
 * snapshot the modal mid-May without time-warping the system clock —
 * see {@link parseForceDate}.
 *
 * @param todayIso - Anchor day as a YYYY-MM-DD local-day key
 * @param summary - Aggregated review for that date's year
 * @returns
 * - `true` when the modal should auto-open, `false` otherwise
 * @example
 * shouldAutoOpenYir('2026-12-15', eligibleSummary) // => true
 * shouldAutoOpenYir('2026-05-12', eligibleSummary) // => false
 * shouldAutoOpenYir('2026-12-15', notEligibleSummary) // => false
 */
export function shouldAutoOpenYir(
  todayIso: string,
  summary: YearInReview,
): boolean {
  const isDecember = todayIso.slice(5, 7) === '12'
  return isDecember && summary.eligible
}

/**
 * Parses a `?force=YYYY-MM-DD` URL search param into a validated YYYY-MM-DD
 * local-day key. Returns `null` for missing, malformed, or non-calendar
 * values so the caller can fall back to `getLocalTodayIsoDate()` without
 * throwing.
 *
 * The flag is strictly opt-in (QA-only) and never exposed in the UI —
 * users who land on a URL carrying `?force=` see the same modal a real
 * December user would, which is the whole point of the flag.
 *
 * @param raw - Raw `?force=` value or `null` from `URLSearchParams.get`
 * @returns
 * - The validated YYYY-MM-DD string when `raw` is a real calendar date
 * - `null` when missing or malformed
 * @example
 * parseForceDate('2026-12-31')  // => '2026-12-31'
 * parseForceDate('2026-02-30')  // => null (not a real calendar date)
 * parseForceDate('bogus')       // => null
 * parseForceDate(null)          // => null
 */
export function parseForceDate(raw: string | null): string | null {
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const candidate = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(candidate.getTime())) return null
  // Round-trip check rejects day-rollover inputs like `2026-02-30` (which
  // JS Date silently rolls to `2026-03-02`). Without this, the URL surface
  // says one date but the modal renders a different year.
  if (candidate.toISOString().slice(0, 10) !== raw) return null
  return raw
}

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { shiftIsoDate } from './shiftIsoDate'

/**
 * "Shown-up" tiers for milestone notifications. Picked to match the cadence
 * of habit formation literature (week=1, month=4, hundred=14 weeks, year=52
 * weeks) while staying ergonomic to remember.
 *
 * Ordering matters: descending so {@link calcStreak} can short-circuit on
 * the first hit when computing `currentTier`.
 */
export const STREAK_TIERS = [365, 100, 30, 7] as const

/**
 * One of the milestone tiers, or `null` if the user has not yet reached
 * the first tier (7 days).
 */
export type StreakTier = (typeof STREAK_TIERS)[number] | null

/**
 * Result of {@link calcStreak}. All fields are computed against the supplied
 * `todayIso` local-day key via pure string math so tests and SSR are
 * deterministic; the hook layer is responsible for sourcing "today" appropriately.
 *
 * @example
 * {
 *   currentStreak: 18,
 *   longestStreak: 42,
 *   currentTier: 7,
 *   shownUpThisMonth: 14,
 * }
 */
export type StreakSummary = {
  /** Consecutive calendar days ending today (or yesterday — grace period)
   * with at least one completed entry. Zero when the most recent activity is
   * older than yesterday. */
  currentStreak: number
  /** Longest run of consecutive calendar days with at least one entry anywhere
   * in `dataByDate`. */
  longestStreak: number
  /** Highest tier the current streak has crossed: `7`, `30`, `100`, `365`,
   * or `null` (streak < 7). Used by `useStreakNotifications` to decide
   * whether to fire a one-shot milestone notification — paired with a
   * `streak-max-tier-notified` localStorage key so a tier never re-fires
   * after the user breaks and rebuilds a streak (DESIGN.md D12:
   * "never decreases without explanation"). */
  currentTier: StreakTier
  /** Distinct local-day keys with activity within `todayIso`'s calendar month.
   * Surfaced as "shown up N days this month" per DESIGN.md voice — never
   * decreases mid-month because it is a count, not a delta. */
  shownUpThisMonth: number
}

/**
 * Returns `true` when the supplied YYYY-MM-DD key maps to a `HeatmapDay` with
 * at least one completion. The Map is shaped by the heatmap response —
 * absent dates are zero-count rest days.
 *
 * @param dataByDate - Per-day heatmap entries from `useHeatmapData()`
 * @param isoDate - YYYY-MM-DD lookup key
 * @returns
 * - `true` if the day exists and has count >= 1, `false` otherwise
 * @example
 * hasActivity(map, '2026-05-12')
 */
function hasActivity(
  dataByDate: Map<string, HeatmapDay>,
  isoDate: string,
): boolean {
  const day = dataByDate.get(isoDate)
  return Boolean(day && day.count > 0)
}

/**
 * Calculates current and longest "shown-up" streaks and the current tier
 * from a heatmap data Map. Pure local-day-key string math via
 * {@link shiftIsoDate} (which steps dates UTC-internally) so the function is
 * DST-safe by construction.
 *
 * Grace period: a current streak is preserved when the most recent activity
 * is *yesterday* (e.g. user hasn't done their first task of today yet). When
 * the most recent activity is older than yesterday, `currentStreak` is 0.
 *
 * Tier logic: returns the highest of {@link STREAK_TIERS} that
 * `currentStreak` has crossed. Pair the return with a localStorage
 * "max-ever-notified" key so milestones never re-fire after a break (per
 * DESIGN.md D12 "additive, never decreases").
 *
 * The longest-streak scan walks every key in the Map, not just a window, so
 * it is correct for arbitrary heatmap response sizes (default 365 days).
 *
 * @param dataByDate - Per-day heatmap entries keyed by local YYYY-MM-DD
 * @param todayIso - "Today" as a YYYY-MM-DD local-day key; production callers
 *   pass {@link import('./getLocalTodayIsoDate').getLocalTodayIsoDate}()
 * @returns
 * - `StreakSummary` with `currentStreak`, `longestStreak`, `currentTier`,
 *   `shownUpThisMonth`
 * @example
 * calcStreak(new Map(), '2026-05-12')
 * // => { currentStreak: 0, longestStreak: 0, currentTier: null, shownUpThisMonth: 0 }
 * @example
 * // dataByDate has 8 consecutive days ending today
 * calcStreak(dataByDate, '2026-05-12')
 * // => { currentStreak: 8, longestStreak: 8, currentTier: 7, ... }
 */
export function calcStreak(
  dataByDate: Map<string, HeatmapDay>,
  todayIso: string,
): StreakSummary {
  const yesterdayIso = shiftIsoDate(todayIso, -1)

  // Anchor the backward walk on whichever of (today, yesterday) is the most
  // recent day with activity. If neither has activity, current streak is 0.
  // This is the "grace period" — finishing your first task by end-of-day
  // tomorrow still preserves the streak.
  let anchorIso: string | null = null
  if (hasActivity(dataByDate, todayIso)) {
    anchorIso = todayIso
  } else if (hasActivity(dataByDate, yesterdayIso)) {
    anchorIso = yesterdayIso
  }

  let currentStreak = 0
  if (anchorIso) {
    currentStreak = 1
    let cursor = shiftIsoDate(anchorIso, -1)
    while (hasActivity(dataByDate, cursor)) {
      currentStreak++
      cursor = shiftIsoDate(cursor, -1)
    }
  }

  // Longest streak: collect all active dates, sort, single pass counting
  // consecutive calendar days. Using ISO strings as the comparison key keeps
  // this independent of `Date` parsing edge cases.
  const activeDates = Array.from(dataByDate.keys())
    .filter((isoDate) => hasActivity(dataByDate, isoDate))
    .sort()

  let longestStreak = 0
  let runLength = 0
  let previousIso: string | null = null
  for (const isoDate of activeDates) {
    if (previousIso && shiftIsoDate(previousIso, 1) === isoDate) {
      runLength++
    } else {
      runLength = 1
    }
    if (runLength > longestStreak) longestStreak = runLength
    previousIso = isoDate
  }
  // The in-progress current streak can extend past the latest archived day
  // (e.g. yesterday-grace anchor) so make sure `longestStreak` reflects it.
  if (currentStreak > longestStreak) longestStreak = currentStreak

  const currentTier = computeTier(currentStreak)

  // "Shown up N days this month": distinct local-day keys with activity inside
  // today's calendar month. Pure count, never a delta — copy stays additive
  // even mid-month per DESIGN.md voice.
  const monthPrefix = todayIso.slice(0, 7) // YYYY-MM
  let shownUpThisMonth = 0
  for (const isoDate of activeDates) {
    if (isoDate.startsWith(monthPrefix)) shownUpThisMonth++
  }

  return { currentStreak, longestStreak, currentTier, shownUpThisMonth }
}

/**
 * Highest tier from {@link STREAK_TIERS} that the supplied streak crosses,
 * or `null` when the streak is below the first tier (7).
 *
 * @param streak - Non-negative integer day count
 * @returns
 * - `365` | `100` | `30` | `7` when crossed, else `null`
 * @example
 * computeTier(0)   // => null
 * computeTier(6)   // => null
 * computeTier(7)   // => 7
 * computeTier(35)  // => 30
 * computeTier(400) // => 365
 */
function computeTier(streak: number): StreakTier {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier) return tier
  }
  return null
}

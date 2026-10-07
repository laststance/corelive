import { toLocalDayKey } from './toLocalDayKey'

/**
 * Today's calendar day (YYYY-MM-DD) in the *browser's* local timezone — the
 * single client-side derivation of "today" so every consumer (weekly summary,
 * category trends, streak notifications, year-in-review, day-detail) agrees
 * with the server, which keys the same heatmap data by the user's local day.
 * Computing it any other way (e.g. `new Date().toISOString()`) reintroduces
 * the UTC off-by-one near local midnight that L3 exists to remove.
 *
 * Pure helpers take an explicit `todayIso: string` for determinism; this is
 * the one impure "real now" seam, called only from render/effect paths.
 *
 * @returns YYYY-MM-DD for the current moment in the browser's resolved zone
 * @example
 * getLocalTodayIsoDate() // => '2026-06-11' (for a user in JST at 09:00 local)
 */
export function getLocalTodayIsoDate(): string {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return toLocalDayKey(new Date(), browserZone)
}

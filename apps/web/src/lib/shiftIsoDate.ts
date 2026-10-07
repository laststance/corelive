/**
 * Adds (or subtracts) calendar days to a YYYY-MM-DD date string and returns
 * the new YYYY-MM-DD string. Pure UTC arithmetic — DST-safe by construction
 * because UTC has no DST. Matches the heatmap's bucketing scheme
 * (`completedAt.toISOString().split('T')[0]`) so the output is always a valid
 * lookup key for `dataByDate` and `getDayDetail`.
 *
 * Used by:
 * - `ContributionGraph.handleNavigate` (←/→ buttons inside DayDetailDialog)
 * - `useKeyboardNav` in PR2 (same callback, j/k key bindings)
 *
 * @param isoDate - YYYY-MM-DD string (zero-padded; validated upstream by `DayDetailInputSchema`)
 * @param dayOffset - Integer days to shift. Positive moves forward; negative moves backward.
 * @returns
 * - The shifted YYYY-MM-DD string
 * @example
 * shiftIsoDate('2026-05-10', 1)   // => '2026-05-11'
 * shiftIsoDate('2026-05-10', -1)  // => '2026-05-09'
 * shiftIsoDate('2026-05-31', 1)   // => '2026-06-01'
 * shiftIsoDate('2025-12-31', 1)   // => '2026-01-01'
 * shiftIsoDate('2024-02-28', 1)   // => '2024-02-29' (leap year)
 * shiftIsoDate('2026-02-28', 1)   // => '2026-03-01' (non-leap)
 */
export function shiftIsoDate(isoDate: string, dayOffset: number): string {
  const utcAnchor = new Date(`${isoDate}T00:00:00.000Z`)
  utcAnchor.setUTCDate(utcAnchor.getUTCDate() + dayOffset)
  return utcAnchor.toISOString().slice(0, 10)
}

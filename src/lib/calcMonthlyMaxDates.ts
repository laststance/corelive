import type { HeatmapDay } from '@/hooks/useHeatmapData'

/**
 * Returns the set of YYYY-MM-DD dates that are the highest-count day inside
 * each YYYY-MM calendar month found in `dataByDate`. The home heatmap paints
 * a `◎` glyph on these cells so each month's "best day" reads at a glance
 * without crowding lighter days.
 *
 * Decisions (locked in eng review §1.5):
 * - **Tie policy:** earliest date wins. Visual sparsity > completeness; a
 *   single anchor per month keeps the heatmap quiet. Tracked as a deferred
 *   TODO ("Per-month tie-break for max mark") if user feedback wants ties
 *   surfaced.
 * - **Empty months:** months whose days are all `count === 0` are excluded.
 *   A peak of zero is not a peak; rendering ◎ on a fully-rest month would
 *   read as a false accomplishment.
 * - **Source of truth:** `HeatmapDay.count` is the union of Todo+Completed,
 *   so the mark already accounts for BrainDump checkbox-tick completions.
 *
 * @param dataByDate - Map keyed by YYYY-MM-DD returned by `useHeatmapData`
 * @returns
 * - `Set<string>` of YYYY-MM-DD strings, one per non-empty month
 * - Empty `Set` when the input has no entries (or only zero-count entries)
 * @example
 * // Single max in 2026-05
 * calcMonthlyMaxDates(new Map([
 *   ['2026-05-04', { date: '2026-05-04', count: 3, categories: [] }],
 *   ['2026-05-10', { date: '2026-05-10', count: 7, categories: [] }],
 * ]))
 * // => new Set(['2026-05-10'])
 *
 * @example
 * // Tie within month → earliest wins
 * calcMonthlyMaxDates(new Map([
 *   ['2026-05-04', { date: '2026-05-04', count: 5, categories: [] }],
 *   ['2026-05-10', { date: '2026-05-10', count: 5, categories: [] }],
 * ]))
 * // => new Set(['2026-05-04'])
 *
 * @example
 * // All-zero month is omitted entirely
 * calcMonthlyMaxDates(new Map([
 *   ['2026-04-01', { date: '2026-04-01', count: 0, categories: [] }],
 * ]))
 * // => new Set()
 */
export function calcMonthlyMaxDates(
  dataByDate: Map<string, HeatmapDay>,
): Set<string> {
  // Group days by YYYY-MM, then pick the single peak day per group. We can't
  // short-circuit on the first day per month because subsequent days may
  // dethrone the running peak. Linear pass is O(N) over the heatmap window
  // (~365 entries) — trivially cheap.
  const monthlyPeak = new Map<string, { date: string; count: number }>()

  for (const [isoDate, day] of dataByDate) {
    if (day.count <= 0) continue

    const monthKey = isoDate.slice(0, 7)
    const currentPeak = monthlyPeak.get(monthKey)

    if (!currentPeak) {
      monthlyPeak.set(monthKey, { date: isoDate, count: day.count })
      continue
    }

    if (day.count > currentPeak.count) {
      monthlyPeak.set(monthKey, { date: isoDate, count: day.count })
      continue
    }

    // Equal-count tie: keep the earlier ISO date. ISO strings compare
    // lexicographically the same as chronologically, so a plain `<` works.
    if (day.count === currentPeak.count && isoDate < currentPeak.date) {
      monthlyPeak.set(monthKey, { date: isoDate, count: day.count })
    }
  }

  return new Set(Array.from(monthlyPeak.values()).map((peak) => peak.date))
}

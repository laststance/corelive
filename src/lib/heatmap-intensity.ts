/**
 * Heatmap intensity — the single source of truth that maps a day's completion
 * count to one of five Warm Cathedral "temperature" levels, plus the CSS tokens
 * that paint them. Shared by the ContributionGraph cells and the DayDetailDialog
 * level band so a cell's color and the dialog's band can never drift apart.
 *
 * Invariant (DESIGN.md "Heatmap Cathedral", locked 2026-06-10): intensity is a
 * pure function of the raw completion COUNT — more completions = warmer. The
 * count already includes repetition (doing the same task twice counts as two;
 * repeats are XP and are never deduplicated), so this module neither sees nor
 * collapses repeats — it only buckets a number. Do not add recency, streak, or
 * category weighting here; "temperature = pride", and pride scales with count.
 */

/** Discrete heatmap level, coolest (0, rest) to warmest (4, cathedral lit). */
export type Intensity = 0 | 1 | 2 | 3 | 4

/** Min completions for the L2 "good day" band; below it (1–3) is L1 "started". */
export const HEATMAP_GOOD_DAY_MIN = 4

/** Min completions for the L3 "full day" band (4–9 stays L2 "good day"). */
export const HEATMAP_FULL_DAY_MIN = 10

/** Min completions for the L4 "cathedral lit" band (10–19 stays L3 "full day"). */
export const HEATMAP_CATHEDRAL_MIN = 20

/**
 * The five heatmap palette tokens, indexed by {@link Intensity}. Each is a CSS
 * custom property (`--hm-0` … `--hm-4`) resolved per active theme in globals.css,
 * so the whole gradient re-tints automatically when the theme changes.
 */
export const HEATMAP_LEVEL_TOKENS = [
  'var(--hm-0)',
  'var(--hm-1)',
  'var(--hm-2)',
  'var(--hm-3)',
  'var(--hm-4)',
] as const

/**
 * Maps a day's completion count to its heatmap intensity level. Thresholds match
 * @uiw/react-heat-map's `panelColors` bucketing in ContributionGraph, so a
 * heatmap cell and the DayDetailDialog band always show the same level.
 * @param dayCount - Completed tasks on the day (raw count, repetition included)
 * @returns
 * - 0 when no completions (rest day)
 * - 1 for 1–3 (started)
 * - 2 for 4–9 (good day)
 * - 3 for 10–19 (full day)
 * - 4 for 20+ (cathedral lit)
 * @example
 * getHeatmapIntensityFromCount(0)  // => 0
 * getHeatmapIntensityFromCount(7)  // => 2
 * getHeatmapIntensityFromCount(22) // => 4
 */
export function getHeatmapIntensityFromCount(dayCount: number): Intensity {
  if (dayCount === 0) return 0
  if (dayCount < HEATMAP_GOOD_DAY_MIN) return 1
  if (dayCount < HEATMAP_FULL_DAY_MIN) return 2
  if (dayCount < HEATMAP_CATHEDRAL_MIN) return 3
  return 4
}

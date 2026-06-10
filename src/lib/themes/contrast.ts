/**
 * Theme contrast utilities — a thin culori wrapper for WCAG math, used by the
 * build-time theme generator (scripts/generate-theme-css.ts) and its tests to
 * guarantee every generated theme meets AA.
 *
 * BUILD/TEST ONLY: culori is a devDependency, so nothing here may be imported by
 * runtime app code — that would pull culori into the client bundle and reintroduce
 * color math at runtime, which the static-CSS theme architecture exists to avoid.
 */
import { wcagContrast } from 'culori'

/** WCAG AA minimum contrast ratio for normal body text. */
export const AA_TEXT_CONTRAST = 4.5
/** WCAG AA minimum contrast ratio for large text and UI components. */
export const AA_LARGE_CONTRAST = 3

/**
 * The brand near-white and near-ink, used as the default foreground candidates so
 * contrast-computed text keeps the Warm Cathedral voice (matches the cathedral
 * `--primary-foreground` / `--foreground` lightness in globals.css).
 */
const DEFAULT_FOREGROUNDS = ['oklch(0.99 0 0)', 'oklch(0.18 0.015 30)'] as const

/**
 * WCAG 2.x contrast ratio between two CSS colors — exists so the generator can
 * reject any theme surface below AA; called by meetsAA/readableForeground and the
 * color tests. Accepts any culori-parsable color (incl. OKLCH); order-independent.
 * @param foreground - A CSS color string, e.g. 'oklch(0.62 0.16 50)' or '#fff'.
 * @param background - A CSS color string.
 * @returns the contrast ratio in the range 1 (identical) to 21 (black vs white).
 * @example
 * contrastRatio('#000000', '#ffffff') // => 21
 * contrastRatio('#777777', '#777777') // => 1
 */
export function contrastRatio(foreground: string, background: string): number {
  return wcagContrast(foreground, background)
}

/**
 * Whether a foreground/background pair clears WCAG AA — the per-surface gate the
 * generator's AA test asserts for every theme.
 * @param foreground - CSS color of the text/element.
 * @param background - CSS color of the surface behind it.
 * @param large - true for large text / UI components (AA 3.0); false for body text (AA 4.5).
 * @returns true when the ratio meets the AA threshold for that text size.
 * @example
 * meetsAA('#ffffff', '#000000')  // => true  (21)
 * meetsAA('#cccccc', '#ffffff')  // => false (~1.6)
 */
export function meetsAA(
  foreground: string,
  background: string,
  large = false,
): boolean {
  return (
    contrastRatio(foreground, background) >=
    (large ? AA_LARGE_CONTRAST : AA_TEXT_CONTRAST)
  )
}

/**
 * Picks the highest-contrast foreground for a background, so tokens like
 * `--primary-foreground` are contrast-computed per theme instead of hardcoded
 * white (which fails AA on light accents — design decision D-D / #12).
 * @param background - The surface the text will sit on.
 * @param candidates - Foreground options; the first wins ties. Defaults to the
 *   brand near-white and near-ink.
 * @returns the candidate with the greatest contrast ratio against `background`.
 * @example
 * readableForeground('#ffffff', ['#ffffff', '#000000']) // => '#000000'
 * readableForeground('#000000', ['#ffffff', '#000000']) // => '#ffffff'
 */
export function readableForeground(
  background: string,
  candidates: readonly string[] = DEFAULT_FOREGROUNDS,
): string {
  let best = candidates[0] ?? DEFAULT_FOREGROUNDS[0]
  let bestRatio = contrastRatio(best, background)
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background)
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = candidate
    }
  }
  return best
}

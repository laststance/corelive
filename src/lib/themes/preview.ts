import { THEME_REGISTRY } from './registry'
import type { ThemeId, ThemeMode } from './registry'

/**
 * A theme's identity reduced to the few swatches the picker preview renders —
 * built from the SAME OKLCH derivation as the generated CSS, so the chip the user
 * sees matches the real theme exactly (no single hex dot). Runtime-safe: unlike
 * `scripts/generate-theme-css.ts` this never imports culori, so it ships in the
 * client bundle. `preview.test.ts` pins these against `generated.css`.
 */
export interface ThemePreview {
  /** `--background` — the page surface the chip sits on. */
  surface: string
  /** `--card` — a raised panel tone, layered over the surface. */
  card: string
  /** `--primary` — the family signature accent. */
  accent: string
  /** `--foreground` — body text, sampled on the surface (never on the accent). */
  text: string
  /** `--hm-0..4` — the rest→warm-apex heatmap ramp (5 stops, ordered). */
  heatmap: string[]
}

/**
 * The fixed cathedral lightness/chroma ladder every colored family derives from
 * (mirrors the `CATHEDRAL` ladder in `scripts/generate-theme-css.ts`). Colored
 * families reuse these L (and the heatmap C) and only swap in their own
 * neutral/heatmap hue + neutral/accent chroma — exactly what the generator does.
 * Pinned to `generated.css` by `preview.test.ts`, so drift fails CI.
 */
const SURFACE_LIGHTNESS = { light: 0.975, dark: 0.172 } as const
const CARD_LIGHTNESS = { light: 0.972, dark: 0.235 } as const
const TEXT_LIGHTNESS = { light: 0.18, dark: 0.96 } as const
const HEATMAP_LIGHTNESS = {
  light: [0.96, 0.89, 0.78, 0.65, 0.55],
  dark: [0.22, 0.32, 0.45, 0.58, 0.7],
} as const
const HEATMAP_CHROMA = {
  light: [0.008, 0.06, 0.11, 0.14, 0.16],
  dark: [0.012, 0.06, 0.1, 0.13, 0.15],
} as const

/** Formats an OKLCH triple the same way the generator does, e.g. `oklch(0.62 0.16 50)`. */
const oklch = (lightness: number, chroma: number, hue: number): string =>
  `oklch(${lightness} ${chroma} ${hue})`

/**
 * Warm Cathedral is hand-authored (`preserve: true`) with a DIFFERENT neutral
 * chroma per token (0.016 bg / 0.018 card / 0.015 text), so it cannot be rebuilt
 * from a single `neutralChroma` like the colored families. Its swatches are taken
 * verbatim from globals.css instead. Pinned by `preview.test.ts`.
 */
const CATHEDRAL_PREVIEW: Record<ThemeMode, ThemePreview> = {
  light: {
    surface: 'oklch(0.975 0.016 80)',
    card: 'oklch(0.972 0.018 78)',
    accent: 'oklch(0.62 0.16 50)',
    text: 'oklch(0.18 0.015 30)',
    heatmap: [
      'oklch(0.96 0.008 80)',
      'oklch(0.89 0.06 75)',
      'oklch(0.78 0.11 70)',
      'oklch(0.65 0.14 60)',
      'oklch(0.55 0.16 40)',
    ],
  },
  dark: {
    surface: 'oklch(0.172 0.026 40)',
    card: 'oklch(0.235 0.028 44)',
    accent: 'oklch(0.7 0.16 55)',
    text: 'oklch(0.96 0.005 75)',
    heatmap: [
      'oklch(0.22 0.012 40)',
      'oklch(0.32 0.06 50)',
      'oklch(0.45 0.1 55)',
      'oklch(0.58 0.13 60)',
      'oklch(0.7 0.15 65)',
    ],
  },
}

/**
 * Builds the composite preview swatches for a theme id, so the two-axis picker
 * (T8) can render every family's identity without the runtime importing culori or
 * reading the generated CSS. Cathedral is returned verbatim; colored families are
 * reconstructed from their registry seed at the cathedral ladder — identical to
 * `generated.css` (verified in `preview.test.ts`).
 * @param id - A registered theme id.
 * @returns the surface/card/accent/text swatches plus the 5-stop heatmap ramp,
 *   each an `oklch(...)` string ready for a CSS `background`/`color` value.
 * @example
 * getThemePreview('harbor-light').accent // => 'oklch(0.555 0.135 250)'
 * getThemePreview('light').surface       // => 'oklch(0.975 0.016 80)'
 */
export function getThemePreview(id: ThemeId): ThemePreview {
  const seed = THEME_REGISTRY[id]
  // Cathedral is hand-authored — reuse its exact globals.css swatches.
  if (seed.preserve) return CATHEDRAL_PREVIEW[seed.mode]

  // Colored families: cathedral L + the family's own neutral/accent/heatmap params.
  const mode = seed.mode
  const { neutralChroma, neutralHue } = seed
  const rampLightness = HEATMAP_LIGHTNESS[mode]
  const rampChroma = HEATMAP_CHROMA[mode]
  const rampHues = seed.heatmapHues
  return {
    surface: oklch(SURFACE_LIGHTNESS[mode], neutralChroma, neutralHue),
    card: oklch(CARD_LIGHTNESS[mode], neutralChroma, neutralHue),
    accent: oklch(seed.accentL, seed.accentChroma, seed.accentHue),
    text: oklch(TEXT_LIGHTNESS[mode], neutralChroma, neutralHue),
    // Explicit literal indices (not `.map`) so each tuple access stays `number`
    // under `noUncheckedIndexedAccess` — a dynamic index would widen to `undefined`.
    heatmap: [
      oklch(rampLightness[0], rampChroma[0], rampHues[0]),
      oklch(rampLightness[1], rampChroma[1], rampHues[1]),
      oklch(rampLightness[2], rampChroma[2], rampHues[2]),
      oklch(rampLightness[3], rampChroma[3], rampHues[3]),
      oklch(rampLightness[4], rampChroma[4], rampHues[4]),
    ],
  }
}

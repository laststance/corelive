/**
 * Theme registry — the single source of truth for every theme CoreLive ships.
 *
 * Framework-agnostic (no `'use client'`) so the build-time CSS generator, unit
 * tests, Electron, and the React provider can all import it. The default
 * "cathedral" family is the untouched Warm Cathedral light/dark (hand-authored
 * in globals.css); colored families get added here as one DerivedTheme seed each,
 * without touching any consumer. Exists so theme identity lives in one place
 * instead of being hardcoded across the provider, the picker, chart.tsx, and
 * globals.css.
 */

/** A theme's light/dark axis. Drives `color-scheme` and the `dark:` variant. */
export type ThemeMode = 'light' | 'dark'

/**
 * A color identity. Each family ships a light + dark pair. The default
 * "cathedral" family keeps the flat `light`/`dark` ids for zero migration; the
 * colored families tint neutrals toward their accent hue and re-aim the heatmap's
 * rest→warm-apex hue path, while the heatmap L/C ramp and the warm
 * chart/destructive identity stay fixed across every family (design decision #15).
 */
export type ThemeFamilyId =
  | 'cathedral'
  | 'harbor'
  | 'grove'
  | 'rose-tea'
  | 'iris'
  | 'graphite'

/**
 * Stored theme id — the value next-themes persists to localStorage and writes
 * to the `data-theme` attribute. Cathedral keeps the flat `light`/`dark` ids for
 * zero migration; colored families use the `${family}-${mode}` shape (the
 * template auto-expands when a family is added to `ThemeFamilyId`).
 */
export type ThemeId =
  | 'light'
  | 'dark'
  | `${Exclude<ThemeFamilyId, 'cathedral'>}-${ThemeMode}`

/** Identity + picker metadata carried by every theme, preserved or derived. */
interface ThemeBase {
  family: ThemeFamilyId
  mode: ThemeMode
  id: ThemeId
  /** Display name shown in the theme picker. */
  name: string
  /** Hex swatch shown in the current picker (replaced by a token preview in T8). */
  preview: string
  /** Emitted as `color-scheme` in generated CSS; also hints UA form controls. */
  colorScheme: ThemeMode
}

/**
 * A hand-authored theme: its CSS lives in globals.css and the generator emits
 * NOTHING for it (skips it), so the Warm Cathedral brand never drifts. The
 * byte-for-byte guarantee is enforced by a globals.css snapshot test, not by
 * re-emitting it from a formula (cathedral is hand-tuned and would not reproduce).
 */
export interface PreservedTheme extends ThemeBase {
  preserve: true
}

/**
 * A generated theme: the generator derives its ~36 color tokens from these OKLCH
 * seed params at the fixed cathedral lightness ladder. `preserve: false` is the
 * union discriminant.
 * - `accent*` — the family signature color (`--primary`, `--ring`, sidebar primary/ring)
 * - `neutral*` — hue/chroma for every neutral surface, text, and border (L from the ladder)
 * - `heatmapHues` — the 5-stop rest→warm-apex hue path; L/C reuse the cathedral ramp
 */
export interface DerivedTheme extends ThemeBase {
  preserve: false
  accentL: number
  accentChroma: number
  accentHue: number
  neutralChroma: number
  neutralHue: number
  heatmapHues: readonly [number, number, number, number, number]
}

/** One registry entry — a preserved (cathedral) or derived (colored) theme. */
export type ThemeSeed = PreservedTheme | DerivedTheme

/**
 * Every theme, keyed by its stored id. Currently the untouched Warm Cathedral
 * light/dark; colored families are appended here (one DerivedTheme per family/mode).
 */
export const THEME_REGISTRY = {
  light: {
    family: 'cathedral',
    mode: 'light',
    id: 'light',
    name: 'Light',
    preview: '#ffffff',
    colorScheme: 'light',
    preserve: true,
  },
  dark: {
    family: 'cathedral',
    mode: 'dark',
    id: 'dark',
    name: 'Dark',
    preview: '#1a1a1a',
    colorScheme: 'dark',
    preserve: true,
  },

  // ── Colored families (design doc 2026-06-10, lines 501-506) ──────────────────
  // Accent L/C/H + heatmapHues are the approved seed. neutralHue = accentHue (each
  // family tints its neutral surfaces toward its own signature); neutralChroma is a
  // low, mode-scoped tint (~0.012 light / 0.014 dark). `preview` = the accent hex
  // (current picker swatch; T8 replaces it with a token composite). primary-foreground
  // is contrast-computed by the generator, never stored here.

  // Harbor — calm blue. light accentL nudged 0.56→0.555 for a stable AA margin
  // (0.56 cleared 4.5 by only 0.014; 0.555 → 4.61).
  'harbor-light': {
    family: 'harbor',
    mode: 'light',
    id: 'harbor-light',
    name: 'Harbor Light',
    preview: '#2776be',
    colorScheme: 'light',
    preserve: false,
    accentL: 0.555,
    accentChroma: 0.135,
    accentHue: 250,
    neutralChroma: 0.012,
    neutralHue: 250,
    heatmapHues: [235, 220, 95, 60, 42],
  },
  'harbor-dark': {
    family: 'harbor',
    mode: 'dark',
    id: 'harbor-dark',
    name: 'Harbor Dark',
    preview: '#57a3ef',
    colorScheme: 'dark',
    preserve: false,
    accentL: 0.7,
    accentChroma: 0.135,
    accentHue: 250,
    neutralChroma: 0.014,
    neutralHue: 250,
    heatmapHues: [235, 220, 95, 60, 42],
  },

  // Grove — forest green. light accentL nudged 0.55→0.54 to clear the AA gate
  // (0.55 → 4.48, below 4.5; 0.54 → 4.67). Accent hue 145 lands on the fixed
  // `--chart-2` (145) and near `--success` (149); a green theme also dilutes
  // green's "success everywhere" semantic. Separable by chroma/lightness but
  // flagged for design-review (design doc collision note, line 512).
  'grove-light': {
    family: 'grove',
    mode: 'light',
    id: 'grove-light',
    name: 'Grove Light',
    preview: '#3b8040',
    colorScheme: 'light',
    preserve: false,
    accentL: 0.54,
    accentChroma: 0.12,
    accentHue: 145,
    neutralChroma: 0.012,
    neutralHue: 145,
    heatmapHues: [140, 132, 95, 65, 42],
  },
  'grove-dark': {
    family: 'grove',
    mode: 'dark',
    id: 'grove-dark',
    name: 'Grove Dark',
    preview: '#70b972',
    colorScheme: 'dark',
    preserve: false,
    accentL: 0.72,
    accentChroma: 0.125,
    accentHue: 145,
    neutralChroma: 0.014,
    neutralHue: 145,
    heatmapHues: [140, 132, 95, 65, 42],
  },

  // Rose Tea — dusty rose. Accent hue 18 sits near the fixed `--destructive` (25);
  // they stay separable by chroma/lightness, flagged for design-review.
  'rose-tea-light': {
    family: 'rose-tea',
    mode: 'light',
    id: 'rose-tea-light',
    name: 'Rose Tea Light',
    preview: '#b84c55',
    colorScheme: 'light',
    preserve: false,
    accentL: 0.56,
    accentChroma: 0.14,
    accentHue: 18,
    neutralChroma: 0.012,
    neutralHue: 18,
    heatmapHues: [25, 32, 45, 55, 38],
  },
  'rose-tea-dark': {
    family: 'rose-tea',
    mode: 'dark',
    id: 'rose-tea-dark',
    name: 'Rose Tea Dark',
    preview: '#ed7f84',
    colorScheme: 'dark',
    preserve: false,
    accentL: 0.72,
    accentChroma: 0.135,
    accentHue: 18,
    neutralChroma: 0.014,
    neutralHue: 18,
    heatmapHues: [25, 32, 45, 55, 38],
  },

  // Iris — soft violet. Heatmap rests violet (300) and arcs through magenta to the
  // shared warm apex (45).
  'iris-light': {
    family: 'iris',
    mode: 'light',
    id: 'iris-light',
    name: 'Iris Light',
    preview: '#7764ba',
    colorScheme: 'light',
    preserve: false,
    accentL: 0.56,
    accentChroma: 0.13,
    accentHue: 292,
    neutralChroma: 0.012,
    neutralHue: 292,
    heatmapHues: [300, 315, 340, 25, 45],
  },
  'iris-dark': {
    family: 'iris',
    mode: 'dark',
    id: 'iris-dark',
    name: 'Iris Dark',
    preview: '#a795ef',
    colorScheme: 'dark',
    preserve: false,
    accentL: 0.72,
    accentChroma: 0.13,
    accentHue: 292,
    neutralChroma: 0.014,
    neutralHue: 292,
    heatmapHues: [300, 315, 340, 25, 45],
  },

  // Graphite — near-neutral slate. The accent itself is nearly desaturated
  // (chroma ~0.02): the only real chroma on screen is the heatmap bloom — the
  // purest expression of the temperature=pride invariant (design doc lines 506-510).
  'graphite-light': {
    family: 'graphite',
    mode: 'light',
    id: 'graphite-light',
    name: 'Graphite Light',
    preview: '#4d5660',
    colorScheme: 'light',
    preserve: false,
    accentL: 0.45,
    accentChroma: 0.02,
    accentHue: 250,
    neutralChroma: 0.008,
    neutralHue: 250,
    heatmapHues: [250, 250, 90, 55, 42],
  },
  'graphite-dark': {
    family: 'graphite',
    mode: 'dark',
    id: 'graphite-dark',
    name: 'Graphite Dark',
    preview: '#9ba6b2',
    colorScheme: 'dark',
    preserve: false,
    accentL: 0.72,
    accentChroma: 0.022,
    accentHue: 250,
    neutralChroma: 0.01,
    neutralHue: 250,
    heatmapHues: [250, 250, 90, 55, 42],
  },
} satisfies Record<ThemeId, ThemeSeed>

/** The theme applied when nothing is stored or the stored id is unknown. */
export const DEFAULT_THEME_ID: ThemeId = 'light'

/**
 * Narrows an arbitrary value to a known theme id, so a stale or tampered
 * localStorage value (next-themes does not validate) cannot drive `data-theme`.
 * Uses `Object.hasOwn` to ignore inherited keys like `toString`.
 * @param value - Any value, typically read from localStorage or user input.
 * @returns true only when `value` is a registered theme id.
 * @example
 * isThemeId('dark')   // => true
 * isThemeId('harbor') // => false (not registered)
 * isThemeId(undefined)// => false
 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEME_REGISTRY, value)
}

/** All registered theme ids, derived from the registry (never hardcoded twice). */
export const THEME_IDS: ThemeId[] =
  Object.keys(THEME_REGISTRY).filter(isThemeId)

/**
 * Resolves a theme id (flat `light`/`dark` or a future `${family}-${mode}`) to
 * its light/dark axis, so mode-aware consumers (Sonner, the `dark:` variant, the
 * unknown-id fallback) read the axis without parsing ids themselves.
 * @param id - A theme id, or undefined before hydration.
 * @returns
 * - 'dark' for `dark` or any `*-dark` id
 * - 'light' otherwise (including when undefined)
 * @example
 * getThemeMode('dark')        // => 'dark'
 * getThemeMode('harbor-dark') // => 'dark'
 * getThemeMode('light')       // => 'light'
 * getThemeMode(undefined)     // => 'light'
 */
export function getThemeMode(id: string | undefined): ThemeMode {
  if (id === undefined) return 'light'
  // any `*-dark` family id resolves to dark; this is what colored darks rely on
  if (id === 'dark' || id.endsWith('-dark')) return 'dark'
  return 'light'
}

/**
 * Builds the stored id for a (family, mode) pair, so the two-axis picker (T8) can
 * turn a family choice + the current mode into a registry id without string
 * templating at the call site. Cathedral uses the flat `light`/`dark` ids; every
 * other family uses `${family}-${mode}`.
 * @param family - A theme family id.
 * @param mode - The light/dark axis.
 * @returns the stored theme id for that family and mode.
 * @example
 * getThemeId('cathedral', 'dark') // => 'dark'
 * getThemeId('harbor', 'light')   // => 'harbor-light' (once 'harbor' is registered)
 */
export function getThemeId(family: ThemeFamilyId, mode: ThemeMode): ThemeId {
  if (family === 'cathedral') return mode
  return `${family}-${mode}`
}

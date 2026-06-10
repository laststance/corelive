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
 * "cathedral" family keeps the flat `light`/`dark` ids for zero migration;
 * colored families are appended here (T7), and `ThemeId` expands automatically.
 */
export type ThemeFamilyId = 'cathedral'

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

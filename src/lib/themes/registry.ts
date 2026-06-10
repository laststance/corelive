/**
 * Theme registry — the single source of truth for every theme CoreLive ships.
 *
 * Framework-agnostic (no `'use client'`) so the build-time CSS generator, unit
 * tests, Electron, and the React provider can all import it. The default
 * "cathedral" family is the untouched Warm Cathedral light/dark; colored
 * families get added here later as one seed object each, without touching any
 * consumer. Exists so theme identity lives in one place instead of being
 * hardcoded across the provider, the picker, chart.tsx, and globals.css.
 */

/** A theme's light/dark axis. Drives `color-scheme` and the `dark:` variant. */
export type ThemeMode = 'light' | 'dark'

/**
 * A color identity. Each family ships a light + dark pair. The default
 * "cathedral" family keeps the flat `light`/`dark` ids for zero migration;
 * colored families are appended here in a later step.
 */
export type ThemeFamilyId = 'cathedral'

/**
 * Stored theme id — the value next-themes persists to localStorage and writes
 * to the `data-theme` attribute. Cathedral uses flat ids; future colored
 * families will use the `${family}-${mode}` shape.
 */
export type ThemeId = 'light' | 'dark'

/** One registry entry: identity + picker metadata + CSS-generation hints. */
export interface ThemeDefinition {
  family: ThemeFamilyId
  mode: ThemeMode
  id: ThemeId
  /** Display name shown in the theme picker. */
  name: string
  /** Hex swatch shown in the current picker (replaced by a token preview later). */
  preview: string
  /** Emitted as `color-scheme` in generated CSS; also hints UA form controls. */
  colorScheme: ThemeMode
  /**
   * When true, the theme's CSS is hand-authored in globals.css and the future
   * generator must emit it byte-for-byte (never recompute from seeds). The Warm
   * Cathedral default is preserved this way so the brand never drifts.
   */
  preserve: boolean
}

/**
 * Every theme, keyed by its stored id. Currently the untouched Warm Cathedral
 * light/dark; colored families are appended here (one entry per family/mode).
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
} satisfies Record<ThemeId, ThemeDefinition>

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

/**
 * Theme registry — the single source of truth for every theme CoreLive ships.
 *
 * Framework-agnostic (no `'use client'`) so the build-time CSS generator, unit
 * tests, Electron, and the React provider can all import it. The stock shadcn
 * "default" family is the APPLIED default: a {@link StaticTheme} (literal tokens,
 * emitted verbatim) that owns the flat `light`/`dark` ids, so next-themes' System
 * resolution lands on it. The "cathedral" family is the untouched Warm Cathedral
 * light/dark (hand-authored in styles/base.css, one selectable option like any
 * other family); colored families get added here as one DerivedTheme seed each,
 * without touching any consumer. Exists so theme
 * identity lives in one place instead of being hardcoded across the provider,
 * the picker, chart.tsx, and styles/base.css.
 */

/** A theme's light/dark axis. Drives `color-scheme` and the `dark:` variant. */
export type ThemeMode = 'light' | 'dark'

/**
 * A color identity. Each family ships a light + dark pair. `default` is the stock
 * shadcn/ui neutral palette, verbatim, listed first in the picker, and owns the
 * flat `light`/`dark` ids. The brand "cathedral" family (Warm Cathedral) is one
 * selectable option with `cathedral-*` ids; the colored families tint neutrals toward their accent hue and re-aim the heatmap's
 * rest→warm-apex hue path, while the heatmap L/C ramp and the warm
 * chart/destructive identity stay fixed across every family (design decision #15).
 */
export type ThemeFamilyId =
  | 'default'
  | 'cathedral'
  | 'harbor'
  | 'grove'
  | 'rose-tea'
  | 'iris'
  | 'graphite'

/**
 * Stored theme id — the value next-themes persists to localStorage and writes
 * to the `data-theme` attribute. The Default family owns the flat `light`/`dark`
 * ids (so next-themes' System resolves to it); every other family, Warm Cathedral
 * included, uses the `${family}-${mode}` shape (the template auto-expands when a
 * family is added to `ThemeFamilyId`). `default-light`/`default-dark` are NOT
 * ids: they are legacy aliases, see {@link LEGACY_THEME_ID_ALIASES}.
 */
export type ThemeId =
  'light' | 'dark' | `${Exclude<ThemeFamilyId, 'default'>}-${ThemeMode}`

/** Identity + picker metadata carried by every theme, preserved or derived. */
interface ThemeBase {
  family: ThemeFamilyId
  mode: ThemeMode
  id: ThemeId
  /** Display name shown in the theme picker. */
  name: string
  /**
   * Coarse representative hex (brand/meta color). The picker no longer renders
   * this as a dot — it shows a composite built from the derived tokens (see
   * `src/lib/themes/preview.ts`); `preview` is kept as lightweight metadata.
   */
  preview: string
  /** Emitted as `color-scheme` in generated CSS; also hints UA form controls. */
  colorScheme: ThemeMode
}

/**
 * A hand-authored theme: its CSS lives in styles/base.css and the generator emits
 * NOTHING for it (skips it), so the Warm Cathedral brand never drifts. The
 * byte-for-byte guarantee is enforced by a styles/base.css snapshot test, not by
 * re-emitting it from a formula (cathedral is hand-tuned and would not reproduce).
 */
export interface PreservedTheme extends ThemeBase {
  preserve: true
}

/**
 * A generated theme: the generator derives its ~36 color tokens from these OKLCH
 * seed params at the fixed cathedral lightness ladder. `preserve: false` means
 * "the generator emits it" (a {@link StaticTheme} is emitted too — tell them
 * apart with {@link isDerivedTheme} / {@link isStaticTheme}).
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

/** Color token names required by every generated theme, including the heatmap ramp. */
export type ThemeToken =
  | '--background'
  | '--foreground'
  | '--card'
  | '--card-foreground'
  | '--popover'
  | '--popover-foreground'
  | '--primary'
  | '--primary-foreground'
  | '--secondary'
  | '--secondary-foreground'
  | '--muted'
  | '--muted-foreground'
  | '--accent'
  | '--accent-foreground'
  | '--destructive'
  | '--border'
  | '--input'
  | '--ring'
  | '--chart-1'
  | '--chart-2'
  | '--chart-3'
  | '--chart-4'
  | '--chart-5'
  | '--sidebar'
  | '--sidebar-foreground'
  | '--sidebar-primary'
  | '--sidebar-primary-foreground'
  | '--sidebar-accent'
  | '--sidebar-accent-foreground'
  | '--sidebar-border'
  | '--sidebar-ring'
  | '--hm-0'
  | '--hm-1'
  | '--hm-2'
  | '--hm-3'
  | '--hm-4'

/**
 * A verbatim theme: its tokens are literal values (the stock shadcn neutral
 * palette) that the generator copies unchanged into generated.css — no OKLCH
 * derivation, no hand-authored styles/base.css block. `tokens` is the single source:
 * the CSS, the picker preview, and the a11y tests all read it.
 */
export interface StaticTheme extends ThemeBase {
  preserve: false
  tokens: Readonly<Record<ThemeToken, string>>
}

/** One registry entry — a preserved (cathedral), static (shadcn), or derived (colored) theme. */
export type ThemeSeed = PreservedTheme | DerivedTheme | StaticTheme

/**
 * Narrows a seed to a verbatim-token theme, so the generator, the preview, and
 * the a11y tests read `tokens` instead of deriving. `preserve` alone cannot tell
 * a static theme from a derived one (both are generator-emitted).
 * @param seed - Any registry entry.
 * @returns true only for a {@link StaticTheme}.
 * @example
 * isStaticTheme(THEME_REGISTRY.light)            // => true (Default light)
 * isStaticTheme(THEME_REGISTRY['harbor-light'])  // => false
 */
export function isStaticTheme(seed: ThemeSeed): seed is StaticTheme {
  return 'tokens' in seed
}

/**
 * Narrows a seed to an OKLCH-seeded theme — the ones `deriveThemeTokens` computes.
 * @param seed - Any registry entry.
 * @returns true only for a {@link DerivedTheme} (not preserved, not static).
 * @example
 * isDerivedTheme(THEME_REGISTRY['harbor-light'])  // => true
 * isDerivedTheme(THEME_REGISTRY['cathedral-light']) // => false (preserved)
 * isDerivedTheme(THEME_REGISTRY.light)               // => false (static)
 */
export function isDerivedTheme(seed: ThemeSeed): seed is DerivedTheme {
  return !seed.preserve && !isStaticTheme(seed)
}

/**
 * Every theme, keyed by its stored id: the stock shadcn Default pair first (the
 * flat `light`/`dark` ids), the untouched Warm Cathedral `cathedral-light` /
 * `cathedral-dark`, then the colored families (one
 * DerivedTheme per family/mode).
 */
export const THEME_REGISTRY = {
  // ── Default — the stock shadcn/ui "neutral" palette, verbatim ─────────────────
  // Tokens copied from https://ui.shadcn.com/r/colors/neutral.json (Tailwind v4,
  // OKLCH), the same values `shadcn init` writes for baseColor "neutral". Listed
  // FIRST so the palette picker leads with the un-opinionated pair, and it owns
  // the flat `light`/`dark` ids: the APPLIED default for a fresh install (System
  // follows these two, DEFAULT_THEME_PREFERENCE). shadcn ships no heatmap, so
  // `--hm-*` reuse the Warm Cathedral ramp — the temperature=pride invariant holds
  // here exactly as it does for Graphite (neutral room, warm bloom).
  light: {
    family: 'default',
    mode: 'light',
    id: 'light',
    name: 'Default Light',
    preview: '#ffffff',
    colorScheme: 'light',
    preserve: false,
    tokens: {
      '--background': 'oklch(1 0 0)',
      '--foreground': 'oklch(0.145 0 0)',
      '--card': 'oklch(1 0 0)',
      '--card-foreground': 'oklch(0.145 0 0)',
      '--popover': 'oklch(1 0 0)',
      '--popover-foreground': 'oklch(0.145 0 0)',
      '--primary': 'oklch(0.205 0 0)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--secondary': 'oklch(0.97 0 0)',
      '--secondary-foreground': 'oklch(0.205 0 0)',
      '--muted': 'oklch(0.97 0 0)',
      '--muted-foreground': 'oklch(0.556 0 0)',
      '--accent': 'oklch(0.97 0 0)',
      '--accent-foreground': 'oklch(0.205 0 0)',
      '--destructive': 'oklch(0.577 0.245 27.325)',
      '--border': 'oklch(0.922 0 0)',
      '--input': 'oklch(0.922 0 0)',
      '--ring': 'oklch(0.708 0 0)',
      '--chart-1': 'oklch(0.87 0 0)',
      '--chart-2': 'oklch(0.556 0 0)',
      '--chart-3': 'oklch(0.439 0 0)',
      '--chart-4': 'oklch(0.371 0 0)',
      '--chart-5': 'oklch(0.269 0 0)',
      '--sidebar': 'oklch(0.985 0 0)',
      '--sidebar-foreground': 'oklch(0.145 0 0)',
      '--sidebar-primary': 'oklch(0.205 0 0)',
      '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
      '--sidebar-accent': 'oklch(0.97 0 0)',
      '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
      '--sidebar-border': 'oklch(0.922 0 0)',
      '--sidebar-ring': 'oklch(0.708 0 0)',
      // shadcn has no heatmap — the Warm Cathedral light ramp, verbatim.
      '--hm-0': 'oklch(0.96 0.008 80)',
      '--hm-1': 'oklch(0.89 0.06 75)',
      '--hm-2': 'oklch(0.78 0.11 70)',
      '--hm-3': 'oklch(0.65 0.14 60)',
      '--hm-4': 'oklch(0.55 0.16 40)',
    },
  },
  dark: {
    family: 'default',
    mode: 'dark',
    id: 'dark',
    name: 'Default Dark',
    preview: '#0a0a0a',
    colorScheme: 'dark',
    preserve: false,
    tokens: {
      '--background': 'oklch(0.145 0 0)',
      '--foreground': 'oklch(0.985 0 0)',
      '--card': 'oklch(0.205 0 0)',
      '--card-foreground': 'oklch(0.985 0 0)',
      '--popover': 'oklch(0.205 0 0)',
      '--popover-foreground': 'oklch(0.985 0 0)',
      '--primary': 'oklch(0.922 0 0)',
      '--primary-foreground': 'oklch(0.205 0 0)',
      '--secondary': 'oklch(0.269 0 0)',
      '--secondary-foreground': 'oklch(0.985 0 0)',
      '--muted': 'oklch(0.269 0 0)',
      '--muted-foreground': 'oklch(0.708 0 0)',
      '--accent': 'oklch(0.269 0 0)',
      '--accent-foreground': 'oklch(0.985 0 0)',
      '--destructive': 'oklch(0.704 0.191 22.216)',
      '--border': 'oklch(1 0 0 / 10%)',
      '--input': 'oklch(1 0 0 / 15%)',
      '--ring': 'oklch(0.556 0 0)',
      '--chart-1': 'oklch(0.87 0 0)',
      '--chart-2': 'oklch(0.556 0 0)',
      '--chart-3': 'oklch(0.439 0 0)',
      '--chart-4': 'oklch(0.371 0 0)',
      '--chart-5': 'oklch(0.269 0 0)',
      '--sidebar': 'oklch(0.205 0 0)',
      '--sidebar-foreground': 'oklch(0.985 0 0)',
      '--sidebar-primary': 'oklch(0.488 0.243 264.376)',
      '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
      '--sidebar-accent': 'oklch(0.269 0 0)',
      '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
      '--sidebar-border': 'oklch(1 0 0 / 10%)',
      '--sidebar-ring': 'oklch(0.556 0 0)',
      // shadcn has no heatmap — the Warm Cathedral dark ramp, verbatim.
      '--hm-0': 'oklch(0.22 0.012 40)',
      '--hm-1': 'oklch(0.32 0.06 50)',
      '--hm-2': 'oklch(0.45 0.1 55)',
      '--hm-3': 'oklch(0.58 0.13 60)',
      '--hm-4': 'oklch(0.7 0.15 65)',
    },
  },

  'cathedral-light': {
    family: 'cathedral',
    mode: 'light',
    id: 'cathedral-light',
    name: 'Warm Cathedral Light',
    preview: '#ffffff',
    colorScheme: 'light',
    preserve: true,
  },
  'cathedral-dark': {
    family: 'cathedral',
    mode: 'dark',
    id: 'cathedral-dark',
    name: 'Warm Cathedral Dark',
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
  // (0.55 → 4.48, below 4.5; 0.54 → 4.67). Accent hue 145 sits by the fixed
  // `--chart-2` (145) and `--color-success` (149 light / 162 dark). Design-review
  // (2026-06-11) cleared this: there is no persistent success-colored UI to collide
  // with, and the accent stays separable by chroma/lightness.
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

/**
 * The concrete Default light id, for places that need a {@link ThemeId} before
 * `system` can resolve (SSR, pre-mount). It is NOT the stored-preference default:
 * a fresh or unknown stored value means {@link DEFAULT_THEME_PREFERENCE}.
 * @see DEFAULT_THEME_PREFERENCE - use that when choosing what to store or apply.
 */
export const DEFAULT_THEME_ID: ThemeId = 'light'

/**
 * The stored-preference default: with nothing (or something unknown) stored, the
 * OS picks Default light or Default dark. Used as next-themes `defaultTheme`, as
 * the heal target for unknown stored values, and by the desktop editor before
 * the workspace is ready.
 * @see DEFAULT_THEME_ID - use that where a concrete id is required.
 */
export const DEFAULT_THEME_PREFERENCE = 'system'

/**
 * Retired stored ids and the current id each one means. `default-light` /
 * `default-dark` were the Default family's ids before it took the flat
 * `light`/`dark`; they are not {@link ThemeId}s any more, only read-side aliases.
 * The generator also reads this map to keep their CSS selectors alive so a stale
 * stored alias still paints Default on the first frame.
 * @see normalizeThemePreference
 */
export const LEGACY_THEME_ID_ALIASES: Readonly<Record<string, ThemeId>> =
  Object.freeze({
    'default-light': 'light',
    'default-dark': 'dark',
  })

/**
 * Narrows an arbitrary value to a known theme id, so a stale or tampered
 * localStorage value (next-themes does not validate) cannot drive `data-theme`.
 * Uses `Object.hasOwn` to ignore inherited keys like `toString`.
 * @param value - Any value, typically read from localStorage or user input.
 * @returns true only when `value` is a registered theme id.
 * @example
 * isThemeId('dark')         // => true
 * isThemeId('harbor')       // => false (not registered)
 * isThemeId('default-dark') // => false (legacy alias, see {@link normalizeThemePreference})
 * isThemeId(undefined)      // => false
 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEME_REGISTRY, value)
}

/** All registered theme ids, derived from the registry (never hardcoded twice). */
export const THEME_IDS: ThemeId[] =
  Object.keys(THEME_REGISTRY).filter(isThemeId)

/**
 * Maps any stored or synced theme value onto the one contract shared by web and
 * desktop: a registered {@link ThemeId} or `system`. Exists because storage is
 * untrusted (stale builds, tampering, legacy aliases) and both the web guard and
 * the desktop editor must agree on what each raw value means. Called by the web
 * allowlist guard, `useThemeAxis`, the offline-settings sync boundary and the
 * desktop editor.
 * @param value - Any raw value (localStorage, workspace preference, user input).
 * @returns
 * - `'system'` for `'system'`, non-strings and unknown/blank strings
 * - the aliased id for a {@link LEGACY_THEME_ID_ALIASES} key
 * - the value itself when it is a registered {@link ThemeId}
 * @example
 * normalizeThemePreference('default-dark')  // => 'dark'
 * normalizeThemePreference('cathedral-dark')// => 'cathedral-dark'
 * normalizeThemePreference('cathedral-lite')// => 'system'
 * normalizeThemePreference(undefined)       // => 'system'
 */
export function normalizeThemePreference(value: unknown): ThemeId | 'system' {
  if (typeof value !== 'string') return DEFAULT_THEME_PREFERENCE
  // legacy aliases first: they are not registry keys, so isThemeId would reject them
  if (Object.hasOwn(LEGACY_THEME_ID_ALIASES, value)) {
    return LEGACY_THEME_ID_ALIASES[value] ?? DEFAULT_THEME_PREFERENCE
  }
  if (isThemeId(value)) return value
  // 'system' and every unknown/blank string heal to the OS-following default
  return DEFAULT_THEME_PREFERENCE
}

/**
 * Resolves a theme id (flat `light`/`dark` or a `${family}-${mode}`) to
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
 * templating at the call site. Default uses the flat `light`/`dark` ids; every
 * other family (Warm Cathedral included) uses `${family}-${mode}`.
 * @param family - A theme family id.
 * @param mode - The light/dark axis.
 * @returns the stored theme id for that family and mode.
 * @example
 * getThemeId('default', 'dark')   // => 'dark'
 * getThemeId('cathedral', 'dark') // => 'cathedral-dark'
 * getThemeId('harbor', 'light')   // => 'harbor-light'
 */
export function getThemeId(family: ThemeFamilyId, mode: ThemeMode): ThemeId {
  if (family === 'default') return mode
  return `${family}-${mode}`
}

/**
 * Human-readable family names for the two-axis theme picker (T8). The brand
 * family carries the name "Warm Cathedral" — its theme names are
 * "Warm Cathedral Light/Dark", so the label is spelled out rather than derived.
 * Insertion order IS the picker order: the stock shadcn "Default" first (what a
 * fresh install applies), then Warm Cathedral (one selectable option), then the
 * colored families.
 * @example
 * THEME_FAMILY_LABEL.default   // => 'Default'
 * THEME_FAMILY_LABEL.cathedral // => 'Warm Cathedral'
 * THEME_FAMILY_LABEL.harbor    // => 'Harbor'
 */
export const THEME_FAMILY_LABEL: Record<ThemeFamilyId, string> = {
  default: 'Default',
  cathedral: 'Warm Cathedral',
  harbor: 'Harbor',
  grove: 'Grove',
  'rose-tea': 'Rose Tea',
  iris: 'Iris',
  graphite: 'Graphite',
}

/**
 * All theme family ids in picker order (Default first) — the family axis of the T8 picker. The
 * cast is required because `Object.keys` widens to `string[]`; the `Record<
 * ThemeFamilyId, …>` type guarantees the keys are exactly the family ids (same
 * documented pattern as `THEME_META` in ThemeProvider).
 */
export const THEME_FAMILY_IDS = Object.keys(
  THEME_FAMILY_LABEL,
) as ThemeFamilyId[]

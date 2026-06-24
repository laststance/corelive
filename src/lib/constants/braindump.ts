/**
 * @fileoverview Shared BrainDump constants used by renderer surfaces.
 *
 * These bounds drive the opacity slider in both the BrainDump panel and the
 * Settings card. The Electron main process (`WindowManager.setBrainDumpOpacity`)
 * applies an identical numeric clamp so we keep duplicate literals in sync —
 * if you change the bounds here, also update `BRAINDUMP_OPACITY_*` references
 * in `electron/WindowManager.ts` and `electron/ipc/ipc-schemas.ts`.
 *
 * Why a separate module: Electron's tsconfig does not include `src/`, so the
 * main process cannot import from here. Keeping renderer constants centralized
 * still removes duplication between `BrainDumpEditor` and `BrainDumpSettings`.
 *
 * @module lib/constants/braindump
 */

/** Lowest selectable opacity. Anything lower hides the window's affordances. */
export const BRAINDUMP_OPACITY_MIN = 0.3

/** Fully opaque ceiling. */
export const BRAINDUMP_OPACITY_MAX = 1

/** Slider granularity (5 % steps) — matches what the eye can distinguish. */
export const BRAINDUMP_OPACITY_STEP = 0.05

/**
 * Soft cap on the BrainDump textarea. Roughly 200 completed-title lengths so
 * a runaway paste cannot grow the per-category note beyond reasonable size.
 */
export const BRAINDUMP_NOTE_LINES_PER_CAP = 200

/**
 * Frameless-window opacity in [{@link BRAINDUMP_OPACITY_MIN}, {@link BRAINDUMP_OPACITY_MAX}].
 * Type alias documents intent without changing the runtime shape.
 *
 * @example
 * const opacity: BrainDumpOpacity = 0.85
 */
export type BrainDumpOpacity = number

/**
 * Electron `globalShortcut` accelerator string. Empty string disables the
 * global shortcut. Validated only at registration time — invalid accelerators
 * fail silently when Electron rejects them.
 *
 * @example
 * const accelerator: BrainDumpShortcut = 'CommandOrControl+Shift+B'
 * const disabled: BrainDumpShortcut = ''
 */
export type BrainDumpShortcut = string

/**
 * Whether BrainDump should follow the FloatingNavigator's selected category.
 * `true` mirrors the FloatingNav choice; `false` keeps a local selection.
 *
 * @example
 * const sync: BrainDumpSyncMode = true
 */
export type BrainDumpSyncMode = boolean

/* -------------------------------------------------------------------------- */
/* BrainDump editor text presentation (font family / size / color)            */
/* -------------------------------------------------------------------------- */

/**
 * Selectable BrainDump editor font-family ids. `as const` so the union type AND
 * `z.enum(BRAINDUMP_FONT_FAMILY_IDS)` both derive from this one tuple (no drift),
 * mirroring the sound-palette `TIMBRE_IDS` pattern.
 */
export const BRAINDUMP_FONT_FAMILY_IDS = ['mono', 'sans', 'serif'] as const

/** A selectable BrainDump editor font family. */
export type BrainDumpFontFamilyId = (typeof BRAINDUMP_FONT_FAMILY_IDS)[number]

/**
 * id → CSS value (the globals.css font vars, which resolve to the brand 3-font
 * stack on every route). The SINGLE source for the font CSS — read by both the
 * Settings preview label and the editor's inline style — so the mapping can't
 * drift between picker and surface.
 */
export const BRAINDUMP_FONT_FAMILY_CSS: Record<BrainDumpFontFamilyId, string> =
  {
    mono: 'var(--font-mono)',
    sans: 'var(--font-sans)',
    serif: 'var(--font-serif)',
  }

/** Settings-selector metadata for a font family (label only; CSS via the map). */
export interface BrainDumpFontFamilyOption {
  id: BrainDumpFontFamilyId
  label: string
}

/**
 * id → human label. The label source of truth; the ordered options list below
 * derives from the id tuple, so adding a font to {@link BRAINDUMP_FONT_FAMILY_IDS}
 * can't silently miss the Settings selector (no drift — same guarantee the tuple
 * docstring promises, mirroring `sound.ts`'s `SOUND_TIMBRE_LIST`).
 */
export const BRAINDUMP_FONT_FAMILY_LABELS: Record<
  BrainDumpFontFamilyId,
  string
> = {
  mono: 'Monospace',
  sans: 'Sans-serif',
  serif: 'Serif',
}

/**
 * The ordered font-family options for the Settings selector, derived from the id
 * tuple so ids and order live in exactly one place.
 */
export const BRAINDUMP_FONT_FAMILIES: readonly BrainDumpFontFamilyOption[] =
  BRAINDUMP_FONT_FAMILY_IDS.map((id) => ({
    id,
    label: BRAINDUMP_FONT_FAMILY_LABELS[id],
  }))

/** Default editor font — monospace, preserving the prior `font-mono` look. */
export const DEFAULT_BRAINDUMP_FONT_FAMILY: BrainDumpFontFamilyId = 'mono'

/** Smallest selectable editor font size. */
export const BRAINDUMP_FONT_SIZE_MIN_PX = 12

/** Largest selectable editor font size. */
export const BRAINDUMP_FONT_SIZE_MAX_PX = 24

/** Font-size slider granularity (whole px — finer steps aren't worth the jitter). */
export const BRAINDUMP_FONT_SIZE_STEP_PX = 1

/** Default editor font size — 14px, preserving the prior `text-sm` (0.875rem). */
export const DEFAULT_BRAINDUMP_FONT_SIZE_PX = 14

/**
 * Unitless line-height for the editor textarea. Unitless (not the old fixed
 * `text-sm` 1.25rem) so line spacing scales WITH the chosen font size instead of
 * staying glued to a single px height.
 */
export const BRAINDUMP_LINE_HEIGHT = 1.5

/** Settings-swatch metadata for a text-color preset (label + themed CSS value). */
export interface BrainDumpTextColorPreset {
  id: string
  label: string
  /** A theme token via CSS var so the preset follows the active light/dark theme. */
  cssValue: string
}

/**
 * On-brand, theme-aware text-color presets — CSS vars (not fixed hex) so each
 * follows the active theme. A custom hex (native color input) layers on top as
 * the user-owned deviation (DESIGN.md "Presets First, Then Options").
 */
export const BRAINDUMP_TEXT_COLOR_PRESETS: readonly BrainDumpTextColorPreset[] =
  [
    { id: 'default', label: 'Default', cssValue: 'var(--foreground)' },
    { id: 'muted', label: 'Muted', cssValue: 'var(--muted-foreground)' },
    { id: 'amber', label: 'Amber', cssValue: 'var(--primary)' },
  ]

/** Default editor text color — the theme foreground (preserves the prior inherited color). */
export const DEFAULT_BRAINDUMP_TEXT_COLOR = 'var(--foreground)'

/**
 * Accepted text-color shapes: a theme token `var(--name)` (the presets; the
 * name may contain digits, e.g. the `--chart-1` family) or a `#hex` (3/6/8
 * digits, from the native color input). The schema's `.catch` self-heals
 * anything else to {@link DEFAULT_BRAINDUMP_TEXT_COLOR}.
 *
 * @example
 * BRAINDUMP_TEXT_COLOR_PATTERN.test('var(--primary)') // => true
 * BRAINDUMP_TEXT_COLOR_PATTERN.test('var(--chart-1)') // => true
 * BRAINDUMP_TEXT_COLOR_PATTERN.test('#1a2b3c')        // => true
 * BRAINDUMP_TEXT_COLOR_PATTERN.test('red')            // => false
 */
export const BRAINDUMP_TEXT_COLOR_PATTERN =
  /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|var\(--[a-z0-9-]+\))$/

/* -------------------------------------------------------------------------- */
/* BrainDump clear-on-complete linger delay (#108)                            */
/* -------------------------------------------------------------------------- */

/**
 * How long the "Undo" toast stays up after a clear-on-complete, and the SOLE
 * source for the clear-delay ceiling below. Renderer-only (the toast lives in
 * `BrainDumpEditor`), so — unlike the opacity bounds — this is a real import,
 * not a synced duplicate. `BrainDumpEditor` aliases it back to `TOAST_UNDO_MS`.
 */
export const BRAINDUMP_TOAST_UNDO_MS = 5000

/** Fastest clear — 0 ms removes the line the instant the task is completed. */
export const BRAINDUMP_CLEAR_DELAY_MIN_MS = 0

/**
 * Slowest clear. Capped at {@link BRAINDUMP_TOAST_UNDO_MS} so the line can never
 * outlast its own Undo window — a longer linger would let the toast vanish while
 * the line is still on screen, stranding the user with no way to undo (#109 will
 * lift the toast duration into a pref; this ceiling then tracks it for free).
 */
export const BRAINDUMP_CLEAR_DELAY_MAX_MS = BRAINDUMP_TOAST_UNDO_MS

/** Delay slider granularity — 100 ms steps read cleanly and avoid jitter. */
export const BRAINDUMP_CLEAR_DELAY_STEP_MS = 100

/**
 * Default clear-on-complete linger — 500 ms. A brief, gentle beat that lets the
 * eye register the completion before the line leaves (DESIGN.md self-affirmation;
 * 0 ms felt abrupt). Opt into "Instant" (0) via the Settings slider.
 */
export const DEFAULT_BRAINDUMP_CLEAR_DELAY_MS = 500

/**
 * Clear-on-complete linger in ms, within
 * [{@link BRAINDUMP_CLEAR_DELAY_MIN_MS}, {@link BRAINDUMP_CLEAR_DELAY_MAX_MS}].
 * Type alias documents intent without changing the runtime shape.
 *
 * @example
 * const delay: BrainDumpClearDelayMs = 500
 * const instant: BrainDumpClearDelayMs = 0
 */
export type BrainDumpClearDelayMs = number

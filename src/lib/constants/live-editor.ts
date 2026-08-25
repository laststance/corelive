/**
 * @fileoverview Shared LiveEditor constants used by renderer surfaces.
 *
 * These bounds drive the opacity slider in both the LiveEditor panel and the
 * Settings card. The Electron main process (`WindowManager.setLiveEditorOpacity`)
 * applies an identical numeric clamp so we keep duplicate literals in sync —
 * if you change the bounds here, also update `LIVE_EDITOR_OPACITY_*` references
 * in `electron/WindowManager.ts` and `electron/ipc/ipc-schemas.ts`.
 *
 * Why a separate module: Electron's tsconfig does not include `src/`, so the
 * main process cannot import from here. Keeping renderer constants centralized
 * still removes duplication between `LiveEditor` and `LiveEditorSettings`.
 *
 * @module lib/constants/live-editor
 */

/** Lowest selectable opacity. Anything lower hides the window's affordances. */
export const LIVE_EDITOR_OPACITY_MIN = 0.3

/** Fully opaque ceiling. */
export const LIVE_EDITOR_OPACITY_MAX = 1

/** Slider granularity (5 % steps) — matches what the eye can distinguish. */
export const LIVE_EDITOR_OPACITY_STEP = 0.05

/**
 * Soft cap on the LiveEditor textarea. Roughly 200 completed-title lengths so
 * a runaway paste cannot grow the per-category note beyond reasonable size.
 */
export const LIVE_EDITOR_NOTE_LINES_PER_CAP = 200

/**
 * Frameless-window opacity in [{@link LIVE_EDITOR_OPACITY_MIN}, {@link LIVE_EDITOR_OPACITY_MAX}].
 * Type alias documents intent without changing the runtime shape.
 *
 * @example
 * const opacity: LiveEditorOpacity = 0.85
 */
export type LiveEditorOpacity = number

/**
 * Electron `globalShortcut` accelerator string. Empty string disables the
 * global shortcut. Validated only at registration time — invalid accelerators
 * fail silently when Electron rejects them.
 *
 * @example
 * const accelerator: LiveEditorShortcut = 'CommandOrControl+Shift+B'
 * const disabled: LiveEditorShortcut = ''
 */
export type LiveEditorShortcut = string

/**
 * Whether LiveEditor should follow the FloatingNavigator's selected category.
 * `true` mirrors the FloatingNav choice; `false` keeps a local selection.
 *
 * @example
 * const sync: LiveEditorSyncMode = true
 */
export type LiveEditorSyncMode = boolean

/* -------------------------------------------------------------------------- */
/* LiveEditor editor text presentation (font family / size / color)            */
/* -------------------------------------------------------------------------- */

/**
 * Selectable LiveEditor editor font-family ids. `as const` so the union type AND
 * `z.enum(LIVE_EDITOR_FONT_FAMILY_IDS)` both derive from this one tuple (no drift),
 * mirroring the sound-palette `TIMBRE_IDS` pattern.
 */
export const LIVE_EDITOR_FONT_FAMILY_IDS = ['mono', 'sans', 'serif'] as const

/** A selectable LiveEditor editor font family. */
export type LiveEditorFontFamilyId =
  (typeof LIVE_EDITOR_FONT_FAMILY_IDS)[number]

/**
 * id → CSS value (the globals.css font vars, which resolve to the brand 3-font
 * stack on every route). The SINGLE source for the font CSS — read by both the
 * Settings preview label and the editor's inline style — so the mapping can't
 * drift between picker and surface.
 */
export const LIVE_EDITOR_FONT_FAMILY_CSS: Record<
  LiveEditorFontFamilyId,
  string
> = {
  mono: 'var(--font-mono)',
  sans: 'var(--font-sans)',
  serif: 'var(--font-serif)',
}

/** Settings-selector metadata for a font family (label only; CSS via the map). */
export interface LiveEditorFontFamilyOption {
  id: LiveEditorFontFamilyId
  label: string
}

/**
 * id → human label. The label source of truth; the ordered options list below
 * derives from the id tuple, so adding a font to {@link LIVE_EDITOR_FONT_FAMILY_IDS}
 * can't silently miss the Settings selector (no drift — same guarantee the tuple
 * docstring promises, mirroring `sound.ts`'s `SOUND_TIMBRE_LIST`).
 */
export const LIVE_EDITOR_FONT_FAMILY_LABELS: Record<
  LiveEditorFontFamilyId,
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
export const LIVE_EDITOR_FONT_FAMILIES: readonly LiveEditorFontFamilyOption[] =
  LIVE_EDITOR_FONT_FAMILY_IDS.map((id) => ({
    id,
    label: LIVE_EDITOR_FONT_FAMILY_LABELS[id],
  }))

/** Default editor font — monospace, preserving the prior `font-mono` look. */
export const DEFAULT_LIVE_EDITOR_FONT_FAMILY: LiveEditorFontFamilyId = 'mono'

/** Smallest selectable editor font size. */
export const LIVE_EDITOR_FONT_SIZE_MIN_PX = 12

/** Largest selectable editor font size. */
export const LIVE_EDITOR_FONT_SIZE_MAX_PX = 24

/** Font-size slider granularity (whole px — finer steps aren't worth the jitter). */
export const LIVE_EDITOR_FONT_SIZE_STEP_PX = 1

/** Default editor font size — 14px, preserving the prior `text-sm` (0.875rem). */
export const DEFAULT_LIVE_EDITOR_FONT_SIZE_PX = 14

/**
 * Unitless line-height for the editor textarea. Unitless (not the old fixed
 * `text-sm` 1.25rem) so line spacing scales WITH the chosen font size instead of
 * staying glued to a single px height.
 */
export const LIVE_EDITOR_LINE_HEIGHT = 1.5

/** Settings-swatch metadata for a text-color preset (label + themed CSS value). */
export interface LiveEditorTextColorPreset {
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
export const LIVE_EDITOR_TEXT_COLOR_PRESETS: readonly LiveEditorTextColorPreset[] =
  [
    { id: 'default', label: 'Default', cssValue: 'var(--foreground)' },
    { id: 'muted', label: 'Muted', cssValue: 'var(--muted-foreground)' },
    { id: 'amber', label: 'Amber', cssValue: 'var(--primary)' },
  ]

/** Default editor text color — the theme foreground (preserves the prior inherited color). */
export const DEFAULT_LIVE_EDITOR_TEXT_COLOR = 'var(--foreground)'

/**
 * Accepted text-color shapes: a theme token `var(--name)` (the presets; the
 * name may contain digits, e.g. the `--chart-1` family) or a `#hex` (3/6/8
 * digits, from the native color input). The schema's `.catch` self-heals
 * anything else to {@link DEFAULT_LIVE_EDITOR_TEXT_COLOR}.
 *
 * @example
 * LIVE_EDITOR_TEXT_COLOR_PATTERN.test('var(--primary)') // => true
 * LIVE_EDITOR_TEXT_COLOR_PATTERN.test('var(--chart-1)') // => true
 * LIVE_EDITOR_TEXT_COLOR_PATTERN.test('#1a2b3c')        // => true
 * LIVE_EDITOR_TEXT_COLOR_PATTERN.test('red')            // => false
 */
export const LIVE_EDITOR_TEXT_COLOR_PATTERN =
  /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|var\(--[a-z0-9-]+\))$/

/* -------------------------------------------------------------------------- */
/* LiveEditor clear-on-complete linger delay (#108)                            */
/* -------------------------------------------------------------------------- */

/**
 * How long the "Undo" toast stays up after a clear-on-complete, and the SOLE
 * source for the clear-delay ceiling below. Renderer-only (the toast lives in
 * `LiveEditor`), so — unlike the opacity bounds — this is a real import,
 * not a synced duplicate — `LiveEditor` imports it directly for the toast
 * `duration` (the old local `TOAST_UNDO_MS` alias was retired in #108).
 */
export const LIVE_EDITOR_TOAST_UNDO_MS = 5000

/** Fastest clear — 0 ms removes the line the instant the task is completed. */
export const LIVE_EDITOR_CLEAR_DELAY_MIN_MS = 0

/**
 * Slowest clear. Capped at {@link LIVE_EDITOR_TOAST_UNDO_MS} so the line can never
 * outlast its own Undo window — a longer linger would let the toast vanish while
 * the line is still on screen, stranding the user with no way to undo (#109 will
 * lift the toast duration into a setting; this ceiling then tracks it for free).
 */
export const LIVE_EDITOR_CLEAR_DELAY_MAX_MS = LIVE_EDITOR_TOAST_UNDO_MS

/** Delay slider granularity — 100 ms steps read cleanly and avoid jitter. */
export const LIVE_EDITOR_CLEAR_DELAY_STEP_MS = 100

/**
 * Default clear-on-complete linger — 500 ms. A brief, gentle beat so a finished
 * line leaves softly instead of snapping out the instant it completes; the
 * completion itself is acknowledged by the Undo toast, which fires immediately
 * (the line stays verbatim during the dwell — this is a soft exit, not a visible
 * state change). DESIGN.md self-affirmation; 0 ms felt abrupt. Opt into "Instant"
 * (0) via the Settings slider.
 */
export const DEFAULT_LIVE_EDITOR_CLEAR_DELAY_MS = 500

/**
 * Clear-on-complete linger in ms, within
 * [{@link LIVE_EDITOR_CLEAR_DELAY_MIN_MS}, {@link LIVE_EDITOR_CLEAR_DELAY_MAX_MS}].
 * Type alias documents intent without changing the runtime shape.
 *
 * @example
 * const delay: LiveEditorClearDelayMs = 500
 * const instant: LiveEditorClearDelayMs = 0
 */
export type LiveEditorClearDelayMs = number

/* -------------------------------------------------------------------------- */
/* LiveEditor completion-toast display duration (#109)                         */
/* -------------------------------------------------------------------------- */

/**
 * Default completion-toast display duration — aliases {@link LIVE_EDITOR_TOAST_UNDO_MS}
 * (5000 ms) so a fresh install keeps today's Undo-window behaviour exactly. #109
 * lifts this once-fixed window into a user setting; the #108 clear-delay ceiling now
 * tracks it at the consumption site via `min(clearDelay, toastDuration)` rather
 * than the old fixed constant, so a line can still never outlast its own Undo.
 */
export const DEFAULT_LIVE_EDITOR_TOAST_DURATION_MS = LIVE_EDITOR_TOAST_UNDO_MS

/**
 * Shortest selectable toast duration — 2000 ms. A 1 s toast with an Undo CTA reads
 * anxious, not calm; 2 s is the regret-safe floor to read the line and still reach
 * Undo (DESIGN.md "quiet companion, not coach").
 */
export const LIVE_EDITOR_TOAST_DURATION_MIN_MS = 2000

/** Longest selectable toast duration — 10 s, the outer edge of "let it linger". */
export const LIVE_EDITOR_TOAST_DURATION_MAX_MS = 10000

/** Toast-duration slider granularity — 500 ms steps read cleanly without jitter. */
export const LIVE_EDITOR_TOAST_DURATION_STEP_MS = 500

/**
 * LiveEditor completion-toast display duration in ms, within
 * [{@link LIVE_EDITOR_TOAST_DURATION_MIN_MS}, {@link LIVE_EDITOR_TOAST_DURATION_MAX_MS}].
 * Type alias documents intent without changing the runtime shape.
 *
 * @example
 * const duration: LiveEditorToastDurationMs = 5000
 */
export type LiveEditorToastDurationMs = number

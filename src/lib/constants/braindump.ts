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

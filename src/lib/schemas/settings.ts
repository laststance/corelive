/**
 * Settings schema — the single source of truth (D2) for the core user
 * settings shape. `DEFAULT_SETTINGS` is `UserSettingsStateSchema.parse({})`
 * and `UserSettingsState` is `z.infer` of this schema, so the default values, the
 * runtime type, and cross-window validation can never drift apart. Used by the
 * constants module (for the default) and the cross-window sync (for validating +
 * clamping inbound payloads). Zod is already the project's validation idiom (oRPC
 * inputs), so this stays consistent.
 *
 * @module lib/schemas/settings
 */
import { z } from 'zod'

import {
  LIVE_EDITOR_CLEAR_DELAY_MAX_MS,
  LIVE_EDITOR_CLEAR_DELAY_MIN_MS,
  LIVE_EDITOR_FONT_FAMILY_IDS,
  LIVE_EDITOR_FONT_SIZE_MAX_PX,
  LIVE_EDITOR_FONT_SIZE_MIN_PX,
  LIVE_EDITOR_TEXT_COLOR_PATTERN,
  LIVE_EDITOR_TOAST_DURATION_MAX_MS,
  LIVE_EDITOR_TOAST_DURATION_MIN_MS,
  DEFAULT_LIVE_EDITOR_CLEAR_DELAY_MS,
  DEFAULT_LIVE_EDITOR_FONT_FAMILY,
  DEFAULT_LIVE_EDITOR_FONT_SIZE_PX,
  DEFAULT_LIVE_EDITOR_TEXT_COLOR,
  DEFAULT_LIVE_EDITOR_TOAST_DURATION_MS,
} from '@/lib/constants/live-editor'

/**
 * Validates incoming settings for window sync, filling missing preferences and dropping retired keys from older windows.
 */
export const UserSettingsStateSchema = z.object({
  /** Opt-in Today Ember above both LiveEditor hosts; existing installs keep it hidden. */
  showTodayEmber: z.boolean().default(false),
  /** LiveEditor editor font family. `.catch` (not `.default`) so a MISSING *or*
   * unknown id self-heals to the default rather than rejecting the whole payload. */
  liveEditorFontFamily: z
    .enum(LIVE_EDITOR_FONT_FAMILY_IDS)
    .catch(DEFAULT_LIVE_EDITOR_FONT_FAMILY),
  /** LiveEditor editor font size (px). A finite number is clamped to the slider
   * range; a non-finite or non-number (corrupt blob, bad sync) self-heals to the
   * default via `.catch` instead of throwing the whole parse. */
  liveEditorFontSize: z
    .number()
    .finite()
    .transform((value) =>
      Math.min(
        LIVE_EDITOR_FONT_SIZE_MAX_PX,
        Math.max(LIVE_EDITOR_FONT_SIZE_MIN_PX, value),
      ),
    )
    .catch(DEFAULT_LIVE_EDITOR_FONT_SIZE_PX),
  /** LiveEditor editor text color — a theme `var(--token)` (preset) or a `#hex`
   * (custom). Anything outside those shapes self-heals to the default. */
  liveEditorTextColor: z
    .string()
    .regex(LIVE_EDITOR_TEXT_COLOR_PATTERN)
    .catch(DEFAULT_LIVE_EDITOR_TEXT_COLOR),
  /** LiveEditor clear-on-complete — when ON, a finished `- [x] <title>` line is
   * dropped once its undo window closes so the scratchpad clears as you go.
   * Default OFF keeps the on-concept behavior (every line stays in place); the
   * clear is the opt-in deviation ("Presets First, Then Options"). */
  liveEditorClearOnComplete: z.boolean().default(false),
  /** LiveEditor clear-on-complete linger (ms) before the finished line is removed.
   * A finite number is clamped to the slider range; a non-finite or non-number
   * (corrupt blob, bad sync) self-heals to the default via `.catch` — mirroring
   * `liveEditorFontSize`. Only takes effect when `liveEditorClearOnComplete` is ON. */
  liveEditorClearDelayMs: z
    .number()
    .finite()
    .transform((value) =>
      Math.min(
        LIVE_EDITOR_CLEAR_DELAY_MAX_MS,
        Math.max(LIVE_EDITOR_CLEAR_DELAY_MIN_MS, value),
      ),
    )
    .catch(DEFAULT_LIVE_EDITOR_CLEAR_DELAY_MS),
  /** LiveEditor completion-toast display duration (ms) before it auto-dismisses.
   * A finite number is clamped to the slider range; a non-finite or non-number
   * (corrupt blob, bad sync) self-heals to the default via `.catch` — mirroring
   * `liveEditorClearDelayMs`. The toast also gains a close (✕) button (#109). */
  liveEditorToastDurationMs: z
    .number()
    .finite()
    .transform((value) =>
      Math.min(
        LIVE_EDITOR_TOAST_DURATION_MAX_MS,
        Math.max(LIVE_EDITOR_TOAST_DURATION_MIN_MS, value),
      ),
    )
    .catch(DEFAULT_LIVE_EDITOR_TOAST_DURATION_MS),
})

/** The validated core user-settings shape (inferred from the schema SSoT). */
export type UserSettingsState = z.infer<typeof UserSettingsStateSchema>

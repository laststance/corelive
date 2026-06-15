/**
 * Preferences schema — the single source of truth (D2) for the core user
 * preferences shape. `DEFAULT_PREFERENCES` is `PreferencesStateSchema.parse({})`
 * and `PreferencesState` is `z.infer` of this schema, so the default values, the
 * runtime type, and cross-window validation can never drift apart. Used by the
 * constants module (for the default) and the cross-window sync (for validating +
 * clamping inbound payloads). Zod is already the project's validation idiom (oRPC
 * inputs), so this stays consistent.
 *
 * @module lib/schemas/preferences
 */
import { z } from 'zod'

import {
  BRAINDUMP_FONT_FAMILY_IDS,
  BRAINDUMP_FONT_SIZE_MAX_PX,
  BRAINDUMP_FONT_SIZE_MIN_PX,
  BRAINDUMP_TEXT_COLOR_PATTERN,
  DEFAULT_BRAINDUMP_FONT_FAMILY,
  DEFAULT_BRAINDUMP_FONT_SIZE_PX,
  DEFAULT_BRAINDUMP_TEXT_COLOR,
} from '@/lib/constants/braindump'
import {
  DEFAULT_SOUND_VOLUME,
  DEFAULT_TIMBRE_ID,
  type SoundMomentId,
  TIMBRE_IDS,
} from '@/lib/constants/sound'

/**
 * Per-moment ON/OFF toggles, all default OFF so the app is SILENT on a fresh
 * install. The whole object defaults too, so a persisted/synced blob that predates
 * the field validates and fills these in (forward-compat). The default literal is
 * `satisfies Record<SoundMomentId, boolean>` to fail compilation if the moment set
 * drifts from SOUND_MOMENT_IDS.
 */
const SoundMomentsSchema = z
  .object({
    'task-create': z.boolean().default(false),
    complete: z.boolean().default(false),
    clear: z.boolean().default(false),
  })
  .default({
    'task-create': false,
    complete: false,
    clear: false,
  } satisfies Record<SoundMomentId, boolean>)

/**
 * The core user-preferences schema. Every field has a default so `parse({})`
 * yields the full default state and a smaller-but-valid legacy payload (only the
 * original two booleans) is accepted with the new fields defaulted — never
 * rejected. `soundVolume` clamps an out-of-range NUMBER into [0,1] but still
 * rejects a non-number (so a malformed sync payload fails wholesale).
 */
export const PreferencesStateSchema = z.object({
  /** Legacy single completion-sound toggle. RETAINED as a read-only fallback that
   * the `complete`-moment selector migrates from; the new UI writes soundMoments. */
  completionSound: z.boolean().default(false),
  /** 居残りモード — keep checked todos in the active list (default OFF). */
  retainCompletedInList: z.boolean().default(false),
  /** Per-moment sound toggles (task-create / complete / clear), all default OFF. */
  soundMoments: SoundMomentsSchema,
  /** The selected timbre id. `.catch` (not `.default`) so a MISSING *or* unknown
   * value both self-heal to the default rather than rejecting the whole payload. */
  soundTimbre: z.enum(TIMBRE_IDS).catch(DEFAULT_TIMBRE_ID),
  /** Master volume; a valid number is clamped to [0,1], a non-number is rejected. */
  soundVolume: z
    .number()
    .transform((value) => Math.min(1, Math.max(0, value)))
    .default(DEFAULT_SOUND_VOLUME),
  /** BrainDump editor font family. `.catch` (not `.default`) so a MISSING *or*
   * unknown id self-heals to the default rather than rejecting the whole payload. */
  braindumpFontFamily: z
    .enum(BRAINDUMP_FONT_FAMILY_IDS)
    .catch(DEFAULT_BRAINDUMP_FONT_FAMILY),
  /** BrainDump editor font size (px). A finite number is clamped to the slider
   * range; a non-finite or non-number (corrupt blob, bad sync) self-heals to the
   * default via `.catch` instead of throwing the whole parse. */
  braindumpFontSize: z
    .number()
    .finite()
    .transform((value) =>
      Math.min(
        BRAINDUMP_FONT_SIZE_MAX_PX,
        Math.max(BRAINDUMP_FONT_SIZE_MIN_PX, value),
      ),
    )
    .catch(DEFAULT_BRAINDUMP_FONT_SIZE_PX),
  /** BrainDump editor text color — a theme `var(--token)` (preset) or a `#hex`
   * (custom). Anything outside those shapes self-heals to the default. */
  braindumpTextColor: z
    .string()
    .regex(BRAINDUMP_TEXT_COLOR_PATTERN)
    .catch(DEFAULT_BRAINDUMP_TEXT_COLOR),
})

/** The validated core user-preferences shape (inferred from the schema SSoT). */
export type PreferencesState = z.infer<typeof PreferencesStateSchema>

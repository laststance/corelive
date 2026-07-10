import { type UserSettingsState } from '@/lib/schemas/settings'

/** The validated per-moment toggle map, reused from the schema SSoT so that
 * adding a moment to SOUND_MOMENT_IDS fails THIS file's compilation (the literal
 * below would be missing the new key) until the new moment is handled here. */
type SoundMoments = UserSettingsState['soundMoments']

/** Coerces an untrusted persisted value to a boolean, or `undefined` when the
 * field was absent or stored as a non-boolean (malformed). */
function coerceBooleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Folds the legacy `completionSound` boolean into the per-moment `soundMoments`
 * map. Exists because the earned-beat sound palette replaced the single
 * `completionSound` toggle with `soundMoments`, and the storage middleware
 * shallow-merges at the root — so a pre-palette persisted blob would otherwise
 * lose its "completion sound ON" intent (the new field is simply absent at
 * runtime). Called only by `migratePersistedState` against the RAW, untrusted
 * persisted JSON, so it narrows from `unknown` and never throws (a throw would
 * make the storage middleware wipe ALL persisted state, window positions too).
 *
 * @param rawSettings - The persisted `settings` blob, untyped (untrusted JSON).
 * @returns
 * - A full `soundMoments` map (legacy `complete` ON, other moments preserved or
 *   defaulted OFF) when the blob had `completionSound: true` and needs folding.
 * - `undefined` when there is nothing to fold (legacy flag absent/false) or the
 *   blob is not an object — the caller then leaves the blob byte-for-byte alone.
 * @example
 * foldLegacyCompletionSoundIntoMoments({ completionSound: true })
 * // => { 'task-create': false, complete: true, clear: false }
 * foldLegacyCompletionSoundIntoMoments({ completionSound: false }) // => undefined
 * foldLegacyCompletionSoundIntoMoments({ completionSound: true, soundMoments: { complete: false } })
 * // => { 'task-create': false, complete: false, clear: false }  (explicit choice wins)
 */
export function foldLegacyCompletionSoundIntoMoments(
  rawSettings: unknown,
): SoundMoments | undefined {
  // Narrow the untrusted blob to a readable object (mirrors isSettingsSyncEnvelope).
  if (typeof rawSettings !== 'object' || rawSettings === null) {
    return undefined
  }
  // Only fold when the legacy single-sound toggle was explicitly ON.
  const wasLegacyCompletionSoundOn =
    'completionSound' in rawSettings && rawSettings.completionSound === true
  if (!wasLegacyCompletionSoundOn) {
    return undefined
  }
  // Read any moments the palette already persisted so explicit choices survive.
  const momentsSource =
    'soundMoments' in rawSettings &&
    typeof rawSettings.soundMoments === 'object' &&
    rawSettings.soundMoments !== null
      ? rawSettings.soundMoments
      : undefined
  const existingTaskCreate = coerceBooleanOrUndefined(
    momentsSource && 'task-create' in momentsSource
      ? momentsSource['task-create']
      : undefined,
  )
  const existingComplete = coerceBooleanOrUndefined(
    momentsSource && 'complete' in momentsSource
      ? momentsSource['complete']
      : undefined,
  )
  const existingClear = coerceBooleanOrUndefined(
    momentsSource && 'clear' in momentsSource
      ? momentsSource['clear']
      : undefined,
  )
  return {
    'task-create': existingTaskCreate ?? false,
    // Legacy ON seeds complete:true, but an explicit palette choice still wins.
    complete: existingComplete ?? true,
    clear: existingClear ?? false,
  }
}

import { type PreferencesState } from '@/lib/schemas/preferences'

import { foldLegacyCompletionSoundIntoMoments } from './foldLegacyCompletionSoundIntoMoments'

/** Current persisted-state schema version. Bump (and add a matching fold/branch
 * to `migratePersistedState`) whenever a persisted shape changes incompatibly. */
export const STORAGE_SCHEMA_VERSION = 1

/** The slice of the persisted root state this migration understands. Only
 * `preferences` is read/rewritten; the open shape lets unrelated slices pass
 * through the spread untouched while keeping the function assignable to the
 * middleware's `migrate` signature. */
type MigratablePersistedState = { preferences?: PreferencesState }

/**
 * Storage-schema version + migration orchestrator for the persisted Redux state.
 * Bumping `STORAGE_SCHEMA_VERSION` makes redux-storage-middleware run this
 * `migrate` once on the next rehydrate; it seals the legacy
 * completionSound → soundMoments fold at the hydration boundary so every
 * downstream reader sees a materialized `soundMoments` (the cross-window sync
 * broadcast and the `setSoundMoment` seed no longer have to special-case the
 * absent-field legacy shape). Typed only on the `preferences` slice it touches —
 * every other slice (e.g. electronSettings window positions) rides through via
 * the object spread — which keeps it assignable to the middleware's `migrate`
 * WITHOUT importing RootState (circular) or casting. It MUST stay total: any
 * throw makes the middleware wipe ALL persisted state.
 *
 * @param persistedState - The raw persisted state from storage (untrusted; fields may be partial/absent).
 * @param oldVersion - The schema version the blob was stored at.
 * @returns
 * - The unchanged state (same reference) when already current, has no
 *   preferences, or has no legacy flag to fold.
 * - A shallow copy with `preferences.soundMoments` materialized from the legacy
 *   flag otherwise; all other slices are preserved by the spread.
 * @example
 * migratePersistedState({ preferences: { completionSound: true } }, 0)
 * // => { preferences: { completionSound: true, soundMoments: { 'task-create': false, complete: true, clear: false } } }
 * migratePersistedState({ electronSettings: { hideAppIcon: true } }, 0)
 * // => unchanged (no preferences to migrate; electronSettings preserved)
 */
export function migratePersistedState(
  persistedState: MigratablePersistedState,
  oldVersion: number,
): MigratablePersistedState {
  // Already at (or past) the current version — nothing to migrate.
  if (oldVersion >= STORAGE_SCHEMA_VERSION) {
    return persistedState
  }
  const persistedPreferences = persistedState.preferences
  if (!persistedPreferences) {
    return persistedState
  }
  const migratedSoundMoments =
    foldLegacyCompletionSoundIntoMoments(persistedPreferences)
  // No legacy completion sound to fold → leave the whole blob byte-for-byte alone.
  if (!migratedSoundMoments) {
    return persistedState
  }
  return {
    ...persistedState,
    preferences: {
      ...persistedPreferences,
      soundMoments: migratedSoundMoments,
    },
  }
}

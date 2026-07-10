import { type UserSettingsState } from '@/lib/schemas/settings'

import { foldLegacyCompletionSoundIntoMoments } from './foldLegacyCompletionSoundIntoMoments'
import { type ElectronSettingsState } from './slices/electronSettingsSlice'

/** Current persisted-state schema version. Bump (and add a matching fold/branch
 * to `migratePersistedState`) whenever a persisted shape changes incompatibly. */
export const STORAGE_SCHEMA_VERSION = 2

/** Persisted root subset plus the v1 key retained only for lossless migration. */
type MigratablePersistedState = {
  [key: string]: unknown
  electronSettings?: Partial<ElectronSettingsState>
  settings?: Partial<UserSettingsState>
  preferences?: Partial<UserSettingsState>
}

/** The canonical persisted shape exposed to the typed storage middleware. */
type CurrentPersistedState = {
  electronSettings?: ElectronSettingsState
  settings?: UserSettingsState
}

/** Narrows untrusted persisted JSON to a spread-safe object while rejecting null and arrays.
 * @param value - The decoded storage value or nested slice candidate.
 * @returns Whether the value is a non-null, non-array object.
 * @example
 * isPersistedObject({ settings: {} }) // => true
 */
const isPersistedObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Storage-schema version + migration orchestrator for the persisted Redux state.
 * Bumping `STORAGE_SCHEMA_VERSION` makes redux-storage-middleware run this
 * `migrate` once on the next rehydrate; v0 materializes sound moments, then v1
 * moves the persisted root key to `settings`. Every unrelated root field rides
 * through unchanged. It MUST stay total: any throw makes the middleware wipe
 * ALL persisted state.
 *
 * @param persistedState - The raw persisted state from storage (untrusted; fields may be partial/absent).
 * @param oldVersion - The schema version the blob was stored at.
 * @returns
 * - The unchanged state when already current or no user-settings key exists.
 * - A cleaned state when the root or user-settings slice is corrupt.
 * - A migrated v2 state with sound moments folded and the root key moved.
 * @example
 * migratePersistedState({ preferences: { completionSound: true } }, 0)
 * // => { settings: { completionSound: true, soundMoments: { 'task-create': false, complete: true, clear: false } } }
 * migratePersistedState({ electronSettings: { hideAppIcon: true } }, 0)
 * // => unchanged (no settings to migrate; electronSettings preserved)
 */
export function migratePersistedState(
  persistedState: CurrentPersistedState,
  oldVersion: number,
): CurrentPersistedState
export function migratePersistedState(
  persistedState: MigratablePersistedState,
  oldVersion: number,
): MigratablePersistedState
export function migratePersistedState(
  persistedState: MigratablePersistedState,
  oldVersion: number,
): MigratablePersistedState {
  const rawPersistedState: unknown = persistedState
  // A corrupt root cannot preserve fields, but returning an empty object lets
  // deepMerge restore reducer defaults instead of throwing and wiping storage.
  if (!isPersistedObject(rawPersistedState)) {
    return {}
  }
  // Already at (or past) the current version — nothing to migrate.
  if (oldVersion >= STORAGE_SCHEMA_VERSION) {
    return persistedState
  }
  // `preferences` is the v1 on-disk wire key; it must remain readable forever.
  const currentSettings = isPersistedObject(rawPersistedState.settings)
    ? rawPersistedState.settings
    : undefined
  const legacySettings = isPersistedObject(rawPersistedState.preferences)
    ? rawPersistedState.preferences
    : undefined
  const persistedSettings = currentSettings ?? legacySettings
  if (!persistedSettings) {
    // Drop only corrupt user-setting slices; unrelated persisted roots survive.
    if ('settings' in rawPersistedState || 'preferences' in rawPersistedState) {
      const cleanedState = { ...rawPersistedState }
      delete cleanedState.settings
      delete cleanedState.preferences
      return cleanedState as MigratablePersistedState
    }
    return persistedState
  }

  // Only v0 predates the per-moment sound palette; v1 already stores it.
  const migratedSoundMoments =
    oldVersion < 1
      ? foldLegacyCompletionSoundIntoMoments(persistedSettings)
      : undefined
  const migratedSettings = migratedSoundMoments
    ? { ...persistedSettings, soundMoments: migratedSoundMoments }
    : persistedSettings
  const migratedState: Record<string, unknown> = {
    ...rawPersistedState,
    settings: migratedSettings,
  }

  // Remove the v1 key so the next save contains one canonical settings slice.
  delete migratedState.preferences
  return migratedState as MigratablePersistedState
}

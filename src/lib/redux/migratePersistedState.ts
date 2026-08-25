import { type UserSettingsState } from '@/lib/schemas/settings'

import { foldLegacyCompletionSoundIntoMoments } from './foldLegacyCompletionSoundIntoMoments'
import { type ElectronSettingsState } from './slices/electronSettingsSlice'

/** Current persisted-state schema version. Bump (and add a matching fold/branch
 * to `migratePersistedState`) whenever a persisted shape changes incompatibly. */
export const STORAGE_SCHEMA_VERSION = 3

/** Pre-rename renderer setting keys retained only as migration input. */
type LegacyLiveEditorSettings = {
  braindumpFontFamily?: unknown
  braindumpFontSize?: unknown
  braindumpTextColor?: unknown
  braindumpClearOnComplete?: unknown
  braindumpClearDelayMs?: unknown
  braindumpToastDurationMs?: unknown
}

/** Persisted root subset plus the v1 key retained only for lossless migration. */
type MigratablePersistedState = {
  [key: string]: unknown
  electronSettings?: Partial<ElectronSettingsState>
  settings?: Partial<UserSettingsState> & LegacyLiveEditorSettings
  preferences?: Partial<UserSettingsState> & LegacyLiveEditorSettings
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

const LEGACY_LIVE_EDITOR_SETTING_KEYS = {
  braindumpFontFamily: 'liveEditorFontFamily',
  braindumpFontSize: 'liveEditorFontSize',
  braindumpTextColor: 'liveEditorTextColor',
  braindumpClearOnComplete: 'liveEditorClearOnComplete',
  braindumpClearDelayMs: 'liveEditorClearDelayMs',
  braindumpToastDurationMs: 'liveEditorToastDurationMs',
} as const

/**
 * Moves pre-rename renderer preferences to LiveEditor keys during v2→v3 rehydration so a web deploy cannot reset appearance or completion behavior.
 * @param persistedSettings - Untrusted persisted settings slice after object narrowing.
 * @returns A cloned settings object containing only canonical LiveEditor keys.
 * @example
 * migrateLegacyLiveEditorSettings({ braindumpFontSize: 18 }) // => { liveEditorFontSize: 18 }
 */
export const migrateLegacyLiveEditorSettings = (
  persistedSettings: Record<string, unknown>,
): Record<string, unknown> => {
  const migratedSettings = { ...persistedSettings }

  for (const [legacyKey, canonicalKey] of Object.entries(
    LEGACY_LIVE_EDITOR_SETTING_KEYS,
  )) {
    // An interrupted rollout may contain both keys; canonical intent wins.
    if (
      migratedSettings[canonicalKey] === undefined &&
      migratedSettings[legacyKey] !== undefined
    ) {
      migratedSettings[canonicalKey] = migratedSettings[legacyKey]
    }
    delete migratedSettings[legacyKey]
  }

  return migratedSettings
}

/**
 * Storage-schema version + migration orchestrator for the persisted Redux state.
 * Bumping `STORAGE_SCHEMA_VERSION` makes redux-storage-middleware run this
 * `migrate` once on the next rehydrate; v0 materializes sound moments, then v1
 * moves the persisted root key to `settings`, then v2 renames LiveEditor fields. Every unrelated root field rides
 * through unchanged. It MUST stay total: any throw makes the middleware wipe
 * ALL persisted state.
 *
 * @param persistedState - The raw persisted state from storage (untrusted; fields may be partial/absent).
 * @param oldVersion - The schema version the blob was stored at.
 * @returns
 * - The unchanged state when already current or no user-settings key exists.
 * - A cleaned state when the root or user-settings slice is corrupt.
 * - A migrated v3 state with sound moments folded, the root key moved, and LiveEditor settings preserved.
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
  const settingsWithSoundMoments = migratedSoundMoments
    ? { ...persistedSettings, soundMoments: migratedSoundMoments }
    : persistedSettings
  const migratedSettings =
    oldVersion < 3
      ? migrateLegacyLiveEditorSettings(settingsWithSoundMoments)
      : settingsWithSoundMoments
  const migratedState: Record<string, unknown> = {
    ...rawPersistedState,
    settings: migratedSettings,
  }

  // Remove the v1 key so the next save contains one canonical settings slice.
  delete migratedState.preferences
  return migratedState as MigratablePersistedState
}

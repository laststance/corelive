import { type UserSettingsState } from '@/lib/schemas/settings'

import { type ElectronSettingsState } from './slices/electronSettingsSlice'

/** Current persisted-state version; {@link migratePersistedState} removes retired settings when an older store hydrates. */
export const STORAGE_SCHEMA_VERSION = 4

/** Only these unused preferences are removed; unrelated saved values survive. */
const RETIRED_USER_SETTING_KEYS = [
  'retainCompletedInList',
  'completionSound',
  'soundMoments',
  'soundTimbre',
  'soundVolume',
] as const

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
  settings?: Partial<UserSettingsState> &
    LegacyLiveEditorSettings &
    Record<string, unknown>
  preferences?: Partial<UserSettingsState> &
    LegacyLiveEditorSettings &
    Record<string, unknown>
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
 * @returns A cloned settings object with canonical LiveEditor keys and unrelated values preserved.
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
 * Preserves user choices during storage hydration by renaming legacy keys and removing unused preferences without validating the whole slice.
 *
 * @param persistedState - The raw persisted state from storage (untrusted; fields may be partial/absent).
 * @param oldVersion - The schema version the blob was stored at.
 * @returns
 * - The unchanged state when already current or no user-settings key exists.
 * - A cleaned state when the root or user-settings slice is corrupt.
 * - A migrated v4 state with retired keys removed and unrelated values preserved.
 * @example
 * migratePersistedState({ preferences: { completionSound: true, braindumpFontSize: 18 } }, 0)
 * // => { settings: { liveEditorFontSize: 18 } }
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
      return cleanedState
    }
    return persistedState
  }

  const migratedSettings =
    oldVersion < 3
      ? migrateLegacyLiveEditorSettings(persistedSettings)
      : { ...persistedSettings }

  // Remove only retired keys so a malformed preference cannot reset other choices.
  for (const retiredKey of RETIRED_USER_SETTING_KEYS) {
    delete migratedSettings[retiredKey]
  }
  const migratedState: Record<string, unknown> = {
    ...rawPersistedState,
    settings: migratedSettings,
  }

  // Remove the v1 key so the next save contains one canonical settings slice.
  delete migratedState.preferences
  return migratedState
}

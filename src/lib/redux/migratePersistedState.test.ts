import { createStorageMiddleware } from '@laststance/redux-storage-middleware'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  migratePersistedState,
  STORAGE_SCHEMA_VERSION,
} from './migratePersistedState'
import electronSettingsReducer from './slices/electronSettingsSlice'
import userSettingsReducer, { setSoundMoment } from './slices/settingsSlice'

/** Preserves a deliberately partial legacy blob as the exact untrusted shape the migration accepts.
 * @param blob - A persisted root that may omit newer user-setting fields.
 * @returns The same blob, typed for the migration boundary.
 * @example
 * asPersistedState({ preferences: { completionSound: true } })
 */
function asPersistedState(
  blob: Parameters<typeof migratePersistedState>[0],
): Parameters<typeof migratePersistedState>[0] {
  return blob
}

/**
 * The orchestrator-level tests prove the pure migrate logic: it folds the legacy
 * flag AND carries every other slice through untouched (the headline data-loss
 * guard, since the version bump is global across all persisted slices).
 */
describe('migratePersistedState (orchestrator)', () => {
  it('seals the legacy completion sound while preserving electronSettings across the version bump', () => {
    // Arrange — a pre-palette blob: legacy flag on, window settings flipped off-default
    const legacyPersistedState = asPersistedState({
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
      preferences: { completionSound: true },
    })

    // Act
    const migrated = migratePersistedState(legacyPersistedState, 0)

    // Assert — completion cue materialized AND window settings survive intact
    expect(migrated.settings?.soundMoments).toEqual({
      'task-create': false,
      complete: true,
      clear: false,
    })
    expect(migrated).toHaveProperty('electronSettings', {
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
    expect(migrated).not.toHaveProperty('preferences')
  })

  it('leaves an already-current blob untouched (returns the same reference)', () => {
    // Arrange — stored at the current version, so no migration should run
    const currentPersistedState = asPersistedState({
      settings: { completionSound: true },
    })

    // Act
    const migrated = migratePersistedState(
      currentPersistedState,
      STORAGE_SCHEMA_VERSION,
    )

    // Assert
    expect(migrated).toBe(currentPersistedState)
  })

  it('passes a blob with no settings slice straight through', () => {
    // Arrange
    const electronOnlyState = asPersistedState({
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
    })

    // Act
    const migrated = migratePersistedState(electronOnlyState, 0)

    // Assert
    expect(migrated).toBe(electronOnlyState)
  })

  it('restores defaults instead of throwing when the persisted root is null', () => {
    // Arrange — localStorage JSON can be syntactically valid while its state root is null.
    const corruptRoot = null as unknown as Parameters<
      typeof migratePersistedState
    >[0]

    // Act
    const migrateCorruptRoot = () => migratePersistedState(corruptRoot, 1)

    // Assert — an empty root lets deepMerge seed reducer defaults safely.
    expect(migrateCorruptRoot).not.toThrow()
    expect(migrateCorruptRoot()).toEqual({})
  })

  it('drops a corrupt legacy settings slice without losing electronSettings', () => {
    // Arrange — only the user-settings payload is corrupt; native settings are healthy.
    const corruptLegacyState = {
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
      preferences: 'corrupt',
    } as unknown as Parameters<typeof migratePersistedState>[0]

    // Act
    const migrated = migratePersistedState(corruptLegacyState, 1)

    // Assert — the corrupt slice resets while unrelated saved state survives.
    expect(migrated).toEqual({
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
    })
  })

  it('falls back to a valid legacy slice when the canonical settings slice is corrupt', () => {
    // Arrange — an interrupted prior write left the new key corrupt but the old key intact.
    const recoverableState = {
      settings: [],
      preferences: { completionSound: false, retainCompletedInList: true },
    } as unknown as Parameters<typeof migratePersistedState>[0]

    // Act
    const migrated = migratePersistedState(recoverableState, 1)

    // Assert — the valid legacy value wins and only the canonical key remains.
    expect(migrated.settings).toMatchObject({
      completionSound: false,
      retainCompletedInList: true,
    })
    expect(migrated).not.toHaveProperty('preferences')
  })

  it('moves a v0 setting without fabricating sound moments when the legacy completion sound was off', () => {
    // Arrange
    const legacyOffState = asPersistedState({
      preferences: { completionSound: false, retainCompletedInList: true },
    })

    // Act
    const migrated = migratePersistedState(legacyOffState, 0)

    // Assert — root key moved, but no soundMoments were fabricated
    expect(migrated.settings).not.toHaveProperty('soundMoments')
    expect(migrated.settings?.retainCompletedInList).toBe(true)
    expect(migrated).not.toHaveProperty('preferences')
  })

  it('moves every v1 user setting to the v2 root key without changing values', () => {
    // Arrange
    const versionOneState = asPersistedState({
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
      preferences: {
        completionSound: false,
        retainCompletedInList: true,
        soundMoments: { 'task-create': true, complete: false, clear: true },
        soundTimbre: 'wood',
        soundVolume: 0.3,
      },
    })

    // Act
    const migrated = migratePersistedState(versionOneState, 1)

    // Assert
    expect(migrated.settings).toMatchObject({
      completionSound: false,
      retainCompletedInList: true,
      soundMoments: { 'task-create': true, complete: false, clear: true },
      soundTimbre: 'wood',
      soundVolume: 0.3,
    })
    expect(migrated.electronSettings).toEqual({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
    expect(migrated).not.toHaveProperty('preferences')
  })
})

/**
 * The integration tests drive the REAL storage middleware end-to-end: seed a
 * versioned blob in localStorage, rehydrate, and assert the live store. This is
 * the only layer that proves `version` actually triggers `migrate` and that the
 * global version bump does not wipe a real user's persisted slices.
 */
describe('storage rehydrate migration (integration)', () => {
  const TEST_STORAGE_KEY = 'corelive-redux-state-migration-test'

  /** Builds a store wired exactly like the app's (same version + migrate) and
   * deterministically completes the rehydrate read from the seeded localStorage. */
  async function buildAndRehydrateStore() {
    const rootReducer = combineReducers({
      electronSettings: electronSettingsReducer,
      settings: userSettingsReducer,
    })
    const { middleware, reducer, api } = createStorageMiddleware({
      rootReducer,
      key: TEST_STORAGE_KEY,
      slices: ['electronSettings', 'settings'],
      version: STORAGE_SCHEMA_VERSION,
      migrate: migratePersistedState,
    })
    const store = configureStore({
      reducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }).concat(middleware),
    })
    // Drive hydration synchronously-to-completion instead of racing the auto-trigger.
    await api.rehydrate()
    return store
  }

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('rehydrates a legacy v0 completion-sound blob into a live complete cue while keeping electronSettings', async () => {
    // Arrange — a pre-palette persisted blob at version 0
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          electronSettings: {
            hideAppIcon: true,
            showInMenuBar: false,
            startAtLogin: true,
          },
          preferences: { completionSound: true },
        },
      }),
    )

    // Act
    const store = await buildAndRehydrateStore()

    // Assert — the complete cue is now ON and window settings are intact
    expect(store.getState().settings.soundMoments.complete).toBe(true)
    expect(store.getState().electronSettings).toEqual({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
  })

  it('preserves an already-materialized blob (no completion sound) when bumping the version', async () => {
    // Arrange — a real current-user blob: palette already set, legacy flag off
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          electronSettings: {
            hideAppIcon: true,
            showInMenuBar: false,
            startAtLogin: true,
          },
          preferences: {
            completionSound: false,
            retainCompletedInList: false,
            soundMoments: { 'task-create': true, complete: true, clear: true },
            soundTimbre: 'felt',
            soundVolume: 1,
          },
        },
      }),
    )

    // Act
    const store = await buildAndRehydrateStore()

    // Assert — every moment the user set survives the version bump untouched
    expect(store.getState().settings.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: true,
    })
    expect(store.getState().electronSettings).toEqual({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
  })

  it('rehydrates defaults for a corrupt user slice without wiping electronSettings', async () => {
    // Arrange — the v1 user slice is corrupt while the native settings remain valid.
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          electronSettings: {
            hideAppIcon: true,
            showInMenuBar: false,
            startAtLogin: true,
          },
          preferences: 'corrupt',
        },
      }),
    )

    // Act
    const store = await buildAndRehydrateStore()

    // Assert — Redux defaults replace only the corrupt slice.
    expect(store.getState().settings.soundMoments).toEqual({
      'task-create': false,
      complete: false,
      clear: false,
    })
    expect(store.getState().electronSettings).toEqual({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
  })

  it('keeps the migrated complete cue ON when a later toggle flips an unrelated moment', async () => {
    // Arrange — a legacy v0 blob with the completion sound ON, rehydrated through the seal
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: { preferences: { completionSound: true } },
      }),
    )
    const store = await buildAndRehydrateStore()
    // Precondition — the seal materialized the legacy intent into soundMoments
    expect(store.getState().settings.soundMoments.complete).toBe(true)

    // Act — toggle a DIFFERENT moment on. Before the seal, this reducer read
    // soundMoments as absent and reseeded from the all-OFF default, silently
    // clobbering the user's complete cue back to false (the original P1 bug).
    store.dispatch(setSoundMoment({ moment: 'task-create', enabled: true }))

    // Assert — the migrated complete cue survives the unrelated toggle
    expect(store.getState().settings.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: false,
    })
  })
})

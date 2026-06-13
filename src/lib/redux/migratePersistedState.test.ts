import { createStorageMiddleware } from '@laststance/redux-storage-middleware'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type PreferencesState } from '@/lib/schemas/preferences'

import {
  migratePersistedState,
  STORAGE_SCHEMA_VERSION,
} from './migratePersistedState'
import electronSettingsReducer, {
  type ElectronSettingsState,
} from './slices/electronSettingsSlice'
import preferencesReducer, { setSoundMoment } from './slices/preferencesSlice'

/** Wraps a deliberately-partial legacy blob as the untrusted persisted shape
 * migrate sees at runtime. The cast mirrors the `stateWith` idiom in
 * preferencesSlice.test.ts: today's complete PreferencesState type does not admit
 * a pre-palette blob, yet that under-specified shape is exactly what we test. */
function asPersistedState(blob: {
  electronSettings?: ElectronSettingsState
  preferences?: Partial<PreferencesState>
}): Parameters<typeof migratePersistedState>[0] {
  return blob as Parameters<typeof migratePersistedState>[0]
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
    expect(migrated.preferences?.soundMoments).toEqual({
      'task-create': false,
      complete: true,
      clear: false,
    })
    expect(migrated).toHaveProperty('electronSettings', {
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
  })

  it('leaves an already-current blob untouched (returns the same reference)', () => {
    // Arrange — stored at the current version, so no migration should run
    const currentPersistedState = asPersistedState({
      preferences: { completionSound: true },
    })

    // Act
    const migrated = migratePersistedState(
      currentPersistedState,
      STORAGE_SCHEMA_VERSION,
    )

    // Assert
    expect(migrated).toBe(currentPersistedState)
  })

  it('passes a blob with no preferences slice straight through', () => {
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

  it('does not add soundMoments when the legacy completion sound was off', () => {
    // Arrange
    const legacyOffState = asPersistedState({
      preferences: { completionSound: false, retainCompletedInList: true },
    })

    // Act
    const migrated = migratePersistedState(legacyOffState, 0)

    // Assert — untouched, no soundMoments fabricated
    expect(migrated).toBe(legacyOffState)
    expect(migrated.preferences).not.toHaveProperty('soundMoments')
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
      preferences: preferencesReducer,
    })
    const { middleware, reducer, api } = createStorageMiddleware({
      rootReducer,
      key: TEST_STORAGE_KEY,
      slices: ['electronSettings', 'preferences'],
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
    expect(store.getState().preferences.soundMoments.complete).toBe(true)
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
    expect(store.getState().preferences.soundMoments).toEqual({
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
    expect(store.getState().preferences.soundMoments.complete).toBe(true)

    // Act — toggle a DIFFERENT moment on. Before the seal, this reducer read
    // soundMoments as absent and reseeded from the all-OFF default, silently
    // clobbering the user's complete cue back to false (the original P1 bug).
    store.dispatch(setSoundMoment({ moment: 'task-create', enabled: true }))

    // Assert — the migrated complete cue survives the unrelated toggle
    expect(store.getState().preferences.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: false,
    })
  })
})

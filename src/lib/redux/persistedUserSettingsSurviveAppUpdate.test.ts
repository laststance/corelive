/**
 * Spec: a saved setting must survive an app version-up. It must never
 * silently revert to its default, and a setting field introduced by a newer
 * app version must read back at its default — not `undefined`.
 *
 * Regresses the hydration bug where the persistence middleware's default
 * `shallowMerge` replaced each persisted slice wholesale (`{ ...current,
 * ...persisted }`), so any field ADDED after a user first persisted was dropped:
 * Sound, BrainDump, and Electron settings read back as "reset to default"
 * after an update. The fix opts the store into `deepMerge`
 * (`createPersistenceMiddleware` in `./store`), which fills every missing field
 * from the current defaults while preserving all user-set values.
 *
 * These tests drive the EXACT production persistence config via the shared
 * `createPersistenceMiddleware` factory, so they fail if production ever drops
 * the `deepMerge` reconciler.
 */
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { STORAGE_SCHEMA_VERSION } from './migratePersistedState'
import { selectShowInMenuBar } from './slices/electronSettingsSlice'
import {
  createPersistenceMiddleware,
  type RootState,
  STORAGE_KEY,
} from './store'

/**
 * Seeds localStorage with a persisted blob and rehydrates a fresh store through
 * the real production persistence middleware (deepMerge + migrate).
 * @param seed - The `{ version, state }` envelope to write to {@link STORAGE_KEY}.
 * @returns The store's state after hydration completes.
 */
async function rehydrateFromSeed(seed: unknown): Promise<RootState> {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
  const { middleware, reducer, api } = createPersistenceMiddleware()
  const store = configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(middleware),
  })
  await api.rehydrate()
  return store.getState()
}

describe('settings survive an app update (no silent revert to defaults)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('keeps saved Sound settings and fills new BrainDump fields with defaults', async () => {
    // Arrange — a current-version blob from a user who set Sound + 居残りモード
    // BEFORE the BrainDump editor fields (font / size / color / clear-on-complete)
    // shipped, so the persisted `settings` predates those fields entirely.
    const seed = {
      version: STORAGE_SCHEMA_VERSION,
      state: {
        settings: {
          completionSound: false,
          retainCompletedInList: true,
          soundMoments: { 'task-create': true, complete: true, clear: false },
          soundTimbre: 'wood',
          soundVolume: 0.3,
        },
      },
    }

    // Act
    const state = await rehydrateFromSeed(seed)

    // Assert — every saved value is preserved (no revert)…
    expect(state.settings.soundTimbre).toBe('wood')
    expect(state.settings.soundVolume).toBe(0.3)
    expect(state.settings.retainCompletedInList).toBe(true)
    expect(state.settings.completionSound).toBe(false)
    expect(state.settings.soundMoments).toEqual({
      'task-create': true,
      complete: true,
      clear: false,
    })
    // …and the newer fields are MATERIALIZED at their defaults in raw state,
    // not left `undefined` (the shallow-merge drop this regresses).
    expect(state.settings.braindumpFontFamily).toBe('mono')
    expect(state.settings.braindumpFontSize).toBe(14)
    expect(state.settings.braindumpTextColor).toBe('var(--foreground)')
    expect(state.settings.braindumpClearOnComplete).toBe(false)
  })

  it('restores the menu-bar default when an older blob predates that electron setting', async () => {
    // Arrange — an electronSettings blob missing `showInMenuBar` (stand-in for
    // ANY field a user persisted before it existed). electronSettings selectors
    // have no `?? default` guard, so under shallow-merge this read back undefined.
    const seed = {
      version: STORAGE_SCHEMA_VERSION,
      state: {
        electronSettings: { hideAppIcon: true, startAtLogin: false },
        settings: {},
      },
    }

    // Act
    const state = await rehydrateFromSeed(seed)

    // Assert — the absent field is filled from its default (true), not undefined;
    // the saved field is preserved.
    expect(selectShowInMenuBar(state)).toBe(true)
    expect(state.electronSettings.showInMenuBar).toBe(true)
    expect(state.electronSettings.hideAppIcon).toBe(true)
    expect(state.electronSettings.startAtLogin).toBe(false)
  })

  it('keeps the other saved settings when one persisted field is the wrong type', async () => {
    // Arrange — one corrupt field (wrong type). A reconciler that re-parsed the
    // slice through Zod would reject the WHOLE slice and reset every setting;
    // deepMerge preserves the good values (the corrupt one self-heals via its
    // selector). Locks the deepMerge-over-Zod choice for the hydration boundary.
    const seed = {
      version: STORAGE_SCHEMA_VERSION,
      state: {
        settings: {
          retainCompletedInList: 'yes', // corrupt: must be a boolean
          soundTimbre: 'wood',
          soundVolume: 0.3,
        },
      },
    }

    // Act
    const state = await rehydrateFromSeed(seed)

    // Assert — the good saved values survive (NOT reset to defaults).
    expect(state.settings.soundTimbre).toBe('wood')
    expect(state.settings.soundVolume).toBe(0.3)
  })
})

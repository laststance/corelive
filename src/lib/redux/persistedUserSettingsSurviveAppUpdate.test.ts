/** Saved user choices survive application updates through the production persistence middleware. */
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { STORAGE_SCHEMA_VERSION } from './migratePersistedState'
import { selectShowInMenuBar } from './slices/electronSettingsSlice'
import { setShowTodayEmber } from './slices/settingsSlice'
import { createPersistenceMiddleware, STORAGE_KEY } from './store'

/** Hydrates a fresh store through the production migration and merge configuration for upgrade tests.
 * @returns The hydrated store.
 * @example
 * const { store } = await rehydrateSavedSettings()
 */
async function rehydrateSavedSettings() {
  const { middleware, reducer, api } = createPersistenceMiddleware()
  const store = configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(middleware),
  })
  await api.rehydrate()
  return { store }
}

describe('settings survive an app update', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  test.each([0, 1, 2, 3, 4])(
    'upgrades v%s and preserves choices after another save and reload',
    async (version) => {
      // Arrange
      const settings = {
        completionSound: true,
        retainCompletedInList: true,
        soundMoments: { 'task-create': true, complete: true, clear: true },
        soundTimbre: 'wood',
        soundVolume: 0.3,
        showCompletedTaskStrikethrough: false,
        showTodayEmber: true,
        ...(version < 3
          ? {
              braindumpFontFamily: 'serif',
              braindumpFontSize: 21,
              braindumpTextColor: '#c2410c',
              braindumpClearOnComplete: true,
              braindumpClearDelayMs: 1200,
              braindumpToastDurationMs: 6400,
            }
          : {
              liveEditorFontFamily: 'serif',
              liveEditorFontSize: 21,
              liveEditorTextColor: '#c2410c',
              liveEditorClearOnComplete: true,
              liveEditorClearDelayMs: 1200,
              liveEditorToastDurationMs: 6400,
            }),
      }
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version,
          state: {
            ...(version < 2 ? { preferences: settings } : { settings }),
            electronSettings: {
              hideAppIcon: true,
              showInMenuBar: false,
              startAtLogin: true,
            },
          },
        }),
      )
      window.localStorage.setItem('corelive-theme', 'dark')
      window.localStorage.setItem('unrelated-note', 'Keep my note')

      // Act
      const first = await rehydrateSavedSettings()
      first.store.dispatch(setShowTodayEmber(false))
      await vi.waitFor(() => {
        expect(window.localStorage.getItem(STORAGE_KEY)).toContain(
          '"version":5',
        )
        expect(window.localStorage.getItem(STORAGE_KEY)).toContain(
          '"showTodayEmber":false',
        )
        expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain(
          'soundMoments',
        )
      })
      const reloaded = await rehydrateSavedSettings()

      // Assert
      expect(reloaded.store.getState().settings).toEqual({
        showTodayEmber: false,
        liveEditorFontFamily: 'serif',
        liveEditorFontSize: 21,
        liveEditorTextColor: '#c2410c',
        liveEditorClearOnComplete: true,
        liveEditorClearDelayMs: 1200,
        liveEditorToastDurationMs: 6400,
      })
      expect(reloaded.store.getState().electronSettings).toEqual({
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      })
      expect(window.localStorage.getItem('corelive-theme')).toBe('dark')
      expect(window.localStorage.getItem('unrelated-note')).toBe('Keep my note')
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain(
        'soundMoments',
      )
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain(
        'retainCompletedInList',
      )
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain(
        'showCompletedTaskStrikethrough',
      )
    },
  )

  test('keeps Today Ember enabled after reopening the app', async () => {
    // Arrange
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_SCHEMA_VERSION,
        state: { settings: { showTodayEmber: true, liveEditorFontSize: 21 } },
      }),
    )

    // Act
    const { store } = await rehydrateSavedSettings()

    // Assert
    expect(store.getState().settings.showTodayEmber).toBe(true)
    expect(store.getState().settings.liveEditorFontSize).toBe(21)
  })

  test('keeps Today Ember disabled after reopening the app', async () => {
    // Arrange
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_SCHEMA_VERSION,
        state: { settings: { showTodayEmber: false, liveEditorFontSize: 21 } },
      }),
    )

    // Act
    const { store } = await rehydrateSavedSettings()

    // Assert
    expect(store.getState().settings.showTodayEmber).toBe(false)
    expect(store.getState().settings.liveEditorFontSize).toBe(21)
  })

  test('restores the menu-bar default when an older blob predates that setting', async () => {
    // Arrange
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        state: {
          electronSettings: { hideAppIcon: true, startAtLogin: false },
          settings: {},
        },
      }),
    )

    // Act
    const { store } = await rehydrateSavedSettings()
    const state = store.getState()

    // Assert
    expect(selectShowInMenuBar(state)).toBe(true)
    expect(state.electronSettings).toEqual({
      hideAppIcon: true,
      showInMenuBar: true,
      startAtLogin: false,
    })
  })

  test('keeps valid choices when one retained preference has the wrong type', async () => {
    // Arrange: validating the entire saved slice would lose these valid choices.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        state: {
          settings: {
            showTodayEmber: 'yes',
            liveEditorFontFamily: 'serif',
            liveEditorFontSize: 22,
          },
        },
      }),
    )

    // Act
    const { store } = await rehydrateSavedSettings()

    // Assert
    expect(store.getState().settings.liveEditorFontFamily).toBe('serif')
    expect(store.getState().settings.liveEditorFontSize).toBe(22)
  })

  test('recovers from a corrupt settings slice without wiping native choices', async () => {
    // Arrange
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        state: {
          settings: null,
          electronSettings: {
            hideAppIcon: true,
            showInMenuBar: false,
            startAtLogin: true,
          },
        },
      }),
    )

    // Act
    const { store } = await rehydrateSavedSettings()

    // Assert
    expect(store.getState().settings.showTodayEmber).toBe(false)
    expect(store.getState().electronSettings).toEqual({
      hideAppIcon: true,
      showInMenuBar: false,
      startAtLogin: true,
    })
  })
})

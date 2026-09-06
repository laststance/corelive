import { describe, expect, test } from 'vitest'

import {
  migratePersistedState,
  STORAGE_SCHEMA_VERSION,
} from './migratePersistedState'

describe('persisted settings migration', () => {
  test.each([0, 1, 2, 3])(
    'removes retired preferences from v%s without changing other saved data',
    (version) => {
      // Arrange
      const savedSettings: NonNullable<
        Parameters<typeof migratePersistedState>[0]['settings']
      > = {
        retainCompletedInList: true,
        completionSound: true,
        soundMoments: { 'task-create': true, complete: true, clear: false },
        soundTimbre: 'wood',
        soundVolume: 0.3,
        showCompletedTaskStrikethrough: false,
        liveEditorFontFamily: 'serif',
        liveEditorFontSize: 21,
        liveEditorTextColor: '#c2410c',
        liveEditorClearOnComplete: true,
        liveEditorClearDelayMs: 1200,
        liveEditorToastDurationMs: 6400,
        futurePreference: { keep: true },
      }
      const persistedState = {
        ...(version < 2
          ? { preferences: savedSettings }
          : { settings: savedSettings }),
        electronSettings: {
          hideAppIcon: true,
          showInMenuBar: false,
          startAtLogin: true,
        },
        unrelatedRoot: { notes: ['Keep my note'] },
      }

      // Act
      const migrated = migratePersistedState(persistedState, version)

      // Assert
      expect(migrated).toEqual({
        settings: {
          showCompletedTaskStrikethrough: false,
          liveEditorFontFamily: 'serif',
          liveEditorFontSize: 21,
          liveEditorTextColor: '#c2410c',
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 1200,
          liveEditorToastDurationMs: 6400,
          futurePreference: { keep: true },
        },
        electronSettings: {
          hideAppIcon: true,
          showInMenuBar: false,
          startAtLogin: true,
        },
        unrelatedRoot: { notes: ['Keep my note'] },
      })
      expect(savedSettings).toHaveProperty('retainCompletedInList', true)
      expect(savedSettings).toHaveProperty('soundVolume', 0.3)
    },
  )

  test.each([0, 1, 2])(
    'preserves every legacy LiveEditor choice during the v%s upgrade',
    (version) => {
      // Arrange
      const persistedState = {
        preferences: {
          completionSound: true,
          braindumpFontFamily: 'serif',
          braindumpFontSize: 21,
          braindumpTextColor: '#c2410c',
          braindumpClearOnComplete: true,
          braindumpClearDelayMs: 1200,
          braindumpToastDurationMs: 6400,
        },
      }

      // Act
      const migrated = migratePersistedState(persistedState, version)

      // Assert
      expect(migrated).toEqual({
        settings: {
          liveEditorFontFamily: 'serif',
          liveEditorFontSize: 21,
          liveEditorTextColor: '#c2410c',
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 1200,
          liveEditorToastDurationMs: 6400,
        },
      })
    },
  )

  test('keeps canonical preferences when both old and current settings exist', () => {
    // Arrange
    const persistedState = {
      preferences: {
        showCompletedTaskStrikethrough: true,
        braindumpFontSize: 12,
      },
      settings: {
        showCompletedTaskStrikethrough: false,
        liveEditorFontSize: 21,
        braindumpFontSize: 18,
      },
    }

    // Act
    const migrated = migratePersistedState(persistedState, 2)

    // Assert
    expect(migrated).toEqual({
      settings: {
        showCompletedTaskStrikethrough: false,
        liveEditorFontSize: 21,
      },
    })
  })

  test('removes corrupt retired fields without resetting other preferences', () => {
    // Arrange
    const persistedState = {
      settings: {
        retainCompletedInList: 'yes',
        completionSound: null,
        soundMoments: [],
        soundTimbre: 42,
        soundVolume: 'loud',
        liveEditorFontSize: 22,
        showCompletedTaskStrikethrough: false,
      },
    }

    // Act
    const migrated = migratePersistedState(persistedState, 3)

    // Assert
    expect(migrated).toEqual({
      settings: {
        liveEditorFontSize: 22,
        showCompletedTaskStrikethrough: false,
      },
    })
  })

  test.each([4, 5])(
    'leaves current or future v%s data unchanged',
    (version) => {
      // Arrange
      const persistedState = {
        settings: { showCompletedTaskStrikethrough: false },
      }

      // Act
      const migrated = migratePersistedState(persistedState, version)

      // Assert
      expect(STORAGE_SCHEMA_VERSION).toBe(4)
      expect(migrated).toBe(persistedState)
    },
  )

  test('preserves a root with no user-settings slice', () => {
    // Arrange
    const persistedState = {
      electronSettings: { hideAppIcon: true },
      unrelatedRoot: 'keep',
    }

    // Act
    const migrated = migratePersistedState(persistedState, 0)

    // Assert
    expect(migrated).toEqual({
      electronSettings: { hideAppIcon: true },
      unrelatedRoot: 'keep',
    })
  })

  test('recovers from a corrupt root without throwing away the hydration process', () => {
    // Arrange: raw persisted JSON can contain values outside the compile-time contract.
    const persistedState = null as unknown as Parameters<
      typeof migratePersistedState
    >[0]

    // Act
    const migrated = migratePersistedState(persistedState, 3)

    // Assert
    expect(migrated).toEqual({})
  })

  test('discards a corrupt settings slice while preserving native settings', () => {
    // Arrange
    const persistedState = {
      preferences: 'corrupt',
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
    } as unknown as Parameters<typeof migratePersistedState>[0]

    // Act
    const migrated = migratePersistedState(persistedState, 1)

    // Assert
    expect(migrated).toEqual({
      electronSettings: {
        hideAppIcon: true,
        showInMenuBar: false,
        startAtLogin: true,
      },
    })
  })

  test('uses valid legacy preferences when the current settings slice is corrupt', () => {
    // Arrange
    const persistedState = {
      settings: null,
      preferences: {
        showCompletedTaskStrikethrough: false,
        completionSound: true,
      },
    } as unknown as Parameters<typeof migratePersistedState>[0]

    // Act
    const migrated = migratePersistedState(persistedState, 2)

    // Assert
    expect(migrated).toEqual({
      settings: { showCompletedTaskStrikethrough: false },
    })
  })
})

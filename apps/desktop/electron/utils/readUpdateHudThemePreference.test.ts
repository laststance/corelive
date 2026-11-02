import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { describe, expect, test } from 'vitest'

import { readUpdateHudThemePreference } from './readUpdateHudThemePreference'

/**
 * Builds a ready snapshot for a prepared account whose saved desktop theme is `theme`.
 * @param theme - The stored `preferences.theme` value.
 * @returns a complete `ready` snapshot.
 */
function readySnapshotWithTheme(theme: string): OfflineEditorSnapshot {
  return {
    phase: 'ready',
    generation: 2,
    sync: 'offline',
    workspace: {
      ownerId: 'account-a',
      revision: 4,
      selectedCategoryId: 1,
      categories: [],
      preferences: {
        revision: 3,
        theme,
        settings: UserSettingsStateSchema.parse({}),
      },
      draft: { revision: 0, rows: [] },
      pendingCount: 0,
      blockedCount: 0,
      recentUndo: [],
      eligibleUndoCount: 0,
      checkpoint: null,
      nextClearAt: null,
      nextUndoAt: null,
      categoryDeletions: {},
      recoveryCopyCount: 0,
      today: {
        day: '2026-11-03',
        timezone: 'UTC',
        total: 0,
        deviceTotal: 0,
        scope: 'device',
        stale: true,
        confirmedAt: null,
        lastAccountTotal: null,
      },
    },
  }
}

describe('update-download window theme source (#214)', () => {
  test('paints the HUD with the theme saved in a ready desktop workspace', () => {
    // Arrange
    const snapshot = readySnapshotWithTheme('harbor-dark')

    // Act
    const theme = readUpdateHudThemePreference(snapshot)

    // Assert
    expect(theme).toBe('harbor-dark')
  })

  test('passes a stored System choice through unchanged', () => {
    // Arrange
    const snapshot = readySnapshotWithTheme('system')

    // Act
    const theme = readUpdateHudThemePreference(snapshot)

    // Assert
    expect(theme).toBe('system')
  })

  test.each([
    'opening',
    'preparing',
    'needs-preparation',
    'locked',
    'recovery',
  ] as const)(
    'falls back to the Default theme while the account is %s (no theme known yet)',
    (phase) => {
      // Arrange
      const snapshot: OfflineEditorSnapshot = { phase, generation: 2 }

      // Act
      const theme = readUpdateHudThemePreference(snapshot)

      // Assert
      expect(theme).toBeUndefined()
    },
  )

  test('falls back to the Default theme before the offline editor exists', () => {
    // Arrange + Act
    const theme = readUpdateHudThemePreference(undefined)

    // Assert
    expect(theme).toBeUndefined()
  })
})

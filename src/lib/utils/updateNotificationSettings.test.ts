import { describe, expect, it, vi } from 'vitest'

import { type NotificationSettingsState } from '@/electron/types/ipc'

import { updateNotificationSettings } from './updateNotificationSettings'

const SAVED_SETTINGS: NotificationSettingsState = {
  enabled: true,
  taskCreated: true,
  taskCompleted: true,
  taskUpdated: false,
  taskDeleted: false,
  sound: false,
  showInTray: true,
  autoHide: true,
  autoHideDelay: 5000,
  position: 'topRight',
}

describe('updateNotificationSettings', () => {
  it('writes through updateSettings when the installed app exposes the renamed bridge', async () => {
    // Arrange
    const updateSettings = vi.fn().mockResolvedValue(SAVED_SETTINGS)
    const updatePreferences = vi.fn().mockResolvedValue(null)
    const bridge = { updateSettings, updatePreferences }

    // Act
    const result = await updateNotificationSettings(bridge, { sound: false })

    // Assert
    expect(result).toEqual(SAVED_SETTINGS)
    expect(updateSettings).toHaveBeenCalledWith({ sound: false })
    expect(updatePreferences).not.toHaveBeenCalled()
  })

  it('keeps notification settings writable in an older installed app', async () => {
    // Arrange
    const updatePreferences = vi.fn().mockResolvedValue(SAVED_SETTINGS)
    const bridge = { updatePreferences }

    // Act
    const result = await updateNotificationSettings(bridge, { sound: false })

    // Assert
    expect(result).toEqual(SAVED_SETTINGS)
    expect(updatePreferences).toHaveBeenCalledWith({ sound: false })
  })
})

import { describe, expect, it, vi } from 'vitest'

import { type NotificationSettingsState } from '@/electron/types/ipc'

import { getNotificationSettings } from './getNotificationSettings'

const SAVED_SETTINGS: NotificationSettingsState = {
  enabled: true,
  taskCreated: true,
  taskCompleted: true,
  taskUpdated: false,
  taskDeleted: false,
  sound: true,
  showInTray: true,
  autoHide: true,
  autoHideDelay: 5000,
  position: 'topRight',
}

describe('getNotificationSettings', () => {
  it('reads through getSettings when the installed app exposes the renamed bridge', async () => {
    // Arrange
    const getSettings = vi.fn().mockResolvedValue(SAVED_SETTINGS)
    const getPreferences = vi.fn().mockResolvedValue(null)
    const bridge = { getSettings, getPreferences }

    // Act
    const result = await getNotificationSettings(bridge)

    // Assert
    expect(result).toEqual(SAVED_SETTINGS)
    expect(getSettings).toHaveBeenCalledOnce()
    expect(getPreferences).not.toHaveBeenCalled()
  })

  it('keeps notification settings readable in an older installed app', async () => {
    // Arrange
    const getPreferences = vi.fn().mockResolvedValue(SAVED_SETTINGS)
    const bridge = { getPreferences }

    // Act
    const result = await getNotificationSettings(bridge)

    // Assert
    expect(result).toEqual(SAVED_SETTINGS)
    expect(getPreferences).toHaveBeenCalledOnce()
  })
})

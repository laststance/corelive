import { type NotificationSettingsState } from '@/electron/types/ipc'

type NotificationSettingsReaderBridge = {
  getSettings?: () => Promise<NotificationSettingsState | null>
  getPreferences?: () => Promise<NotificationSettingsState | null>
}

/** Reads notification settings through the new bridge and falls back when an older installed app hosts the current web renderer.
 * @param bridge - The version-skewed notification preload bridge.
 * @returns The stored notification settings, or null when none are available.
 * @example
 * await getNotificationSettings(window.electronAPI.notifications) // => { enabled: true, ... }
 */
export const getNotificationSettings = async (
  bridge: NotificationSettingsReaderBridge,
): Promise<NotificationSettingsState | null> => {
  const readSettings = bridge.getSettings ?? bridge.getPreferences
  if (!readSettings) {
    throw new Error('Notification settings bridge is unavailable')
  }
  return readSettings()
}

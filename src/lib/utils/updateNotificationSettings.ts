import { type NotificationSettingsState } from '@/electron/types/ipc'

type NotificationSettingsWriterBridge = {
  updateSettings?: (
    settings: Partial<NotificationSettingsState>,
  ) => Promise<NotificationSettingsState | null>
  updatePreferences?: (
    settings: Partial<NotificationSettingsState>,
  ) => Promise<NotificationSettingsState | null>
}

/** Writes notification settings through the new bridge and falls back when an older installed app hosts the current web renderer.
 * @param bridge - The version-skewed notification preload bridge.
 * @param settings - The notification settings fields to persist.
 * @returns The saved notification settings, or null when the main process has none.
 * @example
 * await updateNotificationSettings(window.electronAPI.notifications, { sound: false }) // => { sound: false, ... }
 */
export const updateNotificationSettings = async (
  bridge: NotificationSettingsWriterBridge,
  settings: Partial<NotificationSettingsState>,
): Promise<NotificationSettingsState | null> => {
  const writeSettings = bridge.updateSettings ?? bridge.updatePreferences
  if (!writeSettings) {
    throw new Error('Notification settings bridge is unavailable')
  }
  return writeSettings(settings)
}

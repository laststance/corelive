'use client'

import { useState, useEffect } from 'react'

import { getNotificationSettings } from '@/lib/utils/getNotificationSettings'
import { updateNotificationSettings } from '@/lib/utils/updateNotificationSettings'

import { log } from '../lib/logger'

/**
 * Subset of NotificationSettingsState from electron/types/ipc.ts.
 * The full IPC type includes additional fields (taskReminders, dueDateAlerts,
 * achievementNotifications, quietHours*, etc.) that this hook doesn't use.
 * We only track the settings relevant to task-based notifications.
 */
interface NotificationSettingsState {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
}

interface NotificationShowOptions {
  tag?: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
}

/** Default notification settings */
const DEFAULT_SETTINGS: NotificationSettingsState = {
  enabled: true,
  taskCreated: true,
  taskCompleted: true,
  taskUpdated: true,
  taskDeleted: false,
  sound: true,
}

interface UseElectronNotificationsReturn {
  isSupported: boolean
  isEnabled: boolean
  settings: NotificationSettingsState | null
  activeCount: number
  showNotification: (
    title: string,
    body: string,
    options?: NotificationShowOptions,
  ) => Promise<void>
  updateSettings: (
    settings: Partial<NotificationSettingsState>,
  ) => Promise<void>
  clearAll: () => Promise<void>
  clearNotification: (tag: string) => Promise<void>
  refreshActiveCount: () => Promise<void>
}

/** Coalesces the older notification payload when initial hook hydration receives missing task toggles.
 * @param storedSettings - Settings returned by either generation of the preload bridge.
 * @returns The complete task-notification settings used by this hook.
 * @example
 * normalizeSettings({ enabled: true, sound: false }) // => task toggles filled from defaults
 */
function normalizeSettings(
  storedSettings: Partial<NotificationSettingsState> & {
    enabled: boolean
    sound: boolean
  },
): NotificationSettingsState {
  return {
    enabled: storedSettings.enabled,
    sound: storedSettings.sound,
    taskCreated: storedSettings.taskCreated ?? DEFAULT_SETTINGS.taskCreated,
    taskCompleted:
      storedSettings.taskCompleted ?? DEFAULT_SETTINGS.taskCompleted,
    taskUpdated: storedSettings.taskUpdated ?? DEFAULT_SETTINGS.taskUpdated,
    taskDeleted: storedSettings.taskDeleted ?? DEFAULT_SETTINGS.taskDeleted,
  }
}

export function useElectronNotifications(): UseElectronNotificationsReturn {
  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI?.notifications)

  const isSupported = isElectron

  const [isEnabled, setIsEnabled] = useState(false)
  const [settings, setSettings] = useState<NotificationSettingsState | null>(
    null,
  )
  const [activeCount, setActiveCount] = useState(0)

  const refreshActiveCount = async () => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      const count = await window.electronAPI.notifications.getActiveCount()
      setActiveCount(count)
    } catch (error) {
      log.error('Failed to refresh active count:', error)
    }
  }

  const showNotification = async (
    title: string,
    body: string,
    options: NotificationShowOptions = {},
  ) => {
    if (!isElectron || !isEnabled || !window.electronAPI?.notifications) {
      return
    }

    try {
      await window.electronAPI.notifications.show(title, body, options)
      await refreshActiveCount()
    } catch (error) {
      log.error('Failed to show notification:', error)
      throw error
    }
  }

  const updateSettings = async (
    newSettings: Partial<NotificationSettingsState>,
  ) => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      const currentSettings = settings ?? DEFAULT_SETTINGS
      const updatedSettings = { ...currentSettings, ...newSettings }
      const savedSettings = await updateNotificationSettings(
        window.electronAPI.notifications,
        newSettings,
      )
      if (savedSettings) {
        setSettings(updatedSettings)
        setIsEnabled(updatedSettings.enabled)
      }
    } catch (error) {
      log.error('Failed to update notification settings:', error)
      throw error
    }
  }

  const clearAll = async () => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      await window.electronAPI.notifications.clearAll()
      setActiveCount(0)
    } catch (error) {
      log.error('Failed to clear all notifications:', error)
      throw error
    }
  }

  const clearNotification = async (tag: string) => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      await window.electronAPI.notifications.clear(tag)
      await refreshActiveCount()
    } catch (error) {
      log.error('Failed to clear notification:', error)
      throw error
    }
  }

  useEffect(() => {
    const electronAPI = window.electronAPI
    if (!isElectron || !electronAPI?.notifications) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const [enabled, storedSettings, count] = await Promise.all([
          electronAPI.notifications.isEnabled(),
          getNotificationSettings(electronAPI.notifications),
          electronAPI.notifications.getActiveCount(),
        ])

        if (cancelled) {
          return
        }

        setIsEnabled(enabled)
        if (storedSettings) {
          setSettings(normalizeSettings(storedSettings))
        }
        setActiveCount(count)
      } catch (error) {
        if (cancelled) {
          return
        }

        log.error('Failed to load notification status:', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isElectron])

  return {
    isSupported,
    isEnabled,
    settings,
    activeCount,
    showNotification,
    updateSettings,
    clearAll,
    clearNotification,
    refreshActiveCount,
  }
}

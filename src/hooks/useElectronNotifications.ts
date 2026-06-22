'use client'

import { useState, useEffect } from 'react'

import { log } from '../lib/logger'

/**
 * Subset of NotificationPreferences from electron/types/ipc.ts.
 * The full IPC type includes additional fields (taskReminders, dueDateAlerts,
 * achievementNotifications, quietHours*, etc.) that this hook doesn't use.
 * We only track the preferences relevant to task-based notifications.
 */
interface NotificationPreferences {
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

/** Default notification preferences */
const DEFAULT_PREFS: NotificationPreferences = {
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
  preferences: NotificationPreferences | null
  activeCount: number
  showNotification: (
    title: string,
    body: string,
    options?: NotificationShowOptions,
  ) => Promise<void>
  updatePreferences: (
    preferences: Partial<NotificationPreferences>,
  ) => Promise<void>
  clearAll: () => Promise<void>
  clearNotification: (tag: string) => Promise<void>
  refreshActiveCount: () => Promise<void>
}

function normalizePreferences(
  prefs: Partial<NotificationPreferences> & {
    enabled: boolean
    sound: boolean
  },
): NotificationPreferences {
  return {
    enabled: prefs.enabled,
    sound: prefs.sound,
    taskCreated: prefs.taskCreated ?? DEFAULT_PREFS.taskCreated,
    taskCompleted: prefs.taskCompleted ?? DEFAULT_PREFS.taskCompleted,
    taskUpdated: prefs.taskUpdated ?? DEFAULT_PREFS.taskUpdated,
    taskDeleted: prefs.taskDeleted ?? DEFAULT_PREFS.taskDeleted,
  }
}

export function useElectronNotifications(): UseElectronNotificationsReturn {
  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI?.notifications)

  const isSupported = isElectron

  const [isEnabled, setIsEnabled] = useState(false)
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null)
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

  const updatePreferences = async (
    newPreferences: Partial<NotificationPreferences>,
  ) => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      const currentPrefs = preferences ?? DEFAULT_PREFS
      const updatedPrefs = { ...currentPrefs, ...newPreferences }
      const success =
        await window.electronAPI.notifications.updatePreferences(newPreferences)
      if (success) {
        setPreferences(updatedPrefs)
        setIsEnabled(updatedPrefs.enabled)
      }
    } catch (error) {
      log.error('Failed to update notification preferences:', error)
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
        const [enabled, prefs, count] = await Promise.all([
          electronAPI.notifications.isEnabled(),
          electronAPI.notifications.getPreferences(),
          electronAPI.notifications.getActiveCount(),
        ])

        if (cancelled) {
          return
        }

        setIsEnabled(enabled)
        if (prefs) {
          setPreferences(normalizePreferences(prefs))
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
    preferences,
    activeCount,
    showNotification,
    updatePreferences,
    clearAll,
    clearNotification,
    refreshActiveCount,
  }
}

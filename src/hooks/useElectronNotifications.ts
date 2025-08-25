'use client'

import { useState, useEffect, useCallback } from 'react'

interface NotificationPreferences {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
}

interface UseElectronNotificationsReturn {
  isSupported: boolean
  isEnabled: boolean
  preferences: NotificationPreferences | null
  activeCount: number
  showNotification: (
    title: string,
    body: string,
    options?: any,
  ) => Promise<void>
  updatePreferences: (
    preferences: Partial<NotificationPreferences>,
  ) => Promise<void>
  clearAll: () => Promise<void>
  clearNotification: (tag: string) => Promise<void>
  refreshActiveCount: () => Promise<void>
}

export function useElectronNotifications(): UseElectronNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null)
  const [activeCount, setActiveCount] = useState(0)

  // Check if we're in Electron environment
  const isElectron =
    typeof window !== 'undefined' && window.electronAPI?.notifications

  const loadNotificationStatus = useCallback(async () => {
    if (!isElectron) return

    try {
      const [enabled, prefs, count] = await Promise.all([
        window.electronAPI.notifications.isEnabled(),
        window.electronAPI.notifications.getPreferences(),
        window.electronAPI.notifications.getActiveCount(),
      ])

      setIsSupported(true)
      setIsEnabled(enabled)
      setPreferences(prefs)
      setActiveCount(count)
    } catch (error) {
      console.error('Failed to load notification status:', error)
      setIsSupported(false)
    }
  }, [isElectron])

  const showNotification = useCallback(
    async (title: string, body: string, options: any = {}) => {
      if (!isElectron || !isEnabled) return

      try {
        await window.electronAPI.notifications.show(title, body, options)
        // Refresh active count after showing notification
        await refreshActiveCount()
      } catch (error) {
        console.error('Failed to show notification:', error)
        throw error
      }
    },
    [isElectron, isEnabled],
  )

  const updatePreferences = useCallback(
    async (newPreferences: Partial<NotificationPreferences>) => {
      if (!isElectron) return

      try {
        const updatedPrefs =
          await window.electronAPI.notifications.updatePreferences(
            newPreferences,
          )
        if (updatedPrefs) {
          setPreferences(updatedPrefs)
          setIsEnabled(updatedPrefs.enabled)
        }
      } catch (error) {
        console.error('Failed to update notification preferences:', error)
        throw error
      }
    },
    [isElectron],
  )

  const clearAll = useCallback(async () => {
    if (!isElectron) return

    try {
      await window.electronAPI.notifications.clearAll()
      setActiveCount(0)
    } catch (error) {
      console.error('Failed to clear all notifications:', error)
      throw error
    }
  }, [isElectron])

  const clearNotification = useCallback(
    async (tag: string) => {
      if (!isElectron) return

      try {
        await window.electronAPI.notifications.clear(tag)
        // Refresh active count after clearing notification
        await refreshActiveCount()
      } catch (error) {
        console.error('Failed to clear notification:', error)
        throw error
      }
    },
    [isElectron],
  )

  const refreshActiveCount = useCallback(async () => {
    if (!isElectron) return

    try {
      const count = await window.electronAPI.notifications.getActiveCount()
      setActiveCount(count)
    } catch (error) {
      console.error('Failed to refresh active count:', error)
    }
  }, [isElectron])

  useEffect(() => {
    loadNotificationStatus()
  }, [loadNotificationStatus])

  // Set up event listeners for notification updates
  useEffect(() => {
    if (!isElectron) return

    // Listen for todo events to update active count
    const handleTodoCreated = async () => refreshActiveCount()
    const handleTodoUpdated = async () => refreshActiveCount()
    const handleTodoDeleted = async () => refreshActiveCount()

    const cleanupCreated = window.electronAPI.on(
      'todo-created',
      handleTodoCreated,
    )
    const cleanupUpdated = window.electronAPI.on(
      'todo-updated',
      handleTodoUpdated,
    )
    const cleanupDeleted = window.electronAPI.on(
      'todo-deleted',
      handleTodoDeleted,
    )

    return () => {
      if (cleanupCreated) cleanupCreated()
      if (cleanupUpdated) cleanupUpdated()
      if (cleanupDeleted) cleanupDeleted()
    }
  }, [isElectron, refreshActiveCount])

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

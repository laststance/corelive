'use client'

import { useState, useEffect, useCallback } from 'react'

import { log } from '../lib/logger'

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
  const [isEnabled, setIsEnabled] = useState(false)
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null)
  const [activeCount, setActiveCount] = useState(0)

  // Check if we're in Electron environment - derived during render
  const isElectron =
    typeof window !== 'undefined' && window.electronAPI?.notifications

  // isSupported is derived directly from isElectron (not stored in state)
  const isSupported = Boolean(isElectron)

  const loadNotificationStatus = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      const [enabled, prefs, count] = await Promise.all([
        window.electronAPI.notifications.isEnabled(),
        window.electronAPI.notifications.getPreferences(),
        window.electronAPI.notifications.getActiveCount(),
      ])

      setIsEnabled(enabled)
      setPreferences(prefs)
      setActiveCount(count)
    } catch (error) {
      log.error('Failed to load notification status:', error)
    }
  }, [isElectron])

  const showNotification = useCallback(
    async (title: string, body: string, options: any = {}) => {
      if (!isElectron || !isEnabled || !window.electronAPI?.notifications)
        return

      try {
        await window.electronAPI.notifications.show(title, body, options)
        // Refresh active count after showing notification
        await refreshActiveCount()
      } catch (error) {
        log.error('Failed to show notification:', error)
        throw error
      }
    },
    [isElectron, isEnabled],
  )

  const updatePreferences = useCallback(
    async (newPreferences: Partial<NotificationPreferences>) => {
      if (!isElectron || !window.electronAPI?.notifications) return

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
        log.error('Failed to update notification preferences:', error)
        throw error
      }
    },
    [isElectron],
  )

  const clearAll = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      await window.electronAPI.notifications.clearAll()
      setActiveCount(0)
    } catch (error) {
      log.error('Failed to clear all notifications:', error)
      throw error
    }
  }, [isElectron])

  const clearNotification = useCallback(
    async (tag: string) => {
      if (!isElectron || !window.electronAPI?.notifications) return

      try {
        await window.electronAPI.notifications.clear(tag)
        // Refresh active count after clearing notification
        await refreshActiveCount()
      } catch (error) {
        log.error('Failed to clear notification:', error)
        throw error
      }
    },
    [isElectron],
  )

  const refreshActiveCount = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.notifications) return

    try {
      const count = await window.electronAPI.notifications.getActiveCount()
      setActiveCount(count)
    } catch (error) {
      log.error('Failed to refresh active count:', error)
    }
  }, [isElectron])

  // Load notification status on mount - isEnabled comes from async API, not derived from props
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state
    loadNotificationStatus()
  }, [loadNotificationStatus])

  // Set up event listeners for notification updates
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.on) return

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
      // Event cleanup functions may not exist in all implementations
      try {
        if (typeof cleanupCreated === 'function') cleanupCreated()
        if (typeof cleanupUpdated === 'function') cleanupUpdated()
        if (typeof cleanupDeleted === 'function') cleanupDeleted()
      } catch (error) {
        log.warn('Error cleaning up event listeners:', error)
      }
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

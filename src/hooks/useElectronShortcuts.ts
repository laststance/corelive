'use client'

import { useState, useEffect, useCallback } from 'react'

import { log } from '../lib/logger'

interface ShortcutStats {
  totalRegistered: number
  isEnabled: boolean
  platform: string
  shortcuts: Record<string, string>
}

interface UseElectronShortcutsReturn {
  isSupported: boolean
  shortcuts: Record<string, string>
  defaultShortcuts: Record<string, string>
  stats: ShortcutStats | null
  updateShortcuts: (shortcuts: Record<string, string>) => Promise<boolean>
  registerShortcut: (accelerator: string, id: string) => Promise<boolean>
  unregisterShortcut: (id: string) => Promise<boolean>
  isShortcutRegistered: (accelerator: string) => Promise<boolean>
  enableShortcuts: () => Promise<boolean>
  disableShortcuts: () => Promise<boolean>
  refreshStats: () => Promise<void>
}

export function useElectronShortcuts(): UseElectronShortcutsReturn {
  const [isSupported, setIsSupported] = useState(false)
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  const [defaultShortcuts, setDefaultShortcuts] = useState<
    Record<string, string>
  >({})
  const [stats, setStats] = useState<ShortcutStats | null>(null)

  // Check if we're in Electron environment
  const isElectron =
    typeof window !== 'undefined' && window.electronAPI?.shortcuts

  const loadShortcuts = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return

    try {
      const [registered, defaults, currentStats] = await Promise.all([
        window.electronAPI.shortcuts.getRegistered(),
        window.electronAPI.shortcuts.getDefaults(),
        window.electronAPI.shortcuts.getStats(),
      ])

      // Transform ShortcutDefinition[] to Record<string, string>
      const registeredMap: Record<string, string> = {}
      for (const shortcut of registered) {
        registeredMap[shortcut.id] = shortcut.accelerator
      }

      const defaultsMap: Record<string, string> = {}
      for (const shortcut of defaults) {
        defaultsMap[shortcut.id] = shortcut.accelerator
      }

      // Transform stats to expected format
      const formattedStats: ShortcutStats = {
        totalRegistered: currentStats.total,
        isEnabled: currentStats.enabled > 0,
        platform: typeof process !== 'undefined' ? process.platform : 'darwin',
        shortcuts: registeredMap,
      }

      setIsSupported(true)
      setShortcuts(registeredMap)
      setDefaultShortcuts(defaultsMap)
      setStats(formattedStats)
    } catch (error) {
      log.error('Failed to load shortcuts:', error)
      setIsSupported(false)
    }
  }, [isElectron])

  const updateShortcuts = useCallback(
    async (newShortcuts: Record<string, string>) => {
      if (!isElectron || !window.electronAPI?.shortcuts) return false

      try {
        // Update each shortcut individually
        let allSuccess = true
        for (const [id, accelerator] of Object.entries(newShortcuts)) {
          const success = await window.electronAPI.shortcuts.update(
            id,
            accelerator,
          )
          if (!success) {
            allSuccess = false
          }
        }
        if (allSuccess) {
          await loadShortcuts() // Refresh after update
        }
        return allSuccess
      } catch (error) {
        log.error('Failed to update shortcuts:', error)
        return false
      }
    },
    [isElectron, loadShortcuts],
  )

  const registerShortcut = useCallback(
    async (accelerator: string, id: string) => {
      if (!isElectron || !window.electronAPI?.shortcuts) return false

      try {
        // Create ShortcutDefinition object as required by API
        const shortcutDef = {
          id,
          accelerator,
          description: '',
          enabled: true,
          isGlobal: false,
        }
        const success = await window.electronAPI.shortcuts.register(shortcutDef)
        if (success) {
          await loadShortcuts() // Refresh after registration
        }
        return success
      } catch (error) {
        log.error('Failed to register shortcut:', error)
        return false
      }
    },
    [isElectron, loadShortcuts],
  )

  const unregisterShortcut = useCallback(
    async (id: string) => {
      if (!isElectron || !window.electronAPI?.shortcuts) return false

      try {
        const success = await window.electronAPI.shortcuts.unregister(id)
        if (success) {
          await loadShortcuts() // Refresh after unregistration
        }
        return success
      } catch (error) {
        log.error('Failed to unregister shortcut:', error)
        return false
      }
    },
    [isElectron, loadShortcuts],
  )

  const isShortcutRegistered = useCallback(
    async (accelerator: string) => {
      if (!isElectron || !window.electronAPI?.shortcuts) return false

      try {
        return await window.electronAPI.shortcuts.isRegistered(accelerator)
      } catch (error) {
        log.error('Failed to check shortcut registration:', error)
        return false
      }
    },
    [isElectron],
  )

  const enableShortcuts = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      // Enable each shortcut individually
      const shortcutIds = Object.keys(shortcuts)
      let allSuccess = true
      for (const id of shortcutIds) {
        const success = await window.electronAPI.shortcuts.enable(id)
        if (!success) {
          allSuccess = false
        }
      }
      if (allSuccess) {
        await loadShortcuts() // Refresh after enabling
      }
      return allSuccess
    } catch (error) {
      log.error('Failed to enable shortcuts:', error)
      return false
    }
  }, [isElectron, loadShortcuts, shortcuts])

  const disableShortcuts = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      // Disable each shortcut individually
      const shortcutIds = Object.keys(shortcuts)
      let allSuccess = true
      for (const id of shortcutIds) {
        const success = await window.electronAPI.shortcuts.disable(id)
        if (!success) {
          allSuccess = false
        }
      }
      if (allSuccess) {
        await loadShortcuts() // Refresh after disabling
      }
      return allSuccess
    } catch (error) {
      log.error('Failed to disable shortcuts:', error)
      return false
    }
  }, [isElectron, loadShortcuts, shortcuts])

  const refreshStats = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return

    try {
      const currentStats = await window.electronAPI.shortcuts.getStats()
      // Transform to expected format
      const formattedStats: ShortcutStats = {
        totalRegistered: currentStats.total,
        isEnabled: currentStats.enabled > 0,
        platform: typeof process !== 'undefined' ? process.platform : 'darwin',
        shortcuts,
      }
      setStats(formattedStats)
    } catch (error) {
      log.error('Failed to refresh shortcut stats:', error)
    }
  }, [isElectron, shortcuts])

  useEffect(() => {
    loadShortcuts()
  }, [loadShortcuts])

  // Set up event listeners for shortcut events
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.on) return

    // Listen for shortcut events
    const handleNewTask = () => {
      // This could trigger a custom event or callback
    }

    const handleSearch = () => {
      // This could trigger a custom event or callback
    }

    const cleanupNewTask = window.electronAPI.on(
      'shortcut-new-task',
      handleNewTask,
    )
    const cleanupSearch = window.electronAPI.on('shortcut-search', handleSearch)

    return () => {
      // Event cleanup functions may not exist in all implementations
      try {
        if (typeof cleanupNewTask === 'function') cleanupNewTask()
        if (typeof cleanupSearch === 'function') cleanupSearch()
      } catch (error) {
        log.warn('Error cleaning up event listeners:', error)
      }
    }
  }, [isElectron])

  return {
    isSupported,
    shortcuts,
    defaultShortcuts,
    stats,
    updateShortcuts,
    registerShortcut,
    unregisterShortcut,
    isShortcutRegistered,
    enableShortcuts,
    disableShortcuts,
    refreshStats,
  }
}

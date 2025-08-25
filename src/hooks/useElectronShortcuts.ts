'use client'

import { useState, useEffect, useCallback } from 'react'

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
    if (!isElectron) return

    try {
      const [registered, defaults, currentStats] = await Promise.all([
        window.electronAPI.shortcuts.getRegistered(),
        window.electronAPI.shortcuts.getDefaults(),
        window.electronAPI.shortcuts.getStats(),
      ])

      setIsSupported(true)
      setShortcuts(registered)
      setDefaultShortcuts(defaults)
      setStats(currentStats)
    } catch (error) {
      console.error('Failed to load shortcuts:', error)
      setIsSupported(false)
    }
  }, [isElectron])

  const updateShortcuts = useCallback(
    async (newShortcuts: Record<string, string>) => {
      if (!isElectron) return false

      try {
        const success = await window.electronAPI.shortcuts.update(newShortcuts)
        if (success) {
          await loadShortcuts() // Refresh after update
        }
        return success
      } catch (error) {
        console.error('Failed to update shortcuts:', error)
        return false
      }
    },
    [isElectron, loadShortcuts],
  )

  const registerShortcut = useCallback(
    async (accelerator: string, id: string) => {
      if (!isElectron) return false

      try {
        const success = await window.electronAPI.shortcuts.register(
          accelerator,
          id,
        )
        if (success) {
          await loadShortcuts() // Refresh after registration
        }
        return success
      } catch (error) {
        console.error('Failed to register shortcut:', error)
        return false
      }
    },
    [isElectron, loadShortcuts],
  )

  const unregisterShortcut = useCallback(
    async (id: string) => {
      if (!isElectron) return false

      try {
        const success = await window.electronAPI.shortcuts.unregister(id)
        if (success) {
          await loadShortcuts() // Refresh after unregistration
        }
        return success
      } catch (error) {
        console.error('Failed to unregister shortcut:', error)
        return false
      }
    },
    [isElectron, loadShortcuts],
  )

  const isShortcutRegistered = useCallback(
    async (accelerator: string) => {
      if (!isElectron) return false

      try {
        return await window.electronAPI.shortcuts.isRegistered(accelerator)
      } catch (error) {
        console.error('Failed to check shortcut registration:', error)
        return false
      }
    },
    [isElectron],
  )

  const enableShortcuts = useCallback(async () => {
    if (!isElectron) return false

    try {
      const success = await window.electronAPI.shortcuts.enable()
      if (success) {
        await loadShortcuts() // Refresh after enabling
      }
      return success
    } catch (error) {
      console.error('Failed to enable shortcuts:', error)
      return false
    }
  }, [isElectron, loadShortcuts])

  const disableShortcuts = useCallback(async () => {
    if (!isElectron) return false

    try {
      const success = await window.electronAPI.shortcuts.disable()
      if (success) {
        await loadShortcuts() // Refresh after disabling
      }
      return success
    } catch (error) {
      console.error('Failed to disable shortcuts:', error)
      return false
    }
  }, [isElectron, loadShortcuts])

  const refreshStats = useCallback(async () => {
    if (!isElectron) return

    try {
      const currentStats = await window.electronAPI.shortcuts.getStats()
      setStats(currentStats)
    } catch (error) {
      console.error('Failed to refresh shortcut stats:', error)
    }
  }, [isElectron])

  useEffect(() => {
    loadShortcuts()
  }, [loadShortcuts])

  // Set up event listeners for shortcut events
  useEffect(() => {
    if (!isElectron) return

    // Listen for shortcut events
    const handleNewTask = () => {
      console.log('New task shortcut triggered')
      // This could trigger a custom event or callback
    }

    const handleSearch = () => {
      console.log('Search shortcut triggered')
      // This could trigger a custom event or callback
    }

    const cleanupNewTask = window.electronAPI.on(
      'shortcut-new-task',
      handleNewTask,
    )
    const cleanupSearch = window.electronAPI.on('shortcut-search', handleSearch)

    return () => {
      if (cleanupNewTask) cleanupNewTask()
      if (cleanupSearch) cleanupSearch()
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

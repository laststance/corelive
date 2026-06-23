'use client'

import { useState, useEffect } from 'react'

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

function mapShortcutDefinitions(
  definitions: Array<{ id: string; accelerator: string }>,
): Record<string, string> {
  const shortcutMap: Record<string, string> = {}
  for (const shortcut of definitions) {
    shortcutMap[shortcut.id] = shortcut.accelerator
  }
  return shortcutMap
}

export function useElectronShortcuts(): UseElectronShortcutsReturn {
  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI?.shortcuts)

  const [isSupported, setIsSupported] = useState(false)
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  const [defaultShortcuts, setDefaultShortcuts] = useState<
    Record<string, string>
  >({})
  const [stats, setStats] = useState<ShortcutStats | null>(null)

  const loadShortcuts = async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) {
      return
    }

    try {
      const [registered, defaults, currentStats] = await Promise.all([
        window.electronAPI.shortcuts.getRegistered(),
        window.electronAPI.shortcuts.getDefaults(),
        window.electronAPI.shortcuts.getStats(),
      ])

      const registeredMap = mapShortcutDefinitions(registered)
      const defaultsMap = mapShortcutDefinitions(defaults)

      const formattedStats: ShortcutStats = {
        totalRegistered: currentStats.totalRegistered,
        isEnabled: currentStats.isEnabled,
        platform: currentStats.platform,
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
  }

  /**
   * Batch-persist a full shortcut record via the preload bridge, refreshing local
   * state on success. One update() call with the whole map — the bridge rejects
   * positional (id, accelerator) args, so a per-shortcut loop would throw.
   * @param newShortcuts - Full `{ shortcutId: accelerator }` map to persist (`''` unbinds).
   * @returns Resolves to `true` when the batch persisted, `false` on failure or non-Electron.
   * @example await updateShortcuts({ toggleBrainDump: 'Alt+Space' })
   */
  const updateShortcuts = async (newShortcuts: Record<string, string>) => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      const allSuccess = await window.electronAPI.shortcuts.update(newShortcuts)
      if (allSuccess) {
        await loadShortcuts()
      }
      return allSuccess
    } catch (error) {
      log.error('Failed to update shortcuts:', error)
      return false
    }
  }

  const registerShortcut = async (accelerator: string, id: string) => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      const shortcutDef = {
        id,
        accelerator,
        description: '',
        enabled: true,
        isGlobal: false,
      }
      const success = await window.electronAPI.shortcuts.register(shortcutDef)
      if (success) {
        await loadShortcuts()
      }
      return success
    } catch (error) {
      log.error('Failed to register shortcut:', error)
      return false
    }
  }

  const unregisterShortcut = async (id: string) => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      const success = await window.electronAPI.shortcuts.unregister(id)
      if (success) {
        await loadShortcuts()
      }
      return success
    } catch (error) {
      log.error('Failed to unregister shortcut:', error)
      return false
    }
  }

  const isShortcutRegistered = async (accelerator: string) => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      return await window.electronAPI.shortcuts.isRegistered(accelerator)
    } catch (error) {
      log.error('Failed to check shortcut registration:', error)
      return false
    }
  }

  const enableShortcuts = async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      const shortcutIds = Object.keys(shortcuts)
      let allSuccess = true
      for (const id of shortcutIds) {
        const success = await window.electronAPI.shortcuts.enable(id)
        if (!success) {
          allSuccess = false
        }
      }
      if (allSuccess) {
        await loadShortcuts()
      }
      return allSuccess
    } catch (error) {
      log.error('Failed to enable shortcuts:', error)
      return false
    }
  }

  const disableShortcuts = async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return false

    try {
      const shortcutIds = Object.keys(shortcuts)
      let allSuccess = true
      for (const id of shortcutIds) {
        const success = await window.electronAPI.shortcuts.disable(id)
        if (!success) {
          allSuccess = false
        }
      }
      if (allSuccess) {
        await loadShortcuts()
      }
      return allSuccess
    } catch (error) {
      log.error('Failed to disable shortcuts:', error)
      return false
    }
  }

  const refreshStats = async () => {
    if (!isElectron || !window.electronAPI?.shortcuts) return

    try {
      const currentStats = await window.electronAPI.shortcuts.getStats()
      const formattedStats: ShortcutStats = {
        totalRegistered: currentStats.totalRegistered,
        isEnabled: currentStats.isEnabled,
        platform: currentStats.platform,
        shortcuts,
      }
      setStats(formattedStats)
    } catch (error) {
      log.error('Failed to refresh shortcut stats:', error)
    }
  }

  useEffect(() => {
    const electronAPI = window.electronAPI
    if (!isElectron || !electronAPI?.shortcuts) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const [registered, defaults, currentStats] = await Promise.all([
          electronAPI.shortcuts.getRegistered(),
          electronAPI.shortcuts.getDefaults(),
          electronAPI.shortcuts.getStats(),
        ])

        if (cancelled) {
          return
        }

        const registeredMap = mapShortcutDefinitions(registered)
        const defaultsMap = mapShortcutDefinitions(defaults)

        const formattedStats: ShortcutStats = {
          totalRegistered: currentStats.totalRegistered,
          isEnabled: currentStats.isEnabled,
          platform: currentStats.platform,
          shortcuts: registeredMap,
        }

        setIsSupported(true)
        setShortcuts(registeredMap)
        setDefaultShortcuts(defaultsMap)
        setStats(formattedStats)
      } catch (error) {
        if (cancelled) {
          return
        }

        log.error('Failed to load shortcuts:', error)
        setIsSupported(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isElectron])

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.on) return

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

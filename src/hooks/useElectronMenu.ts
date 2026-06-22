import { useEffect, useRef } from 'react'

import { log } from '../lib/logger'

interface MenuAction {
  action: string
  filePath?: string
}

interface UseElectronMenuOptions {
  onNewTask?: () => void
  onFocusSearch?: () => void
  onOpenPreferences?: () => void
  onImportTasks?: (filePath: string) => void
  onExportTasks?: (filePath: string) => void
}

/**
 * Hook to handle Electron menu actions
 */
export function useElectronMenu(options: UseElectronMenuOptions = {}) {
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return
    }

    const handleMenuAction = (menuAction: MenuAction) => {
      const {
        onNewTask,
        onFocusSearch,
        onOpenPreferences,
        onImportTasks,
        onExportTasks,
      } = optionsRef.current

      switch (menuAction.action) {
        case 'new-task':
          onNewTask?.()
          break
        case 'focus-search':
          onFocusSearch?.()
          break
        case 'open-preferences':
          onOpenPreferences?.()
          break
        case 'import-tasks':
          if (menuAction.filePath && onImportTasks) {
            onImportTasks(menuAction.filePath)
          }
          break
        case 'export-tasks':
          if (menuAction.filePath && onExportTasks) {
            onExportTasks(menuAction.filePath)
          }
          break
        default:
          log.warn('Unhandled menu action:', menuAction.action)
      }
    }

    const cleanup = window.electronAPI.on('menu-action', handleMenuAction)

    return cleanup
  }, [])

  const triggerMenuAction = async (action: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.menu) {
      try {
        await window.electronAPI.menu.triggerAction(action)
      } catch (error) {
        log.error('Failed to trigger menu action:', error)
      }
    }
  }

  return {
    triggerMenuAction,
  }
}

// Types are now imported from @/types/electron

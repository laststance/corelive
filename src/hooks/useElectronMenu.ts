import { useEffect, useCallback } from 'react'

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
  const {
    onNewTask,
    onFocusSearch,
    onOpenPreferences,
    onImportTasks,
    onExportTasks,
  } = options

  const handleMenuAction = useCallback(
    (event: any, menuAction: MenuAction) => {
      console.log('Menu action received:', menuAction)

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
          console.warn('Unhandled menu action:', menuAction.action)
      }
    },
    [onNewTask, onFocusSearch, onOpenPreferences, onImportTasks, onExportTasks],
  )

  useEffect(() => {
    // Check if we're in Electron environment
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Listen for menu actions
      const cleanup = window.electronAPI.on('menu-action', handleMenuAction)

      return cleanup
    }
  }, [handleMenuAction])

  // Utility functions to trigger menu actions programmatically
  const triggerMenuAction = useCallback(async (action: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.menu) {
      try {
        await window.electronAPI.menu.triggerAction(action)
      } catch (error) {
        console.error('Failed to trigger menu action:', error)
      }
    }
  }, [])

  return {
    triggerMenuAction,
  }
}

// Types are now imported from @/types/electron

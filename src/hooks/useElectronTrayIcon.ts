import { useCallback, useEffect, useState } from 'react'

type TrayIconState = 'default' | 'active' | 'notification' | 'disabled'

/**
 * Hook for managing Electron tray icon states
 */
export function useElectronTrayIcon() {
  const [currentState, setCurrentState] = useState<TrayIconState>('default')
  const [isAvailable, setIsAvailable] = useState(false)

  // Check if tray API is available
  useEffect(() => {
    const available =
      typeof window !== 'undefined' &&
      window.electronAPI?.system?.setTrayIconState !== undefined
    setIsAvailable(available)
  }, [])

  /**
   * Set tray icon state
   */
  const setIconState = useCallback(
    async (state: TrayIconState): Promise<boolean> => {
      if (!isAvailable) {
        console.warn('Tray icon API not available')
        return false
      }

      try {
        const success =
          await window.electronAPI!.system!.setTrayIconState(state)
        if (success) {
          setCurrentState(state)
        }
        return success
      } catch (error) {
        console.error('Failed to set tray icon state:', error)
        return false
      }
    },
    [isAvailable],
  )

  /**
   * Set tray icon to active state
   */
  const setActive = useCallback(async () => setIconState('active'), [setIconState])

  /**
   * Set tray icon to notification state
   */
  const setNotification = useCallback(
    async () => setIconState('notification'),
    [setIconState],
  )

  /**
   * Set tray icon to disabled state
   */
  const setDisabled = useCallback(
    async () => setIconState('disabled'),
    [setIconState],
  )

  /**
   * Reset tray icon to default state
   */
  const resetToDefault = useCallback(
    async () => setIconState('default'),
    [setIconState],
  )

  /**
   * Set tray tooltip
   */
  const setTooltip = useCallback(
    async (text: string): Promise<void> => {
      if (!isAvailable) {
        console.warn('Tray tooltip API not available')
        return
      }

      try {
        await window.electronAPI!.system!.setTrayTooltip(text)
      } catch (error) {
        console.error('Failed to set tray tooltip:', error)
      }
    },
    [isAvailable],
  )

  /**
   * Update tray icon based on application state
   */
  const updateBasedOnState = useCallback(
    async (appState: {
      hasNotifications?: boolean
      isActive?: boolean
      isDisabled?: boolean
      taskCount?: number
    }) => {
      let newState: TrayIconState = 'default'
      let tooltip = 'CoreLive TODO'

      if (appState.isDisabled) {
        newState = 'disabled'
        tooltip = 'CoreLive TODO (Disabled)'
      } else if (appState.hasNotifications) {
        newState = 'notification'
        tooltip = 'CoreLive TODO (New notifications)'
      } else if (appState.isActive) {
        newState = 'active'
        tooltip = 'CoreLive TODO (Active)'
      }

      // Add task count to tooltip if provided
      if (typeof appState.taskCount === 'number') {
        tooltip += ` - ${appState.taskCount} tasks`
      }

      await Promise.all([setIconState(newState), setTooltip(tooltip)])
    },
    [setIconState, setTooltip],
  )

  return {
    // State
    currentState,
    isAvailable,

    // Actions
    setIconState,
    setActive,
    setNotification,
    setDisabled,
    resetToDefault,
    setTooltip,
    updateBasedOnState,
  }
}

// Types are defined in src/types/electron.d.ts

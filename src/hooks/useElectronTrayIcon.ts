import { useState } from 'react'

import { log } from '../lib/logger'

type TrayIconState = 'default' | 'active' | 'notification' | 'disabled'

/**
 * Hook for managing Electron tray icon states
 */
export function useElectronTrayIcon() {
  const [currentState, setCurrentState] = useState<TrayIconState>('default')
  const [isAvailable] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      window.electronAPI?.system?.setTrayIconState !== undefined
    )
  })

  /**
   * Set tray icon state
   */
  const setIconState = async (state: TrayIconState): Promise<boolean> => {
    if (!isAvailable) {
      log.warn('Tray icon API not available')
      return false
    }

    try {
      const success = await window.electronAPI!.system!.setTrayIconState(state)
      if (success) {
        setCurrentState(state)
      }
      return success
    } catch (error) {
      log.error('Failed to set tray icon state:', error)
      return false
    }
  }

  /**
   * Set tray icon to active state
   */
  const setActive = async () => setIconState('active')

  /**
   * Set tray icon to notification state
   */
  const setNotification = async () => setIconState('notification')

  /**
   * Set tray icon to disabled state
   */
  const setDisabled = async () => setIconState('disabled')

  /**
   * Reset tray icon to default state
   */
  const resetToDefault = async () => setIconState('default')

  /**
   * Set tray tooltip
   */
  const setTooltip = async (text: string): Promise<void> => {
    if (!isAvailable) {
      log.warn('Tray tooltip API not available')
      return
    }

    try {
      await window.electronAPI!.system!.setTrayTooltip(text)
    } catch (error) {
      log.error('Failed to set tray tooltip:', error)
    }
  }

  /**
   * Update tray icon based on application state
   */
  const updateBasedOnState = async (appState: {
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
  }

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

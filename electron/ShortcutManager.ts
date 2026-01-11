/**
 * @fileoverview Global Keyboard Shortcut Manager for Electron
 *
 * Manages system-wide keyboard shortcuts that work even when the app
 * doesn't have focus.
 *
 * @module electron/ShortcutManager
 */

import { BrowserWindow, globalShortcut } from 'electron'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
import type { NotificationManager } from './NotificationManager'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Shortcut configuration */
interface ShortcutConfig {
  enabled?: boolean
  newTask?: string
  showMainWindow?: string
  quit?: string
  minimize?: string
  toggleAlwaysOnTop?: string
  focusFloatingNavigator?: string
  [key: string]: string | boolean | undefined
}

/** Registered shortcut info */
interface RegisteredShortcut {
  accelerator: string
  originalAccelerator?: string
  callback: () => void
  registeredAt: Date
  isAlternative: boolean
}

/** Failed shortcut info */
interface FailedShortcut {
  accelerator: string
  failedAt: Date
  reason: string
}

/** Shortcut registration result */
interface ShortcutRegistrationResult {
  id: string
  success: boolean
}

/** Shortcut statistics */
interface ShortcutStats {
  totalRegistered: number
  isEnabled: boolean
  platform: string
  shortcuts: Record<string, string>
}

// ============================================================================
// Shortcut Manager Class
// ============================================================================

/**
 * Manages global keyboard shortcuts throughout the application.
 */
export class ShortcutManager {
  /** Window manager for window operations */
  private windowManager: WindowManager

  /** Notification manager for user feedback */
  private notificationManager: NotificationManager | null

  /** Config manager for user preferences */
  private configManager: ConfigManager | null

  /** Track registered shortcuts */
  private registeredShortcuts: Map<string, RegisteredShortcut>

  /** Track failed shortcuts */
  private failedShortcuts: Map<string, FailedShortcut> | null

  /** Contextual shortcuts (only when app focused) */
  private contextualShortcuts: Set<string>

  /** Global shortcuts (always active) */
  private globalShortcuts: Set<string>

  /** Whether focus listeners are setup */
  private focusListenersSetup: boolean

  /** Whether shortcuts are enabled */
  private isEnabled: boolean

  /** Current shortcut configuration */
  private shortcuts: ShortcutConfig

  constructor(
    windowManager: WindowManager,
    notificationManager: NotificationManager | null,
    configManager: ConfigManager | null = null,
  ) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager
    this.configManager = configManager

    this.registeredShortcuts = new Map()
    this.failedShortcuts = null

    this.contextualShortcuts = new Set([
      'newTask',
      'minimize',
      'toggleAlwaysOnTop',
      'focusFloatingNavigator',
    ])
    this.globalShortcuts = new Set(['showMainWindow'])
    this.focusListenersSetup = false

    this.isEnabled = true
    this.shortcuts = this.getDefaultShortcuts()

    this.loadSettings()
  }

  /**
   * Loads shortcut settings from user configuration.
   */
  loadSettings(): void {
    if (this.configManager) {
      const shortcutConfig = this.configManager.getSection('shortcuts')
      this.isEnabled = shortcutConfig.enabled !== false
      this.shortcuts = { ...shortcutConfig }
      delete this.shortcuts.enabled
    } else {
      this.isEnabled = true
      this.shortcuts = this.getDefaultShortcuts()
    }
  }

  /**
   * Returns platform-specific default shortcuts.
   */
  getDefaultShortcuts(): ShortcutConfig {
    return {
      newTask: 'Cmd+N',
      showMainWindow: 'Cmd+Shift+T',
      quit: 'Cmd+Q',
      minimize: 'Cmd+M',
      toggleAlwaysOnTop: 'Cmd+Shift+A',
      focusFloatingNavigator: 'Cmd+Shift+N',
    }
  }

  /**
   * Initializes and registers all configured shortcuts.
   */
  initialize(): boolean {
    try {
      log.info('[ShortcutManager] Starting initialization...')
      log.debug('[ShortcutManager] isEnabled:', this.isEnabled)
      log.debug('[ShortcutManager] shortcuts:', this.shortcuts)

      const results = this.registerGlobalShortcuts()

      const successCount = results.filter((r) => r.success).length
      const totalCount = results.length

      log.info(
        `[ShortcutManager] Registered ${successCount}/${totalCount} global shortcuts`,
      )

      results.forEach((result) => {
        const status = result.success ? '✅' : '❌'
        log.debug(`[ShortcutManager] ${status} ${result.id}`)
      })

      if (successCount === totalCount) {
        log.info(
          '[ShortcutManager] All global shortcuts initialized successfully',
        )
        return true
      } else if (successCount > 0) {
        log.warn(
          `[ShortcutManager] Partial success: ${successCount}/${totalCount}`,
        )
        return true
      } else {
        console.error(
          '[ShortcutManager] Failed to initialize any keyboard shortcuts',
        )
        log.error('Failed to initialize any keyboard shortcuts')
        return false
      }
    } catch (error) {
      console.error('[ShortcutManager] Failed to initialize:', error)
      log.error('Failed to initialize keyboard shortcuts:', error)
      return false
    }
  }

  /**
   * Setup focus listeners for dynamic shortcut management.
   */
  setupFocusListeners(): void {
    if (this.focusListenersSetup) {
      log.debug('[ShortcutManager] Focus listeners already setup')
      return
    }

    try {
      const mainWindow = this.windowManager.getMainWindow()
      const floatingWindow = this.windowManager.getFloatingNavigator()

      if (mainWindow) {
        mainWindow.on('focus', () => {
          log.debug(
            '[ShortcutManager] Main window focused - registering contextual shortcuts',
          )
          this.registerContextualShortcuts()
        })

        mainWindow.on('blur', () => {
          log.debug(
            '[ShortcutManager] Main window blurred - unregistering contextual shortcuts',
          )
          this.unregisterContextualShortcuts()
        })

        if (mainWindow.isFocused()) {
          this.registerContextualShortcuts()
        }
      }

      if (floatingWindow) {
        floatingWindow.on('focus', () => {
          log.debug(
            '[ShortcutManager] Floating window focused - registering contextual shortcuts',
          )
          this.registerContextualShortcuts()
        })

        floatingWindow.on('blur', () => {
          log.debug(
            '[ShortcutManager] Floating window blurred - unregistering contextual shortcuts',
          )
          this.unregisterContextualShortcuts()
        })

        if (floatingWindow.isFocused()) {
          this.registerContextualShortcuts()
        }
      }

      this.focusListenersSetup = true
      log.info('[ShortcutManager] Focus listeners setup successfully')
    } catch (error) {
      log.error('[ShortcutManager] Failed to setup focus listeners:', error)
    }
  }

  /**
   * Register global shortcuts that work even when app is not focused.
   */
  registerGlobalShortcuts(): ShortcutRegistrationResult[] {
    const shortcuts = this.shortcuts
    const results: ShortcutRegistrationResult[] = []

    results.push({
      id: 'showMainWindow',
      success: this.registerShortcut(
        shortcuts.showMainWindow as string,
        'showMainWindow',
        () => {
          this.handleShowMainWindow()
        },
      ),
    })

    return results
  }

  /**
   * Register contextual shortcuts that only work when app has focus.
   */
  registerContextualShortcuts(): ShortcutRegistrationResult[] {
    const shortcuts = this.shortcuts
    const results: ShortcutRegistrationResult[] = []

    if (this.registeredShortcuts.has('newTask')) {
      log.debug('[ShortcutManager] Contextual shortcuts already registered')
      return results
    }

    if (this.contextualShortcuts.has('newTask')) {
      results.push({
        id: 'newTask',
        success: this.registerShortcut(
          shortcuts.newTask as string,
          'newTask',
          () => {
            this.handleNewTaskShortcut()
          },
        ),
      })
    }

    if (this.contextualShortcuts.has('minimize')) {
      results.push({
        id: 'minimize',
        success: this.registerShortcut(
          shortcuts.minimize as string,
          'minimize',
          () => {
            this.handleMinimizeWindow()
          },
        ),
      })
    }

    if (this.contextualShortcuts.has('toggleAlwaysOnTop')) {
      results.push({
        id: 'toggleAlwaysOnTop',
        success: this.registerShortcut(
          shortcuts.toggleAlwaysOnTop as string,
          'toggleAlwaysOnTop',
          () => {
            this.handleToggleAlwaysOnTop()
          },
        ),
      })
    }

    if (this.contextualShortcuts.has('focusFloatingNavigator')) {
      results.push({
        id: 'focusFloatingNavigator',
        success: this.registerShortcut(
          shortcuts.focusFloatingNavigator as string,
          'focusFloatingNavigator',
          () => {
            this.handleFocusFloatingNavigator()
          },
        ),
      })
    }

    const successCount = results.filter((r) => r.success).length
    log.debug(
      `[ShortcutManager] Registered ${successCount}/${results.length} contextual shortcuts`,
    )

    return results
  }

  /**
   * Unregister contextual shortcuts while keeping global shortcuts active.
   */
  unregisterContextualShortcuts(): void {
    const unregistered: string[] = []

    for (const id of this.contextualShortcuts) {
      if (this.registeredShortcuts.has(id)) {
        const success = this.unregisterShortcut(id)
        if (success) {
          unregistered.push(id)
        }
      }
    }

    if (unregistered.length > 0) {
      log.debug(
        `[ShortcutManager] Unregistered ${unregistered.length} contextual shortcuts: ${unregistered.join(', ')}`,
      )
    }
  }

  /**
   * Register all shortcuts from configuration with result tracking.
   */
  registerDefaultShortcuts(): ShortcutRegistrationResult[] {
    const globalResults = this.registerGlobalShortcuts()
    const contextualResults = this.registerContextualShortcuts()
    return [...globalResults, ...contextualResults]
  }

  /**
   * Register a single keyboard shortcut with conflict resolution.
   */
  registerShortcut(
    accelerator: string,
    id: string,
    callback: () => void,
  ): boolean {
    log.debug(
      `[registerShortcut] Attempting to register: ${id} = ${accelerator}`,
    )

    if (!this.isEnabled) {
      log.debug(`[registerShortcut] Shortcuts disabled, skipping ${id}`)
      return false
    }

    try {
      if (this.registeredShortcuts.has(id)) {
        log.debug(`[registerShortcut] Unregistering existing shortcut: ${id}`)
        this.unregisterShortcut(id)
      }

      if (globalShortcut.isRegistered(accelerator)) {
        log.warn(
          `[registerShortcut] ${accelerator} already registered by another app`,
        )
        return this.handleShortcutConflict(accelerator, id, callback)
      }

      log.debug(
        `[registerShortcut] Calling globalShortcut.register for ${id}...`,
      )
      const success = globalShortcut.register(accelerator, callback)
      log.debug(`[registerShortcut] globalShortcut.register result: ${success}`)

      if (success) {
        this.registeredShortcuts.set(id, {
          accelerator,
          callback,
          registeredAt: new Date(),
          isAlternative: false,
        })
        log.debug(
          `[registerShortcut] Successfully registered: ${id} = ${accelerator}`,
        )
        return true
      } else {
        log.warn(
          `[registerShortcut] Failed to register: ${id} = ${accelerator}`,
        )
        return this.handleShortcutConflict(accelerator, id, callback)
      }
    } catch (error) {
      log.error(`Error registering shortcut ${accelerator}:`, error)
      return this.handleShortcutConflict(accelerator, id, callback)
    }
  }

  /**
   * Handle shortcut registration conflicts by trying alternatives.
   */
  handleShortcutConflict(
    originalAccelerator: string,
    id: string,
    callback: () => void,
  ): boolean {
    const alternatives = this.generateAlternativeShortcuts(
      originalAccelerator,
      id,
    )

    for (const alternative of alternatives) {
      try {
        if (!globalShortcut.isRegistered(alternative)) {
          const success = globalShortcut.register(alternative, callback)

          if (success) {
            this.registeredShortcuts.set(id, {
              accelerator: alternative,
              originalAccelerator,
              callback,
              registeredAt: new Date(),
              isAlternative: true,
            })

            this.notifyShortcutChange(id, originalAccelerator, alternative)
            return true
          }
        }
      } catch (error) {
        log.warn(`Failed to register alternative ${alternative}:`, error)
      }
    }

    log.warn(
      `Could not register any alternative for ${originalAccelerator} (${id})`,
    )
    this.handleShortcutRegistrationFailure(id, originalAccelerator)

    return false
  }

  /**
   * Generate alternative shortcuts when conflicts occur.
   */
  generateAlternativeShortcuts(
    originalAccelerator: string,
    id: string,
  ): string[] {
    const alternatives: string[] = []

    const parts = originalAccelerator.split('+')
    const key = parts[parts.length - 1] ?? ''
    const modifiers = parts.slice(0, -1)

    const alternativeModifiers = [
      [...modifiers, 'Option'],
      modifiers.map((m) => {
        if (m === 'Ctrl' || m === 'Control') return 'Option'
        if (m === 'Alt') return 'Cmd'
        return m
      }),
      [...modifiers, 'Shift'],
      ['Cmd', 'Alt', 'Shift'],
    ]

    for (const altModifiers of alternativeModifiers) {
      const uniqueModifiers = [...new Set(altModifiers)]
      if (uniqueModifiers.length > 0) {
        alternatives.push(`${uniqueModifiers.join('+')}+${key}`)
      }
    }

    const alternativeKeys = this.getAlternativeKeysForShortcut(id, key)
    for (const altKey of alternativeKeys) {
      alternatives.push(`${modifiers.join('+')}+${altKey}`)
    }

    return [...new Set(alternatives)].filter(
      (alt) => alt !== originalAccelerator,
    )
  }

  /**
   * Get alternative keys for specific shortcut types.
   */
  getAlternativeKeysForShortcut(id: string, _originalKey: string): string[] {
    const alternatives: Record<string, string[]> = {
      newTask: ['Insert', 'Plus', 'T'],
      showMainWindow: ['Home', 'Return', 'Enter'],
      minimize: ['H', 'Down', 'Minus'],
      toggleAlwaysOnTop: ['T', 'Up', 'P'],
      focusFloatingNavigator: ['W', 'Space', 'F'],
    }

    return alternatives[id] || []
  }

  /**
   * Notify user about shortcut changes.
   */
  notifyShortcutChange(
    id: string,
    original: string,
    alternative: string,
  ): void {
    if (this.notificationManager) {
      this.notificationManager.showNotification(
        'Shortcut Changed',
        `${this.getShortcutDisplayName(id)}: ${original} → ${alternative}`,
        { silent: true },
      )
    }
  }

  /**
   * Handle complete shortcut registration failure.
   */
  handleShortcutRegistrationFailure(id: string, accelerator: string): void {
    this.failedShortcuts = this.failedShortcuts || new Map()
    this.failedShortcuts.set(id, {
      accelerator,
      failedAt: new Date(),
      reason: 'conflict_unresolved',
    })

    if (this.notificationManager) {
      this.notificationManager.showNotification(
        'Shortcut Unavailable',
        `Could not register ${this.getShortcutDisplayName(id)} (${accelerator}) - conflicts with system`,
        { silent: true },
      )
    }

    log.warn(`Shortcut ${id} (${accelerator}) disabled due to conflicts`)
  }

  /**
   * Get display name for shortcut ID.
   */
  getShortcutDisplayName(id: string): string {
    const displayNames: Record<string, string> = {
      newTask: 'New Task',
      showMainWindow: 'Show Main Window',
      minimize: 'Minimize',
      toggleAlwaysOnTop: 'Toggle Always On Top',
      focusFloatingNavigator: 'Focus Floating Navigator',
    }

    return displayNames[id] || id
  }

  /**
   * Get failed shortcuts for user reference.
   */
  getFailedShortcuts(): Record<string, FailedShortcut> {
    return this.failedShortcuts ? Object.fromEntries(this.failedShortcuts) : {}
  }

  /**
   * Retry registering failed shortcuts.
   */
  retryFailedShortcuts(): {
    success: boolean
    results?: ShortcutRegistrationResult[]
    message: string
  } {
    if (!this.failedShortcuts || this.failedShortcuts.size === 0) {
      return { success: true, message: 'No failed shortcuts to retry' }
    }

    const retryResults: ShortcutRegistrationResult[] = []

    for (const [id, failedShortcut] of this.failedShortcuts) {
      const handler = this.getHandlerForShortcut(id)
      if (handler) {
        const success = this.registerShortcut(
          failedShortcut.accelerator,
          id,
          handler,
        )

        if (success) {
          this.failedShortcuts.delete(id)
          retryResults.push({ id, success: true })
        } else {
          retryResults.push({ id, success: false })
        }
      }
    }

    return {
      success: retryResults.some((r) => r.success),
      results: retryResults,
      message: `Retried ${retryResults.length} shortcuts, ${retryResults.filter((r) => r.success).length} successful`,
    }
  }

  /**
   * Unregister a keyboard shortcut.
   */
  unregisterShortcut(id: string): boolean {
    const shortcut = this.registeredShortcuts.get(id)
    if (!shortcut) return false

    try {
      globalShortcut.unregister(shortcut.accelerator)
      this.registeredShortcuts.delete(id)
      return true
    } catch (error) {
      log.error(`Error unregistering shortcut ${id}:`, error)
      return false
    }
  }

  /**
   * Handle new task shortcut.
   */
  handleNewTaskShortcut(): void {
    try {
      this.windowManager.restoreFromTray()

      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow?.webContents.send('shortcut-new-task')
      }

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'New Task',
          'Create a new task shortcut activated',
          { silent: true },
        )
      }
    } catch (error) {
      log.error('Error handling new task shortcut:', error)
    }
  }

  /**
   * Handle show main window shortcut.
   */
  handleShowMainWindow(): void {
    try {
      this.windowManager.restoreFromTray()
    } catch (error) {
      log.error('Error handling show main window shortcut:', error)
    }
  }

  /**
   * Handle minimize window shortcut.
   */
  handleMinimizeWindow(): void {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow()

      if (focusedWindow) {
        if (focusedWindow === this.windowManager.getMainWindow()) {
          this.windowManager.minimizeToTray()
        } else if (
          focusedWindow === this.windowManager.getFloatingNavigator()
        ) {
          focusedWindow.minimize()
        }
      }
    } catch (error) {
      log.error('Error handling minimize window shortcut:', error)
    }
  }

  /**
   * Handle toggle always on top shortcut.
   */
  handleToggleAlwaysOnTop(): void {
    try {
      if (this.windowManager.hasFloatingNavigator()) {
        const floatingWindow = this.windowManager.getFloatingNavigator()
        if (floatingWindow) {
          const isAlwaysOnTop = floatingWindow.isAlwaysOnTop()
          floatingWindow.setAlwaysOnTop(!isAlwaysOnTop)

          if (this.notificationManager) {
            this.notificationManager.showNotification(
              'Always On Top',
              !isAlwaysOnTop
                ? 'Floating navigator always on top'
                : 'Always on top disabled',
              { silent: true },
            )
          }
        }
      }
    } catch (error) {
      log.error('Error handling toggle always on top shortcut:', error)
    }
  }

  /**
   * Handle focus floating navigator shortcut.
   */
  handleFocusFloatingNavigator(): void {
    try {
      if (this.windowManager.hasFloatingNavigator()) {
        const floatingWindow = this.windowManager.getFloatingNavigator()
        floatingWindow?.show()
        floatingWindow?.focus()
      } else {
        this.windowManager.showFloatingNavigator()
      }
    } catch (error) {
      log.error('Error handling focus floating navigator shortcut:', error)
    }
  }

  /**
   * Update shortcuts with new configuration.
   */
  updateShortcuts(newShortcuts: ShortcutConfig): boolean {
    try {
      this.unregisterAllShortcuts()

      this.shortcuts = { ...this.shortcuts, ...newShortcuts }

      if (this.configManager) {
        for (const [key, value] of Object.entries(newShortcuts)) {
          this.configManager.set(`shortcuts.${key}`, value)
        }
      }

      for (const [id, accelerator] of Object.entries(this.shortcuts)) {
        if (id !== 'enabled' && typeof accelerator === 'string') {
          const handler = this.getHandlerForShortcut(id)
          if (handler) {
            this.registerShortcut(accelerator, id, handler)
          }
        }
      }

      return true
    } catch (error) {
      log.error('Error updating shortcuts:', error)
      return false
    }
  }

  /**
   * Get handler function for shortcut ID.
   */
  getHandlerForShortcut(id: string): (() => void) | undefined {
    const handlers: Record<string, () => void> = {
      newTask: () => this.handleNewTaskShortcut(),
      showMainWindow: () => this.handleShowMainWindow(),
      minimize: () => this.handleMinimizeWindow(),
      toggleAlwaysOnTop: () => this.handleToggleAlwaysOnTop(),
      focusFloatingNavigator: () => this.handleFocusFloatingNavigator(),
    }

    return handlers[id]
  }

  /**
   * Get currently registered shortcuts.
   */
  getRegisteredShortcuts(): Record<string, string> {
    const shortcuts: Record<string, string> = {}
    for (const [id, shortcut] of this.registeredShortcuts) {
      shortcuts[id] = shortcut.accelerator
    }
    return shortcuts
  }

  /**
   * Get default shortcuts config.
   */
  getDefaultShortcutsConfig(): ShortcutConfig {
    return { ...this.getDefaultShortcuts() }
  }

  /**
   * Get current shortcuts configuration.
   */
  getCurrentShortcuts(): ShortcutConfig {
    return { ...this.shortcuts }
  }

  /**
   * Check if shortcut is registered.
   */
  isShortcutRegistered(accelerator: string): boolean {
    return globalShortcut.isRegistered(accelerator)
  }

  /**
   * Enable shortcuts.
   */
  enable(): void {
    this.isEnabled = true

    if (this.configManager) {
      this.configManager.set('shortcuts.enabled', true)
    }

    this.registerDefaultShortcuts()
  }

  /**
   * Disable shortcuts.
   */
  disable(): void {
    this.isEnabled = false

    if (this.configManager) {
      this.configManager.set('shortcuts.enabled', false)
    }

    this.unregisterAllShortcuts()
  }

  /**
   * Unregister all shortcuts.
   */
  unregisterAllShortcuts(): void {
    try {
      globalShortcut.unregisterAll()
      this.registeredShortcuts.clear()
    } catch (error) {
      log.error('Error unregistering all shortcuts:', error)
    }
  }

  /**
   * Get shortcut statistics.
   */
  getStats(): ShortcutStats {
    return {
      totalRegistered: this.registeredShortcuts.size,
      isEnabled: this.isEnabled,
      platform: process.platform,
      shortcuts: this.getRegisteredShortcuts(),
    }
  }

  /**
   * Cleanup - unregister all shortcuts.
   */
  cleanup(): void {
    this.unregisterAllShortcuts()
  }
}

export default ShortcutManager

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
import { openWebAppInBrowser } from './utils/openWebAppInBrowser'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Shortcut configuration */
interface ShortcutConfig {
  enabled?: boolean
  newTask?: string
  quit?: string
  minimize?: string
  toggleAlwaysOnTop?: string
  focusFloatingNavigator?: string
  toggleFloatingNavigator?: string
  /** BrainDump's global quick-open accelerator; empty string disables it. */
  toggleBrainDump?: string
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

  /** Global shortcuts (always active) - stored for future use */
  // @ts-ignore - Intentionally unused, stored for future features
  private _globalShortcuts: Set<string>

  /** Whether focus listeners are setup */
  private focusListenersSetup: boolean

  /** Whether shortcuts are enabled */
  private isEnabled: boolean

  /** Current shortcut configuration */
  private shortcuts: ShortcutConfig

  /** Stored focus handlers for cleanup */
  private focusHandlers: Map<
    number,
    { focus: () => void; blur: () => void; window: BrowserWindow }
  >

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
    this._globalShortcuts = new Set([
      'toggleFloatingNavigator',
      'toggleBrainDump',
    ])
    this.focusListenersSetup = false
    this.focusHandlers = new Map()

    // Rebind contextual-shortcut focus/blur listeners to EVERY Floating window
    // the WindowManager (re)creates — Cmd+3 reopen, tray, restoreFromTray, or a
    // BrainDump-only startup that opens Floating later. T18 moved these listeners
    // off the retired main window onto Floating; without rebinding, a Floating
    // created after the initial setup would carry no listeners and its contextual
    // shortcuts would never fire. createFloatingNavigator is the single chokepoint.
    this.windowManager.setOnFloatingNavigatorCreated(() => {
      this.setupFocusListeners()
    })

    this.isEnabled = true
    this.shortcuts = this.getDefaultShortcuts()

    this.loadSettings()
  }

  /**
   * Loads shortcut settings from user configuration.
   * Merges with defaults to ensure new shortcuts have their default values.
   */
  loadSettings(): void {
    if (this.configManager) {
      const shortcutConfig = this.configManager.getSection('shortcuts')
      this.isEnabled = shortcutConfig.enabled !== false
      // Merge defaults with loaded config so new shortcuts have default values
      this.shortcuts = { ...this.getDefaultShortcuts(), ...shortcutConfig }
      delete this.shortcuts.enabled
    } else {
      this.isEnabled = true
      this.shortcuts = this.getDefaultShortcuts()
    }
  }

  /**
   * Returns platform-specific default shortcuts.
   *
   * Uses CommandOrControl for cross-platform compatibility:
   * - macOS: Cmd key
   * - Windows/Linux: Ctrl key
   */
  getDefaultShortcuts(): ShortcutConfig {
    // Use CommandOrControl for cross-platform support
    // Electron will translate this to Cmd on macOS and Ctrl on Windows/Linux
    // Note: 'quit' is not included as macOS already handles Cmd+Q natively
    // and we don't have a custom quit handler
    return {
      newTask: 'CommandOrControl+N',
      minimize: 'CommandOrControl+M',
      toggleAlwaysOnTop: 'CommandOrControl+Shift+A',
      focusFloatingNavigator: 'CommandOrControl+Shift+N',
      toggleFloatingNavigator: 'CommandOrControl+3',
      toggleBrainDump: 'Alt+Space',
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

      // Setup focus listeners for contextual shortcuts
      this.setupFocusListeners()

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
    try {
      // Main window retired (T18): contextual shortcuts hang off the Floating
      // navigator's focus/blur only. Floating may be absent here (BrainDump-only
      // startup) or a fresh replacement (closed then reopened via Cmd+3 / tray /
      // restoreFromTray with a new window id), so this runs again on every
      // Floating (re)creation via WindowManager.setOnFloatingNavigatorCreated.
      const floatingWindow = this.windowManager.getFloatingNavigator()

      // No Floating to bind yet. Crucially, do NOT mark setup "done": the T18
      // regression was a sticky boolean that, once set while Floating was absent,
      // blocked the rebind when a Floating window was created later.
      if (!floatingWindow || floatingWindow.isDestroyed()) {
        return
      }

      // Already bound to THIS exact window — idempotent, avoids duplicate
      // focus/blur handlers when setup runs more than once for one window.
      const floatingWindowId = floatingWindow.id
      if (this.focusHandlers.has(floatingWindowId)) {
        log.debug(
          '[ShortcutManager] Focus listeners already bound for current floating window',
        )
        this.focusListenersSetup = true
        return
      }

      // Create named handlers for cleanup
      const focusHandler = (): void => {
        log.debug(
          '[ShortcutManager] Floating window focused - registering contextual shortcuts',
        )
        this.registerContextualShortcuts()
      }

      const blurHandler = (): void => {
        log.debug(
          '[ShortcutManager] Floating window blurred - unregistering contextual shortcuts',
        )
        this.unregisterContextualShortcuts()
      }

      floatingWindow.on('focus', focusHandler)
      floatingWindow.on('blur', blurHandler)

      // Store handlers for cleanup
      this.focusHandlers.set(floatingWindowId, {
        focus: focusHandler,
        blur: blurHandler,
        window: floatingWindow,
      })

      // Drop this window's entry once it is destroyed so the NEXT Floating window
      // (new id) rebinds instead of being mistaken for already-bound. (T18:
      // Floating is recreated on Cmd+3 / tray after a close.)
      floatingWindow.once('closed', () => {
        this.focusHandlers.delete(floatingWindowId)
        // When no Floating remains, the contextual listeners are gone with it.
        if (this.focusHandlers.size === 0) {
          this.focusListenersSetup = false
        }
      })

      // The window may already be focused (created → shown → focused before this
      // runs), so register now instead of waiting for the next focus event.
      if (floatingWindow.isFocused()) {
        this.registerContextualShortcuts()
      }

      this.focusListenersSetup = true
      log.info(
        '[ShortcutManager] Focus listeners setup for the floating window',
      )
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
      id: 'toggleFloatingNavigator',
      success: this.registerShortcut(
        shortcuts.toggleFloatingNavigator as string,
        'toggleFloatingNavigator',
        () => {
          this.handleToggleFloatingNavigator()
        },
      ),
    })

    // Honor the persisted BrainDump accelerator on startup. Empty string is
    // the "disabled" sentinel used by Settings, so skip registration in that
    // case to avoid binding "" as an accelerator.
    const brainDumpAccel = shortcuts.toggleBrainDump
    if (typeof brainDumpAccel === 'string' && brainDumpAccel.trim() !== '') {
      results.push({
        id: 'toggleBrainDump',
        success: this.registerShortcut(
          brainDumpAccel,
          'toggleBrainDump',
          () => {
            this.handleToggleBrainDump()
          },
        ),
      })
    }

    return results
  }

  /**
   * Register contextual shortcuts that only work when app has focus.
   */
  registerContextualShortcuts(): ShortcutRegistrationResult[] {
    const shortcuts = this.shortcuts
    const results: ShortcutRegistrationResult[] = []

    // Check if any contextual shortcut is already registered
    const hasRegisteredContextual = Array.from(this.contextualShortcuts).some(
      (id) => this.registeredShortcuts.has(id),
    )
    if (hasRegisteredContextual) {
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

    // Validate accelerator to prevent crashes from invalid accelerator strings
    if (
      !accelerator ||
      typeof accelerator !== 'string' ||
      accelerator.trim() === ''
    ) {
      log.warn(
        `[registerShortcut] Invalid accelerator for ${id}: "${accelerator}"`,
      )
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
   *
   * Uses cross-platform modifiers (CommandOrControl, Alt) to ensure
   * compatibility across macOS, Windows, and Linux.
   */
  generateAlternativeShortcuts(
    originalAccelerator: string,
    id: string,
  ): string[] {
    const alternatives: string[] = []

    const parts = originalAccelerator.split('+')
    const key = parts[parts.length - 1] ?? ''
    const modifiers = parts.slice(0, -1)

    // Use cross-platform modifier combinations
    const alternativeModifiers = [
      [...modifiers, 'Alt'],
      modifiers.map((m) => {
        if (m === 'Ctrl' || m === 'Control' || m === 'CommandOrControl')
          return 'Alt'
        if (m === 'Alt') return 'CommandOrControl'
        return m
      }),
      [...modifiers, 'Shift'],
      ['CommandOrControl', 'Alt', 'Shift'],
    ]

    for (const altModifiers of alternativeModifiers) {
      const uniqueModifiers = [...new Set(altModifiers)]
      if (uniqueModifiers.length > 0) {
        alternatives.push(`${uniqueModifiers.join('+')}+${key}`)
      }
    }

    const alternativeKeys = this.getAlternativeKeysForShortcut(id, key)
    for (const altKey of alternativeKeys) {
      // Guard against empty modifiers producing invalid accelerators like "+N"
      if (modifiers.length > 0) {
        alternatives.push(`${modifiers.join('+')}+${altKey}`)
      }
    }

    return [...new Set(alternatives)].filter(
      (alt) =>
        alt !== originalAccelerator && alt.length > 0 && !alt.startsWith('+'),
    )
  }

  /**
   * Get alternative keys for specific shortcut types.
   */
  getAlternativeKeysForShortcut(id: string, _originalKey: string): string[] {
    const alternatives: Record<string, string[]> = {
      newTask: ['Insert', 'Plus', 'T'],
      minimize: ['H', 'Down', 'Minus'],
      toggleAlwaysOnTop: ['T', 'Up', 'P'],
      focusFloatingNavigator: ['W', 'Space', 'F'],
      toggleFloatingNavigator: ['F12', 'Backquote', 'F'],
      toggleBrainDump: ['B', 'F13', 'Backquote'],
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
      minimize: 'Minimize',
      toggleAlwaysOnTop: 'Toggle Always On Top',
      focusFloatingNavigator: 'Focus Floating Navigator',
      toggleFloatingNavigator: 'Toggle Floating Navigator',
      toggleBrainDump: 'Toggle BrainDump',
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
      // Surface the Floating quick-navigator, then open the new-task flow in the
      // browser — the full task app is web-only now, and restoreFromTray surfaces
      // Floating (not the hidden main) so a `shortcut-new-task` IPC to main would
      // land in an unsurfaced window. Mirrors the deep-link create-task route
      // (/home?create=true). The renderer listener still lives in
      // useElectronShortcuts but loses its only sender here — orphaned channel
      // tracked for T18/T19 cleanup.
      this.windowManager.restoreFromTray()
      openWebAppInBrowser(
        this.windowManager.getWebAppOrigin(),
        '/home?create=true',
      )

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
   * Handle minimize window shortcut.
   */
  handleMinimizeWindow(): void {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow()

      // Main window retired (T18): only the Floating navigator self-minimizes.
      if (
        focusedWindow &&
        focusedWindow === this.windowManager.getFloatingNavigator()
      ) {
        focusedWindow.minimize()
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
   * Handle toggle floating navigator shortcut (global shortcut).
   * This is a global shortcut that works even when the app is not focused.
   */
  handleToggleFloatingNavigator(): void {
    try {
      this.windowManager.toggleFloatingNavigator()
    } catch (error) {
      log.error('Error handling toggle floating navigator shortcut:', error)
    }
  }

  /**
   * Handler for the optional BrainDump toggle accelerator.
   *
   * Why a try/catch: the user's bound key may collide with another app at
   * runtime, but we don't want a global-shortcut surprise to crash the main
   * loop — log and let the next attempt go through.
   */
  handleToggleBrainDump(): void {
    try {
      this.windowManager.toggleBrainDump()
    } catch (error) {
      log.error('Error handling toggle BrainDump shortcut:', error)
    }
  }

  /**
   * Update shortcuts with new configuration.
   *
   * Only the shortcuts named in `newShortcuts` are re-registered. Contextual
   * shortcuts (`newTask`, `minimize`, etc.) stay scoped to their focus
   * listeners — re-registering them globally would hijack keys like Cmd+N
   * and Cmd+M system-wide.
   *
   * Empty-string accelerators are treated as "disable this shortcut" — the
   * old binding is removed and nothing is registered in its place.
   */
  updateShortcuts(newShortcuts: ShortcutConfig): boolean {
    try {
      const wasEnabled = this.isEnabled
      // Sync isEnabled if provided in newShortcuts
      if (typeof newShortcuts.enabled === 'boolean') {
        this.isEnabled = newShortcuts.enabled
      }

      this.shortcuts = { ...this.shortcuts, ...newShortcuts }

      if (this.configManager) {
        for (const [key, value] of Object.entries(newShortcuts)) {
          this.configManager.set(`shortcuts.${key}`, value)
        }
      }

      // Track whether every requested global accelerator actually bound;
      // a conflicting accelerator silently dropping would otherwise look
      // like success to callers who use this return value to roll back.
      let allRegistered = true

      for (const [id, accelerator] of Object.entries(newShortcuts)) {
        if (id === 'enabled' || typeof accelerator !== 'string') continue

        // Always drop the old registration first so the new accelerator
        // (or empty string = disabled) takes effect.
        if (this.registeredShortcuts.has(id)) {
          this.unregisterShortcut(id)
        }

        if (accelerator === '') continue

        // Contextual shortcuts only ever register on focus; re-registering
        // them here would promote them to global accelerators.
        if (this.contextualShortcuts.has(id)) continue

        const handler = this.getHandlerForShortcut(id)
        if (handler) {
          const ok = this.registerShortcut(accelerator, id, handler)
          allRegistered = allRegistered && ok
        }
      }

      // If toggling enabled false → true with no other accelerator changes,
      // restore the configured global bindings; otherwise the app stays
      // "enabled" with no live accelerators until the user edits settings.
      if (!wasEnabled && this.isEnabled) {
        const results = this.registerGlobalShortcuts()
        const anyFailed = results.some((r) => !r.success)
        allRegistered = allRegistered && !anyFailed
      }

      return allRegistered
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
      minimize: () => this.handleMinimizeWindow(),
      toggleAlwaysOnTop: () => this.handleToggleAlwaysOnTop(),
      focusFloatingNavigator: () => this.handleFocusFloatingNavigator(),
      toggleFloatingNavigator: () => this.handleToggleFloatingNavigator(),
      toggleBrainDump: () => this.handleToggleBrainDump(),
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
   * Only registers global shortcuts immediately.
   * Contextual shortcuts are registered via focus listeners when a window gains focus.
   */
  enable(): void {
    this.isEnabled = true

    if (this.configManager) {
      this.configManager.set('shortcuts.enabled', true)
    }

    // Register global shortcuts (always active)
    this.registerGlobalShortcuts()

    // Setup focus listeners (handles contextual shortcuts on focus/blur)
    this.setupFocusListeners()

    // Only register contextual shortcuts if a window is currently focused.
    // Main window retired (T18): the Floating navigator is the only surface.
    const floatingWindow = this.windowManager.getFloatingNavigator()
    const isWindowFocused =
      floatingWindow &&
      !floatingWindow.isDestroyed() &&
      floatingWindow.isFocused()

    if (isWindowFocused) {
      this.registerContextualShortcuts()
    }
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
   * Unregister all shortcuts managed by this ShortcutManager.
   * Only unregisters shortcuts registered by this instance, not system-wide.
   */
  unregisterAllShortcuts(): void {
    try {
      // Selectively unregister only shortcuts managed by this instance
      // instead of globalShortcut.unregisterAll() which removes all app shortcuts
      for (const [id, shortcut] of this.registeredShortcuts) {
        try {
          globalShortcut.unregister(shortcut.accelerator)
        } catch (error) {
          log.warn(`Failed to unregister shortcut ${id}:`, error)
        }
      }
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
   * Cleanup - unregister all shortcuts and remove focus listeners.
   */
  cleanup(): void {
    this.unregisterAllShortcuts()

    // Remove focus listeners from windows
    for (const [windowId, handlers] of this.focusHandlers) {
      try {
        const { focus, blur, window } = handlers
        if (window && !window.isDestroyed()) {
          window.removeListener('focus', focus)
          window.removeListener('blur', blur)
        }
      } catch (error) {
        log.warn(
          `Failed to remove focus listeners for window ${windowId}:`,
          error,
        )
      }
    }
    this.focusHandlers.clear()
    this.focusListenersSetup = false
  }
}

export default ShortcutManager

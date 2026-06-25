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
import { isNativeBinding, parseNativeBinding } from './nativeBinding'
import {
  createUnavailableNativeShortcutEngine,
  type NativeShortcutEngine,
  type NativeTapStatus,
} from './nativeShortcutEngine'
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
  /**
   * `true` when this binding lives in the native lone-modifier tap rather than
   * Electron's `globalShortcut`, so unregister routes to the right registrar.
   */
  isNative?: boolean
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

  /** Whether shortcuts are enabled */
  private isEnabled: boolean

  /** Current shortcut configuration */
  private shortcuts: ShortcutConfig

  /** Stored focus handlers for cleanup */
  private focusHandlers: Map<
    number,
    { focus: () => void; blur: () => void; window: BrowserWindow }
  >

  /**
   * Native tap for lone-modifier bindings (e.g. Right ⌥ alone) that
   * `globalShortcut` cannot express. Defaults to the unavailable no-op engine so
   * accelerator behavior is unchanged until a real recognizer is injected.
   */
  private nativeEngine: NativeShortcutEngine

  constructor(
    windowManager: WindowManager,
    notificationManager: NotificationManager | null,
    configManager: ConfigManager | null = null,
    nativeEngine: NativeShortcutEngine = createUnavailableNativeShortcutEngine(),
  ) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager
    this.configManager = configManager
    this.nativeEngine = nativeEngine

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
      })

      // The window may already be focused (created → shown → focused before this
      // runs), so register now instead of waiting for the next focus event.
      if (floatingWindow.isFocused()) {
        this.registerContextualShortcuts()
      }

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

    // Route lone-modifier bindings (e.g. 'lone-modifier:rightOption') to the
    // native tap — globalShortcut only binds modifier+key chords and cannot
    // express a single modifier pressed alone.
    if (isNativeBinding(accelerator)) {
      return this.registerNativeShortcut(accelerator, id, callback)
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
   * Registers a lone-modifier binding through the native tap, storing its compat
   * string in `registeredShortcuts` (keyed by id) so conflict read-back and
   * display treat it exactly like an accelerator. Returns `false` for a malformed
   * binding or an unavailable engine, letting the caller degrade to a chord.
   * @param nativeBinding - The `lone-modifier:<id>` compat string.
   * @param id - The shortcut id being bound.
   * @param callback - Invoked when the lone modifier fires.
   * @returns
   * - `true` when the native engine accepted the binding
   * - `false` for a malformed binding or an unavailable engine
   * @example
   * registerNativeShortcut('lone-modifier:rightOption', 'toggleBrainDump', openBrainDump) // => true | false
   */
  private registerNativeShortcut(
    nativeBinding: string,
    id: string,
    callback: () => void,
  ): boolean {
    const binding = parseNativeBinding(nativeBinding)
    if (binding === null) {
      log.warn(
        `[registerNativeShortcut] Malformed lone-modifier binding for ${id}: "${nativeBinding}"`,
      )
      return false
    }

    if (!this.nativeEngine.isAvailable()) {
      log.warn(
        `[registerNativeShortcut] Native tap unavailable; cannot bind ${id} = ${nativeBinding}`,
      )
      return false
    }

    // #125 brick-proof launch latch: a prior launch armed the tap but never
    // confirmed stability (it may have wedged the app during arming). Re-arming
    // would risk re-freezing on every launch — so do NOT register. A lone
    // modifier has no chord equivalent, so the binding is simply left INACTIVE
    // (not "degraded to chord"); the user re-enables it from Settings, which
    // calls reenableNativeTap() to clear the block and re-arm.
    if (this.nativeEngine.isLatchBlocked()) {
      log.warn(
        `[registerNativeShortcut] Latch-blocked; leaving ${id} inactive (prior arming unconfirmed). Manual re-enable required.`,
      )
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Native Shortcut Disabled',
          `${this.getShortcutDisplayName(id)} was disabled after a failed start. Re-enable it in Settings.`,
          { silent: true },
        )
      }
      return false
    }

    // Replace any prior binding under this id (native or accelerator) first.
    if (this.registeredShortcuts.has(id)) {
      this.unregisterShortcut(id)
    }

    const didRegister = this.nativeEngine.register(
      binding.modifier,
      id,
      callback,
    )
    if (didRegister) {
      // Store the compat string verbatim so getRegisteredShortcuts()[id] equals
      // the requested value — applyShortcutRebind's read-back compares against
      // exactly this string to confirm the rebind took.
      this.registeredShortcuts.set(id, {
        accelerator: nativeBinding,
        callback,
        registeredAt: new Date(),
        isAlternative: false,
        isNative: true,
      })
      log.debug(
        `[registerNativeShortcut] Registered native: ${id} = ${nativeBinding}`,
      )
      return true
    }

    log.warn(
      `[registerNativeShortcut] Native engine rejected ${id} = ${nativeBinding}`,
    )
    return false
  }

  /**
   * Reports the native tap's health for the renderer's re-enable affordance
   * (#125) — exposed over the `shortcuts-get-native-tap-status` IPC so the UI
   * can show a "disabled after a failed start — re-enable" control when a prior
   * arming was left unconfirmed.
   * @returns `{ available, latchBlocked }` straight from the engine.
   * @example
   * getNativeTapStatus() // => { available: true, latchBlocked: true }
   */
  getNativeTapStatus(): NativeTapStatus {
    return {
      available: this.nativeEngine.isAvailable(),
      latchBlocked: this.nativeEngine.isLatchBlocked(),
    }
  }

  /**
   * Manual "re-enable" path after a latch-blocked launch (#125): clears the
   * engine's stale-latch block, then re-runs registration so the lone-modifier
   * binding re-arms the tap (a fresh arm overwrites the stale marker, which then
   * clears after the stability window). Triggered by the
   * `shortcuts-reenable-native-tap` IPC from the renderer's re-enable control.
   * @returns the post-re-enable status so the caller can confirm the block cleared.
   * @example
   * reenableNativeTap() // => { available: true, latchBlocked: false }
   */
  reenableNativeTap(): NativeTapStatus {
    this.nativeEngine.clearLatchBlock()
    // Re-run the global registration chokepoint; with the block cleared, the
    // lone-modifier binding now arms the tap instead of being left inactive.
    this.registerGlobalShortcuts()
    return this.getNativeTapStatus()
  }

  /**
   * Revives a tap that may have gone silent across sleep/lock by stopping and
   * restarting it (#125). Wired to `powerMonitor` `resume`/`unlock-screen` in
   * `main.ts`; no-op when the engine is unavailable or has no active binding.
   * @example
   * reArmNativeTap() // after `powerMonitor` 'resume'
   */
  reArmNativeTap(): void {
    this.nativeEngine.reArm()
  }

  /**
   * Drops any in-flight pressed-alone state WITHOUT restarting the tap (#125),
   * so a modifier "held across sleep" can't leave a stale pressed key that
   * mis-fires on wake. Wired to `powerMonitor` `suspend`/`lock-screen`.
   * @example
   * resetNativeTapState() // before `powerMonitor` 'suspend' sleeps the machine
   */
  resetNativeTapState(): void {
    this.nativeEngine.resetPressedState()
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
      // Native lone-modifier binds live in the tap, not globalShortcut — route
      // unregister to the engine that actually holds them.
      if (shortcut.isNative) {
        this.nativeEngine.unregister(id)
      } else {
        globalShortcut.unregister(shortcut.accelerator)
      }
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
          // Native binds aren't in globalShortcut; skip them here and release the
          // whole tap once below via the engine.
          if (!shortcut.isNative) {
            globalShortcut.unregister(shortcut.accelerator)
          }
        } catch (error) {
          log.warn(`Failed to unregister shortcut ${id}:`, error)
        }
      }
      // Tear down every native lone-modifier binding + release the OS-level tap.
      this.nativeEngine.unregisterAll()
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
  }
}

export default ShortcutManager

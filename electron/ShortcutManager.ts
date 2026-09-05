/**
 * @fileoverview Global Keyboard Shortcut Manager for Electron
 *
 * Manages system-wide keyboard shortcuts that work even when the app
 * doesn't have focus.
 *
 * @module electron/ShortcutManager
 */

import { app, BrowserWindow, globalShortcut } from 'electron'

import type { ConfigManager } from './ConfigManager'
import {
  LIVE_EDITOR_SHORTCUT_IDS,
  DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
  DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
  isShortcutOpenSoundSelection,
  SHORTCUT_OPEN_SOUND_CONFIG_PATH,
  SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH,
} from './constants'
import { log } from './logger'
import { isNativeBinding, parseNativeBinding } from './nativeBinding'
import {
  createUnavailableNativeShortcutEngine,
  type NativeShortcutEngine,
  type NativeTapStatus,
} from './nativeShortcutEngine'
import type { NotificationManager } from './NotificationManager'
import {
  ShortcutOpenSoundPlayer,
  type ShortcutOpenSoundController,
} from './ShortcutOpenSoundPlayer'
import { isSameAccelerator } from './utils/isSameAccelerator'
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
  /** LiveEditor's global quick-open accelerator; empty string disables it. */
  toggleLiveEditor?: string
  /** Second, equally-live LiveEditor accelerator; empty string (the default) disables it. */
  toggleLiveEditorSecondary?: string
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

  /** Config manager for user settings */
  private configManager: ConfigManager | null

  /** Track registered shortcuts */
  private registeredShortcuts: Map<string, RegisteredShortcut>

  /** Track failed shortcuts */
  private failedShortcuts: Map<string, FailedShortcut> | null

  /** Contextual shortcuts (only when app focused) */
  private contextualShortcuts: Set<string>

  /** Whether shortcuts are enabled */
  private isEnabled: boolean

  /** Current shortcut configuration */
  private shortcuts: ShortcutConfig

  /** The one app-level focus/blur handler; kept so {@link cleanup} can remove it. */
  private appFocusListener: (() => void) | null = null

  /**
   * Native tap for lone-modifier bindings (e.g. Right ⌥ alone) that
   * `globalShortcut` cannot express. Defaults to the unavailable no-op engine so
   * accelerator behavior is unchanged until a real recognizer is injected.
   */
  private nativeEngine: NativeShortcutEngine

  /** Main-process cue player used after a shortcut toggles LiveEditor. */
  private shortcutOpenSoundController: ShortcutOpenSoundController

  /**
   * One-shot guard so a latch-blocked launch notifies the user ONCE, not on
   * every `registerGlobalShortcuts()` retry while still blocked (codex #6). Reset
   * by {@link reenableNativeTap} so a fresh block after a manual re-enable can
   * notify again.
   */
  private hasNotifiedLatchBlock = false

  /**
   * Creates the shortcut router and its injectable native engines.
   * @param windowManager - Owns LiveEditor visibility.
   * @param notificationManager - Reports registration failures to the user.
   * @param configManager - Supplies accelerators and shortcut-sound preference.
   * @param nativeEngine - Handles lone-modifier key taps Electron cannot register.
   * @param shortcutOpenSoundController - Plays the selected cue after a successful shortcut action.
   * @returns A configured global shortcut manager.
   * @example
   * new ShortcutManager(windowManager, notificationManager, configManager)
   */
  constructor(
    windowManager: WindowManager,
    notificationManager: NotificationManager | null,
    configManager: ConfigManager | null = null,
    nativeEngine: NativeShortcutEngine = createUnavailableNativeShortcutEngine(),
    shortcutOpenSoundController: ShortcutOpenSoundController = new ShortcutOpenSoundPlayer(),
  ) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager
    this.configManager = configManager
    this.nativeEngine = nativeEngine
    this.shortcutOpenSoundController = shortcutOpenSoundController

    this.registeredShortcuts = new Map()
    this.failedShortcuts = null

    this.contextualShortcuts = new Set(['newTask', 'minimize'])
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
      toggleLiveEditor: 'Alt+Space',
      // Second LiveEditor slot ships unbound — an opt-in extra key, not a
      // preset that would silently claim a chord the user never chose.
      toggleLiveEditorSecondary: '',
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

      // Setup focus listeners for contextual shortcuts, then resolve the CURRENT
      // focus: the startup panel or login window may already be focused, and no
      // focus event will fire for it.
      this.setupFocusListeners()
      this.syncContextualShortcuts()

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
   * Registers the app-level focus/blur listeners once; both resolve state via {@link syncContextualShortcuts}.
   * Called by {@link initialize} and {@link enable}; idempotent so neither call can double-bind.
   * @returns Nothing; the listener is kept in `appFocusListener` for {@link cleanup}.
   * @example
   * shortcutManager.setupFocusListeners()
   */
  setupFocusListeners(): void {
    // Already bound — a second setup must not add a second pair of listeners.
    if (this.appFocusListener) return
    // `browser-window-focus` / `browser-window-blur` are not ordered on a
    // window-to-window switch, so both events run the same state resolver.
    const listener = (): void => this.syncContextualShortcuts()
    app.on('browser-window-focus', listener)
    app.on('browser-window-blur', listener)
    this.appFocusListener = listener
  }

  /**
   * Binds contextual shortcuts while any CoreLive window is focused and releases them otherwise.
   * Runs on every app focus/blur event and once from {@link initialize} / {@link enable}; no-op while shortcuts are disabled.
   * @returns Nothing; `registeredShortcuts` stays the only registration truth.
   * @example
   * shortcutManager.syncContextualShortcuts() // focused window → Cmd+N / Cmd+M bound
   */
  private syncContextualShortcuts(): void {
    if (!this.isEnabled) return
    // `registeredShortcuts` is the only registration truth: register skips
    // already-bound ids and unregister only touches bound ones.
    if (BrowserWindow.getFocusedWindow()) {
      this.registerContextualShortcuts()
    } else {
      this.unregisterContextualShortcuts()
    }
  }

  /**
   * Register global shortcuts that work even when app is not focused.
   */
  registerGlobalShortcuts(): ShortcutRegistrationResult[] {
    const shortcuts = this.shortcuts
    const results: ShortcutRegistrationResult[] = []

    // Honor the persisted LiveEditor accelerators on startup — both slots, same
    // handler. Empty string is the "disabled" sentinel used by Settings (and the
    // default for the second slot), so skip those to avoid binding "".
    for (const id of LIVE_EDITOR_SHORTCUT_IDS) {
      const liveEditorAccel = shortcuts[id]
      if (
        typeof liveEditorAccel !== 'string' ||
        liveEditorAccel.trim() === ''
      ) {
        continue
      }
      results.push({
        id,
        success: this.registerShortcut(liveEditorAccel, id, () => {
          this.handleToggleLiveEditor()
        }),
      })
    }

    return results
  }

  /**
   * Binds Cmd+N / Cmd+M while any CoreLive window (LiveEditor, Settings, login) is focused; already-bound ids are skipped.
   * Cmd+N opens the browser `/live-editor` even from the panel or Settings — intended: the browser page is the task-creation surface.
   * @returns One registration result per contextual shortcut attempted.
   * @example
   * shortcutManager.registerContextualShortcuts() // => [{ id: 'newTask', success: true }, ...]
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
   * registerNativeShortcut('lone-modifier:rightOption', 'toggleLiveEditor', openLiveEditor) // => true | false
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
    // (not "degraded to chord"). The block lasts the whole session: its only
    // clear is {@link ShortcutManager.reenableNativeTap}, kept as the re-arm
    // entry point but with no renderer caller since the Settings control and
    // its IPC channel were retired — so in practice a restart is the reset.
    if (this.nativeEngine.isLatchBlocked()) {
      log.warn(
        `[registerNativeShortcut] Latch-blocked; leaving ${id} inactive (prior arming unconfirmed). Manual re-enable required.`,
      )
      // Notify ONCE per block (codex #6): registerGlobalShortcuts() can run many
      // times while still latch-blocked (startup, rebinds), and an OS toast on
      // each would spam the user.
      if (this.notificationManager && !this.hasNotifiedLatchBlock) {
        this.hasNotifiedLatchBlock = true
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
   * (#125) — was exposed over IPC so the UI could show a "disabled after a
   * failed start — re-enable" control when a prior arming was left
   * unconfirmed; the IPC channel is gone (no renderer caller), method kept
   * for {@link reenableNativeTap}'s return value.
   * @returns `{ available, latchBlocked, active }` — engine health plus whether a
   *   lone-modifier binding is actually LIVE right now. `active` reads the engine's
   *   RUNTIME state (codex review), not registration: after a failed re-enable/
   *   re-arm the binding stays registered while the tap is down, and the renderer
   *   must keep the recovery affordance, so registration intent is not the truth.
   * @example
   * getNativeTapStatus() // => { available: true, latchBlocked: true, active: false }
   */
  getNativeTapStatus(): NativeTapStatus {
    return {
      available: this.nativeEngine.isAvailable(),
      latchBlocked: this.nativeEngine.isLatchBlocked(),
      active: this.nativeEngine.isActive(),
    }
  }

  /**
   * Manual "re-enable" path after a latch-blocked launch (#125): clears the
   * engine's stale-latch block, then re-runs registration so the lone-modifier
   * binding re-arms the tap (a fresh arm overwrites the stale marker, which then
   * clears after the stability window). Was triggered by the renderer's
   * re-enable control via IPC; that channel is gone (no renderer caller).
   * @returns the post-re-enable status so the caller can confirm the block cleared.
   * @example
   * reenableNativeTap() // => { available: true, latchBlocked: false }
   */
  reenableNativeTap(): NativeTapStatus {
    // Re-arm the one-shot toast guard so a fresh block (re-arm fails again) can
    // re-notify the user (codex #6).
    this.hasNotifiedLatchBlock = false
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
      toggleLiveEditor: ['B', 'F13', 'Backquote'],
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
      toggleLiveEditor: 'Toggle LiveEditor',
      toggleLiveEditorSecondary: 'Toggle LiveEditor (second key)',
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
   * Opens the browser `/live-editor` (the only task-creation surface) on Cmd+N; fired by the contextual binding.
   * @returns Nothing; failures are logged, never thrown into the shortcut callback.
   * @example
   * shortcutManager.handleNewTaskShortcut()
   */
  handleNewTaskShortcut(): void {
    try {
      // Browser only: surfacing the LiveEditor panel too would open the same
      // note in two places at once. Mirrors the deep-link create-task route.
      openWebAppInBrowser(this.windowManager.getWebAppOrigin(), '/live-editor')

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'New Task',
          'Opening LiveEditor',
          { silent: true },
        )
      }
    } catch (error) {
      log.error('Error handling new task shortcut:', error)
    }
  }

  /**
   * Minimizes whichever CoreLive window is focused on Cmd+M; fired by the contextual binding.
   * @returns Nothing; a no-op when no CoreLive window has focus.
   * @example
   * shortcutManager.handleMinimizeWindow()
   */
  handleMinimizeWindow(): void {
    try {
      BrowserWindow.getFocusedWindow()?.minimize()
    } catch (error) {
      log.error('Error handling minimize window shortcut:', error)
    }
  }

  /** Handles either LiveEditor toggle accelerator, deferring open audio until reveal and playing close audio immediately.
   * @returns Nothing.
   * @example
   * this.handleToggleLiveEditor()
   */
  handleToggleLiveEditor(): void {
    try {
      const didRequestOpen = this.windowManager.toggleLiveEditor(() => {
        // Window reveal finishes later, after this method's outer error guard has returned.
        try {
          this.playShortcutOpenSoundIfEnabled()
        } catch (error) {
          log.error('Error playing shortcut opening sound:', error)
        }
      })

      // Closing is synchronous, so acknowledge it as soon as the window is hidden.
      if (!didRequestOpen) this.playShortcutOpenSoundIfEnabled()
    } catch (error) {
      log.error('Error handling toggle LiveEditor shortcut:', error)
    }
  }

  /**
   * Plays the shortcut cue only while the persisted desktop setting remains enabled.
   * @returns Nothing.
   * @example
   * this.playShortcutOpenSoundIfEnabled()
   */
  private playShortcutOpenSoundIfEnabled(): void {
    // Production always has ConfigManager; a missing seam stays silent in isolated tests.
    if (!this.configManager) return

    const isEnabled = this.configManager.get<unknown>(
      SHORTCUT_OPEN_SOUND_CONFIG_PATH,
      DEFAULT_SHORTCUT_OPEN_SOUND_ENABLED,
    )
    // Only an explicit boolean true may cross the native-audio boundary.
    if (isEnabled !== true) return

    const savedSelection = this.configManager.get<unknown>(
      SHORTCUT_OPEN_SOUND_SELECTION_CONFIG_PATH,
      DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
    )
    const selection = isShortcutOpenSoundSelection(savedSelection)
      ? savedSelection
      : DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION
    this.shortcutOpenSoundController.play(selection)
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
   *
   * Rejects (without applying anything) a batch that would leave both LiveEditor
   * toggle slots on one accelerator.
   */
  updateShortcuts(newShortcuts: ShortcutConfig): boolean {
    try {
      // Guard the merged result, not the payload: the generic Shortcut Settings
      // screen submits EVERY registered id — including the second LiveEditor slot,
      // which has no row there — so a user rebinding the visible "Toggle
      // LiveEditor" row onto the second slot's key would otherwise land both on
      // one accelerator. Both registrars mishandle that: a chord trips
      // handleShortcutConflict (silent fallback substitution), and the native tap
      // keys bindings by keycode, so the second bind orphans the first. Checking
      // the merge (rather than payload-vs-current) still allows swapping the two.
      const [primarySlotId, secondarySlotId] = LIVE_EDITOR_SHORTCUT_IDS
      const mergedShortcuts = { ...this.shortcuts, ...newShortcuts }
      const mergedPrimary = mergedShortcuts[primarySlotId]
      if (isSameAccelerator(mergedPrimary, mergedShortcuts[secondarySlotId])) {
        log.warn(
          `Rejected shortcut update: both LiveEditor toggle slots would bind ${mergedPrimary}`,
        )
        return false
      }

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

      // Pass 1 — drop the old registration of EVERY id in the batch before
      // registering any of them, so the new accelerator (or empty string =
      // disabled) takes effect. Doing this per-id inside the register loop made
      // a batch collide with itself: swapping two accelerators would still find
      // the second id holding the first's new key, and `registerShortcut` reads
      // that as an outside conflict and silently substitutes a fallback.
      for (const [id, accelerator] of Object.entries(newShortcuts)) {
        if (id === 'enabled' || typeof accelerator !== 'string') continue

        // A full settings save carries EVERY id, contextual ones included, and
        // pass 2 deliberately never re-registers those (they belong to a focus
        // listener). Dropping one whose accelerator did not change would kill it
        // until the next blur→focus. One that DID change still has to go, or the
        // stale accelerator keeps firing until then.
        //
        // "Unchanged" has to accept BOTH sides of a conflict substitution: the
        // settings screen submits what is live (`accelerator`), while a caller
        // reading persisted config submits what was asked for
        // (`originalAccelerator`). Comparing against only one of them unregisters
        // the shortcut on every save made by the other caller.
        const registration = this.registeredShortcuts.get(id)
        if (
          this.contextualShortcuts.has(id) &&
          (isSameAccelerator(accelerator, registration?.accelerator) ||
            isSameAccelerator(accelerator, registration?.originalAccelerator))
        ) {
          continue
        }

        if (this.registeredShortcuts.has(id)) {
          this.unregisterShortcut(id)
        }
      }

      // Pass 2 — bind the new accelerators.
      for (const [id, accelerator] of Object.entries(newShortcuts)) {
        if (id === 'enabled' || typeof accelerator !== 'string') continue

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
      // Both LiveEditor slots route to the same toggle.
      toggleLiveEditor: () => this.handleToggleLiveEditor(),
      toggleLiveEditorSecondary: () => this.handleToggleLiveEditor(),
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
   * Get current shortcuts configuration.
   */
  getCurrentShortcuts(): ShortcutConfig {
    return { ...this.shortcuts }
  }

  /**
   * Turns shortcuts on: global ones bind now, contextual ones bind now only if a CoreLive window is already focused.
   * @example
   * shortcutManager.enable()
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

    // A window may already be focused (e.g. re-enable from Settings), so
    // resolve the contextual state now instead of waiting for the next event.
    this.syncContextualShortcuts()
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
   * Unregisters every shortcut and detaches the app focus listeners; called on app quit.
   * @example
   * shortcutManager.cleanup()
   */
  cleanup(): void {
    this.unregisterAllShortcuts()
    this.shortcutOpenSoundController.cleanup()

    // Detach the exact handler we added so no other app listener is touched.
    if (this.appFocusListener) {
      app.removeListener('browser-window-focus', this.appFocusListener)
      app.removeListener('browser-window-blur', this.appFocusListener)
      this.appFocusListener = null
    }
  }
}

export default ShortcutManager

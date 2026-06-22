/**
 * @fileoverview Window Manager for Electron Application
 *
 * This module manages all application windows (BrowserWindow instances).
 * In Electron, windows are the primary UI containers that display web content.
 *
 * Key responsibilities:
 * - Create and configure windows with proper security settings
 * - Manage window lifecycle (show, hide, close)
 * - Coordinate with WindowStateManager for position persistence
 * - Handle window-specific events and behaviors
 * - Support multiple window types (main, floating)
 *
 * @module electron/WindowManager
 */

import path from 'path'
import { fileURLToPath } from 'url'

import { BrowserWindow, dialog, screen } from 'electron'

import type { ConfigManager } from './ConfigManager'
import {
  AUTH_PATHNAMES,
  ERR_ABORTED,
  FLOATING_LOAD_MAX_RETRIES,
  FLOATING_LOAD_RETRY_BASE_MS,
  SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
  SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
  SETTINGS_POPOVER_MAX_HEIGHT_PX,
  SETTINGS_POPOVER_MAX_WIDTH_PX,
  SETTINGS_POPOVER_MIN_HEIGHT_PX,
  SETTINGS_POPOVER_MIN_WIDTH_PX,
  SETTINGS_POPOVER_RESIZE_DEBOUNCE_MS,
} from './constants'
import { log } from './logger'
import { clampDimension } from './utils/clampDimension'
import { isDevToolsEnabled } from './utils/debugMode'
import type {
  WindowStateManager,
  WindowOptions,
  WindowType,
} from './WindowStateManager'

// Resolve __dirname for ES modules
// @ts-ignore - import.meta.url is valid at runtime (electron-vite handles this)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Type Definitions
// ============================================================================

/** Floating window configuration */
interface FloatingConfig {
  frame: boolean
  alwaysOnTop: boolean
  resizable: boolean
  visibleOnAllWorkspaces?: boolean
}

/**
 * The auxiliary panels that can be requested at Electron startup. Derived from
 * `WindowType` (the source of truth) so adding a panel type there flows here
 * automatically; excludes `'main'` since the main window is handled separately.
 */
type StartupPanelKind = Exclude<WindowType, 'main'>

// ============================================================================
// Window Manager Class
// ============================================================================

/**
 * Manages all application windows and their lifecycle.
 *
 * Why a dedicated manager?
 * - Centralizes window creation logic (DRY principle)
 * - Ensures consistent security settings across all windows
 * - Coordinates state persistence with WindowStateManager
 * - Provides clean API for window operations
 * - Handles platform-specific window behaviors
 */
export class WindowManager {
  /** Always-on-top utility window */
  private floatingNavigator: BrowserWindow | null

  // DT7 Floating load-failure recovery state. The Floating window is the
  // signed-out front door, so a main-frame load failure must self-heal (retry +
  // native dialog) instead of leaving a dead window. Reset per fresh window in
  // `createFloatingNavigator`.
  /** Retry count for the current never-succeeded Floating load. */
  private floatingLoadFailAttempts: number = 0
  /** True while a retry timer is queued or the recovery dialog is open. */
  private floatingLoadRecoveryPending: boolean = false
  /** Latched on the first successful Floating load; after it the renderer owns errors. */
  private floatingHasLoadedOnce: boolean = false
  /**
   * True between a real main-frame `did-fail-load` and the `did-finish-load`
   * Chromium then fires for the error page it commits. Lets the finish handler
   * tell an error-page settle (which must NOT latch `floatingHasLoadedOnce`, or
   * it silences DT7 recovery and strands a blank window) from a genuine app load.
   */
  private floatingLoadFailedPendingFinish: boolean = false

  /** Frameless transparent BrainDump Note panel */
  private brainDumpWindow: BrowserWindow | null

  /** Settings window */
  private settingsWindow: BrowserWindow | null

  /** Whether running in development mode */
  private isDev: boolean

  /** URL of the Next.js server */
  private serverUrl: string | null

  /** Manages user preferences */
  private configManager: ConfigManager | null

  /** Handles window state persistence */
  private windowStateManager: WindowStateManager | null

  /** Fallback mode for when window minimize to tray fails */
  private trayFallbackMode: boolean

  /** Callback to get tray icon bounds for popover positioning */
  private getTrayBoundsProvider: (() => Electron.Rectangle | null) | null

  /**
   * Notified right after a Floating navigator window is (re)created, so
   * dependents can rebind to the fresh BrowserWindow. ShortcutManager uses it to
   * re-attach its focus/blur contextual-shortcut listeners: T18 retired the main
   * window and moved those listeners onto Floating, but Floating can be absent at
   * setup (BrainDump-only startup) or replaced (closed then reopened via Cmd+3 /
   * tray / restoreFromTray with a NEW window id). Without this hook such a
   * later-created Floating would carry no listeners and its contextual shortcuts
   * would never fire. `createFloatingNavigator` is their single chokepoint, so
   * firing here covers every creation path at once.
   */
  private onFloatingNavigatorCreated: (() => void) | null

  /**
   * Panels that were redirected to an auth page (or failed to load) at startup,
   * so the main window was surfaced in their place. Exposed only through
   * `getStartupAuthFallbacks()` as test-observable evidence of the
   * suppress-and-surface decision; no production code branches on it (the pill
   * shows a static "Opening CoreLive…"). Durable for the session — the entry
   * stays even after the panel is re-shown post-login, since it records a fact
   * about this boot.
   */
  private startupAuthFallbacks: Set<StartupPanelKind>

  /** 500 ms blur-guard timer set by `will-resize` to keep the window open during drag. */
  private settingsResizeDebounceTimer: ReturnType<typeof setTimeout> | null

  /** 200 ms debounce timer for persisting the Settings popover size after `resize`. */
  private settingsPersistDebounceTimer: ReturnType<typeof setTimeout> | null

  /**
   * True while the user is manually dragging the Settings popover edge.
   * Prevents the blur→hide handler from closing the window mid-resize.
   */
  private settingsWindowIsResizing: boolean

  /**
   * Creates a new WindowManager instance.
   *
   * @param serverUrl - URL of the Next.js server (null uses default)
   * @param configManager - Manages user preferences
   * @param windowStateManager - Handles window state persistence
   */
  constructor(
    serverUrl: string | null = null,
    configManager: ConfigManager | null = null,
    windowStateManager: WindowStateManager | null = null,
  ) {
    this.floatingNavigator = null
    this.brainDumpWindow = null
    this.settingsWindow = null
    this.isDev = process.env.NODE_ENV === 'development'
    this.serverUrl = serverUrl
    this.configManager = configManager
    this.windowStateManager = windowStateManager
    this.trayFallbackMode = false
    this.getTrayBoundsProvider = null
    this.onFloatingNavigatorCreated = null
    this.startupAuthFallbacks = new Set()
    this.settingsResizeDebounceTimer = null
    this.settingsPersistDebounceTimer = null
    this.settingsWindowIsResizing = false
  }

  /**
   * Sets the callback used to retrieve tray icon bounds for popover positioning.
   *
   * @param provider - Callback returning tray icon rectangle or null
   * @example
   * windowManager.setTrayBoundsProvider(() => trayManager.getTrayBounds())
   */
  setTrayBoundsProvider(provider: () => Electron.Rectangle | null): void {
    this.getTrayBoundsProvider = provider
  }

  /**
   * Registers a callback fired right after each Floating navigator (re)creation,
   * letting dependents rebind to the new BrowserWindow — e.g. ShortcutManager
   * re-attaching its contextual-shortcut focus/blur listeners. Setter injection
   * (not a constructor arg) because ShortcutManager is built after WindowManager
   * in `deferredInit`.
   *
   * @param handler - Invoked after `createFloatingNavigator` fully wires the window, or null to clear.
   * @example
   * windowManager.setOnFloatingNavigatorCreated(() => shortcutManager.setupFocusListeners())
   */
  setOnFloatingNavigatorCreated(handler: (() => void) | null): void {
    this.onFloatingNavigatorCreated = handler
  }

  /**
   * Applies the macOS Spaces-following behavior to a floating utility window.
   *
   * Electron exposes this through `setVisibleOnAllWorkspaces`, but it is only
   * meaningful on macOS for CoreLive's use case. The guard keeps Linux/Windows
   * behavior unchanged while still allowing the setting to be stored.
   *
   * @param browserWindow - Floating panel to update, if it currently exists
   * @param enabled - true keeps the window visible across Spaces/desktops
   * @example
   * this.applyVisibleOnAllWorkspaces(this.floatingNavigator, true)
   */
  private applyVisibleOnAllWorkspaces(
    browserWindow: BrowserWindow | null,
    enabled: boolean,
  ): void {
    if (process.platform !== 'darwin') return
    if (!browserWindow || browserWindow.isDestroyed()) return

    // Include fullscreen Spaces so the panel behaves like Raycast Notes during
    // Mission Control desktop changes, not only normal desktop switches.
    browserWindow.setVisibleOnAllWorkspaces(enabled, {
      visibleOnFullScreen: enabled,
      skipTransformProcessType: true,
    })
  }

  /**
   * Applies the always-on-top flag to a live panel window (no-op when the window
   * is absent or destroyed). Sibling of {@link applyVisibleOnAllWorkspaces}.
   * @param browserWindow - Target panel window, or null when not open.
   * @param enabled - true pins the window above others; false unpins it.
   */
  private applyAlwaysOnTop(
    browserWindow: BrowserWindow | null,
    enabled: boolean,
  ): void {
    if (!browserWindow || browserWindow.isDestroyed()) return
    // setAlwaysOnTop defaults to the 'floating' window level when enabled —
    // the correct level for these utility panels.
    browserWindow.setAlwaysOnTop(enabled)
  }

  /**
   * Reads whether both floating panels should follow macOS Spaces.
   *
   * The Settings UI presents this as a single switch, while the config stores
   * values beside each window's own settings so future per-window controls can
   * split cleanly without a migration.
   *
   * @returns true only when both Floating Navigator and BrainDump are enabled
   * @example
   * const enabled = windowManager.getFloatingPanelsVisibleOnAllWorkspaces()
   */
  getFloatingPanelsVisibleOnAllWorkspaces(): boolean {
    const floatingEnabled =
      this.configManager?.get<boolean>(
        'window.floating.visibleOnAllWorkspaces',
        false,
      ) ?? false
    const brainDumpEnabled =
      this.configManager?.get<boolean>(
        'braindump.visibleOnAllWorkspaces',
        floatingEnabled,
      ) ?? floatingEnabled

    return Boolean(floatingEnabled && brainDumpEnabled)
  }

  /**
   * Persists and applies the "show on all Mac desktops" setting.
   *
   * Called from Settings via IPC. Existing windows update immediately; windows
   * created later read the persisted config during creation.
   *
   * @param enabled - true keeps both floating panels visible across Spaces
   * @returns The setting value that was applied
   * @example
   * windowManager.setFloatingPanelsVisibleOnAllWorkspaces(true)
   */
  setFloatingPanelsVisibleOnAllWorkspaces(enabled: boolean): boolean {
    if (this.configManager) {
      this.configManager.update({
        'window.floating.visibleOnAllWorkspaces': enabled,
        'braindump.visibleOnAllWorkspaces': enabled,
      })
    }

    this.applyVisibleOnAllWorkspaces(this.floatingNavigator, enabled)
    this.applyVisibleOnAllWorkspaces(this.brainDumpWindow, enabled)

    return enabled
  }

  /**
   * Reads BrainDump's always-on-top preference (config-backed, default off).
   * BrainDump has no in-window pin control, so config is the single source of truth.
   * @returns true when the BrainDump panel is pinned above other windows.
   */
  getBrainDumpAlwaysOnTop(): boolean {
    return (
      this.configManager?.get<boolean>('braindump.alwaysOnTop', false) ?? false
    )
  }

  /**
   * Persists + applies BrainDump's always-on-top preference.
   * @param enabled - true pins BrainDump above other windows; false unpins it.
   * @returns The applied value (echoed for optimistic-UI confirmation).
   */
  setBrainDumpAlwaysOnTop(enabled: boolean): boolean {
    if (this.configManager) {
      this.configManager.set('braindump.alwaysOnTop', enabled)
    }
    this.applyAlwaysOnTop(this.brainDumpWindow, enabled)
    return enabled
  }

  /**
   * Reads FloatingNavigator's effective always-on-top state.
   * @returns
   * - the live window's `isAlwaysOnTop()` when the panel is open
   * - else the persisted WindowStateManager value (what relaunch will re-apply)
   * - else the config default (true)
   */
  getFloatingNavigatorAlwaysOnTop(): boolean {
    if (this.floatingNavigator && !this.floatingNavigator.isDestroyed()) {
      return this.floatingNavigator.isAlwaysOnTop()
    }
    const persisted =
      this.windowStateManager?.getWindowState('floating')?.isAlwaysOnTop
    if (typeof persisted === 'boolean') return persisted
    return (
      this.configManager?.get<boolean>('window.floating.alwaysOnTop', true) ??
      true
    )
  }

  /**
   * Persists + applies FloatingNavigator's always-on-top preference across all
   * three layers that decide its relaunch state — config seed, window-state.json,
   * and the live window. The window-state write is load-bearing: `getWindowOptions`
   * reads `state.isAlwaysOnTop` at create and main re-applies it post-create, so a
   * config-only write would be silently overridden after the first launch.
   * @param enabled - true pins FloatingNavigator above others; false unpins it.
   * @returns The applied value (echoed for optimistic-UI confirmation).
   */
  setFloatingNavigatorAlwaysOnTop(enabled: boolean): boolean {
    if (this.configManager) {
      this.configManager.set('window.floating.alwaysOnTop', enabled)
    }
    // Load-bearing — without this, relaunch re-pins from the persisted state.
    this.windowStateManager?.setWindowState('floating', {
      isAlwaysOnTop: enabled,
    })
    this.applyAlwaysOnTop(this.floatingNavigator, enabled)
    return enabled
  }

  /**
   * Calculates the position for the settings popover window.
   * Centers horizontally under the tray icon with screen-edge clamping.
   * Falls back to primary display center if tray is unavailable.
   *
   * @param windowWidth - Width of the popover window
   * @param windowHeight - Height of the popover window
   * @returns Coordinates for window placement
   */
  private calculateSettingsPopoverPosition(
    windowWidth: number,
    windowHeight: number,
  ): { x: number; y: number } {
    const trayBounds = this.getTrayBoundsProvider?.()

    if (trayBounds) {
      // Center horizontally under the tray icon with 4px gap below
      let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowWidth / 2)
      let y = trayBounds.y + trayBounds.height + 4

      // Clamp to the display containing the tray icon
      const display = screen.getDisplayNearestPoint({
        x: trayBounds.x,
        y: trayBounds.y,
      })
      const { workArea } = display

      // Prevent going off right edge
      if (x + windowWidth > workArea.x + workArea.width) {
        x = workArea.x + workArea.width - windowWidth
      }
      // Prevent going off left edge
      if (x < workArea.x) {
        x = workArea.x
      }
      // If window would go below screen, show above tray instead
      if (y + windowHeight > workArea.y + workArea.height) {
        y = trayBounds.y - windowHeight - 4
      }
      // Ensure top edge is still visible
      if (y < workArea.y) {
        y = workArea.y
      }

      return { x, y }
    }

    // Fallback: center on primary display
    const primaryDisplay = screen.getPrimaryDisplay()
    const { workArea } = primaryDisplay
    return {
      x: Math.round(workArea.x + (workArea.width - windowWidth) / 2),
      y: Math.round(workArea.y + (workArea.height - windowHeight) / 2),
    }
  }

  /**
   * Saves current window positions and sizes to persistent storage.
   */
  saveWindowState(): void {
    if (this.windowStateManager) {
      if (this.floatingNavigator) {
        this.windowStateManager.updateWindowState(
          'floating',
          this.floatingNavigator,
        )
      }
      if (this.brainDumpWindow) {
        this.windowStateManager.updateWindowState(
          'braindump',
          this.brainDumpWindow,
        )
      }
    }
  }

  /**
   * Create the floating navigator window.
   */
  createFloatingNavigator(): BrowserWindow {
    if (this.floatingNavigator) {
      return this.floatingNavigator
    }

    const windowOptions: WindowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('floating')
      : {
          width: 300,
          height: 400,
          minWidth: 250,
          minHeight: 300,
          maxWidth: 400,
        }

    const floatingConfig: FloatingConfig = this.configManager
      ? this.configManager.getSection('window').floating
      : { frame: false, alwaysOnTop: true, resizable: true }

    log.debug('Creating floating navigator window...', {
      windowOptions,
      floatingConfig,
      isDev: this.isDev,
    })

    // Resolve floating preload script path (built by electron-vite). It is
    // packaged inside `app.asar`, so resolve it relative to `__dirname`;
    // `process.resourcesPath` would miss it in production.
    const floatingPreloadPath = path.join(
      __dirname,
      '..',
      'preload',
      'preload-floating.cjs',
    )

    this.floatingNavigator = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: floatingPreloadPath,
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        devTools: isDevToolsEnabled(
          this.isDev,
          this.configManager?.get('advanced.enableDevTools', false) ?? false,
          process.env,
        ),
      },
      frame: floatingConfig.frame,
      // Sole pin-source for users upgrading from a build that predates this
      // preference: their saved window-state has no isAlwaysOnTop field, so
      // applyWindowState's `typeof === 'boolean'` guard skips it and CANNOT
      // re-pin. This line must stay AFTER the ...windowOptions spread (which
      // carries getWindowOptions' `alwaysOnTop: undefined` on upgrade) and must
      // NOT be folded into it — doing so hands the ctor `undefined` (unpinned).
      // Locked by the upgrade test in WindowManager.always-on-top.test.ts.
      alwaysOnTop: floatingConfig.alwaysOnTop,
      skipTaskbar: true,
      resizable: floatingConfig.resizable,
      show: false,
      backgroundColor: '#ffffff',
      transparent: false,
      hasShadow: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: -100, y: -100 },
    })

    // DT7: fresh window → reset the load-failure recovery machine so a prior
    // window's exhausted retries don't carry over.
    this.floatingLoadFailAttempts = 0
    this.floatingLoadRecoveryPending = false
    this.floatingHasLoadedOnce = false
    this.floatingLoadFailedPendingFinish = false

    const floatingUrl = this.getPanelUrl('floating')

    log.debug('Loading floating navigator URL:', floatingUrl)
    this.floatingNavigator.loadURL(floatingUrl)

    this.floatingNavigator.on('resize', () => {
      if (this.windowStateManager && this.floatingNavigator) {
        this.windowStateManager.updateWindowStateDebounced(
          'floating',
          this.floatingNavigator,
        )
      }
    })

    this.floatingNavigator.on('move', () => {
      if (this.windowStateManager && this.floatingNavigator) {
        this.windowStateManager.updateWindowStateDebounced(
          'floating',
          this.floatingNavigator,
        )
      }
    })

    this.floatingNavigator.on('closed', () => {
      log.debug('Floating navigator window closed')
      this.floatingNavigator = null
      this.saveWindowState()
    })

    this.floatingNavigator.on('ready-to-show', () => {
      log.debug('Floating navigator ready-to-show event')
    })

    this.floatingNavigator.webContents.on('did-finish-load', () => {
      // DT7: Chromium fires did-finish-load for the ERROR PAGE too (chrome-error://…)
      // after a failed load, not only for a real app load. If the most recent
      // main-frame load failed, THIS finish is that error page settling: consume
      // the marker and do NOT latch, so recovery keeps retrying instead of being
      // silenced into a permanently blank window (the bug T20 native QA caught).
      if (this.floatingLoadFailedPendingFinish) {
        this.floatingLoadFailedPendingFinish = false
        return
      }
      log.debug('Floating navigator content loaded')
      // DT7: the renderer is alive now and owns its own error states, so stop
      // the main-process load-failure recovery from firing on later transient
      // events (e.g. a stale did-fail-load for the settled load).
      this.floatingHasLoadedOnce = true
      this.floatingLoadRecoveryPending = false
    })

    // DT7: recover a never-loaded Floating window from a main-frame load
    // failure (offline/DNS/5xx). Without this the signed-out front door can
    // boot into a permanently blank window. See `recoverFloatingFromLoadFailure`.
    this.floatingNavigator.webContents.on(
      'did-fail-load',
      (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
        // Sub-resource failures and intentional cancellations (ERR_ABORTED
        // fires during a normal redirect chain) are not real document failures.
        if (!isMainFrame || errorCode === ERR_ABORTED) return
        // A real main-frame failure: Chromium will now commit an error page and
        // fire did-finish-load for IT. Mark it so that finish doesn't mistake the
        // error page for a live app render and latch `floatingHasLoadedOnce`.
        this.floatingLoadFailedPendingFinish = true
        // Once the panel has loaded once, its live renderer owns its error UI —
        // main-process retry is only for a never-loaded (dead) window.
        if (this.floatingHasLoadedOnce) return
        // A retry timer or dialog is already in flight — don't stack them.
        if (this.floatingLoadRecoveryPending) return
        this.recoverFloatingFromLoadFailure()
      },
    )

    this.floatingNavigator.webContents.on(
      'render-process-gone',
      (_event, details) => {
        log.error('Floating navigator process gone:', {
          reason: details.reason,
        })
      },
    )

    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState(
        'floating',
        this.floatingNavigator,
      )
    }

    this.applyVisibleOnAllWorkspaces(
      this.floatingNavigator,
      Boolean(floatingConfig.visibleOnAllWorkspaces),
    )

    // Notify dependents that a fresh Floating window exists so they can rebind to
    // it (ShortcutManager re-attaches contextual-shortcut focus/blur listeners).
    // Fired here — after the window is fully wired but before the caller shows it
    // — so listeners are in place by the time it first gains focus.
    this.onFloatingNavigatorCreated?.()

    return this.floatingNavigator
  }

  /**
   * Drive the Floating window back to life after a main-frame load failure:
   * silently retry with linear backoff, then — once retries are exhausted —
   * surface a NATIVE recovery dialog. Main-process owned because a never-loaded
   * renderer can't render its own error page; the dialog is native (not bundled
   * HTML) because electron-builder can drop asar leaf deps. Wired from the
   * Floating `did-fail-load` handler in `createFloatingNavigator`.
   *
   * @returns nothing — schedules a retry or opens the recovery dialog as a side effect.
   * @example
   * // on a real offline boot: retries 3× (800/1600/2400 ms) then shows the dialog
   */
  private recoverFloatingFromLoadFailure(): void {
    const target = this.floatingNavigator
    if (!target || target.isDestroyed()) return

    // Still within the silent-retry budget: schedule a backed-off reload.
    if (this.floatingLoadFailAttempts < FLOATING_LOAD_MAX_RETRIES) {
      this.floatingLoadFailAttempts += 1
      this.floatingLoadRecoveryPending = true
      const backoffMs =
        FLOATING_LOAD_RETRY_BASE_MS * this.floatingLoadFailAttempts
      // Bind the retry to the window that ACTUALLY failed. If it closes and a
      // fresh Floating window replaces it during the backoff, this stale timer
      // must not reload (and corrupt the recovery state of) the new window.
      const retryTarget = target
      setTimeout(() => {
        if (
          this.floatingNavigator !== retryTarget ||
          retryTarget.isDestroyed()
        ) {
          return
        }
        this.floatingLoadRecoveryPending = false
        retryTarget.webContents.loadURL(this.getPanelUrl('floating'))
      }, backoffMs)
      return
    }

    // Retries exhausted. Show the (until now hidden) startup panel FIRST: a
    // window-modal sheet attached to a non-visible window may never render on
    // macOS, which would itself be the dead window this recovery exists to kill.
    this.floatingLoadRecoveryPending = true
    target.show()
    void this.promptFloatingLoadFailure(target)
  }

  /**
   * Native "couldn't reach corelive.app" recovery dialog shown when the Floating
   * window exhausts its silent reload retries. Retry restarts a fresh recovery
   * cycle; Close dismisses the window (re-openable from the tray). Deliberately
   * Close, not Quit: in Phase 1 the main window is still alive and `app.quit()`
   * would take it down over a companion-window network blip.
   *
   * @param target - The Floating window to attach the dialog to and recover.
   * @returns a promise that settles once the user picks Retry or Close.
   * @example
   * void this.promptFloatingLoadFailure(this.floatingNavigator)
   */
  private async promptFloatingLoadFailure(
    target: BrowserWindow,
  ): Promise<void> {
    const { response } = await dialog.showMessageBox(target, {
      type: 'warning',
      message: "Couldn't reach corelive.app",
      detail: 'Check your internet connection, then try again.',
      buttons: ['Retry', 'Close'],
      defaultId: 0,
      cancelId: 1,
    })

    if (target.isDestroyed()) return

    // Retry (button 0): restart the backoff sequence from a clean slate.
    if (response === 0) {
      this.floatingLoadFailAttempts = 0
      this.floatingLoadRecoveryPending = false
      target.webContents.loadURL(this.getPanelUrl('floating'))
      return
    }

    // Close (button 1): keep the Phase-1 main window alive; the tray re-opens
    // Floating later.
    // PHASE 2 (main window deleted): Close here would leave zero windows + tray
    // only — revisit whether to keep the window on a recoverable blank instead.
    target.close()
  }

  /**
   * Create the BrainDump Note window — a frameless, transparent, always-on-top
   * panel that loads `${baseUrl}/braindump`.
   *
   * Why frameless + transparent: the panel sits over other apps as a calm
   * scratchpad; the renderer paints its own chrome (titlebar, opacity slider).
   *
   * Why we cap opacity 0.30–1.00: lower than 0.30 makes the window
   * undiscoverable; the cap is enforced both here and at config persist time.
   *
   * @returns The (possibly already-existing) BrainDump BrowserWindow.
   */
  createBrainDumpWindow(): BrowserWindow {
    if (this.brainDumpWindow) {
      return this.brainDumpWindow
    }

    const windowOptions: WindowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('braindump')
      : {
          width: 480,
          height: 640,
          minWidth: 320,
          minHeight: 320,
          maxWidth: 1200,
          frame: false,
          alwaysOnTop: this.getBrainDumpAlwaysOnTop(),
          resizable: true,
          skipTaskbar: true,
        }

    const initialOpacity = this.getBrainDumpOpacity()

    log.debug('Creating BrainDump window...', {
      windowOptions,
      initialOpacity,
      isDev: this.isDev,
    })

    const brainDumpPreloadPath = path.join(
      __dirname,
      '..',
      'preload',
      'preload-braindump.cjs',
    )

    this.brainDumpWindow = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: brainDumpPreloadPath,
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        devTools: isDevToolsEnabled(
          this.isDev,
          this.configManager?.get('advanced.enableDevTools', false) ?? false,
          process.env,
        ),
      },
      frame: false,
      alwaysOnTop: this.getBrainDumpAlwaysOnTop(),
      skipTaskbar: true,
      resizable: true,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      vibrancy: 'under-window',
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: -100, y: -100 },
    })

    this.brainDumpWindow.setOpacity(initialOpacity)

    const brainDumpUrl = this.getPanelUrl('braindump')

    log.debug('Loading BrainDump URL:', brainDumpUrl)
    this.brainDumpWindow.loadURL(brainDumpUrl)

    this.brainDumpWindow.on('resize', () => {
      if (this.windowStateManager && this.brainDumpWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'braindump',
          this.brainDumpWindow,
        )
      }
    })

    this.brainDumpWindow.on('move', () => {
      if (this.windowStateManager && this.brainDumpWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'braindump',
          this.brainDumpWindow,
        )
      }
    })

    // 'close' fires before destruction — capture bounds while the window
    // is still alive (matches the main window pattern).
    this.brainDumpWindow.on('close', () => {
      this.saveWindowState()
    })

    this.brainDumpWindow.on('closed', () => {
      log.debug('BrainDump window closed')
      this.brainDumpWindow = null
    })

    this.brainDumpWindow.webContents.on(
      'render-process-gone',
      (_event, details) => {
        log.error('BrainDump process gone:', { reason: details.reason })
      },
    )

    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState(
        'braindump',
        this.brainDumpWindow,
      )
    }

    this.applyVisibleOnAllWorkspaces(
      this.brainDumpWindow,
      this.configManager?.get<boolean>(
        'braindump.visibleOnAllWorkspaces',
        false,
      ) ?? false,
    )

    return this.brainDumpWindow
  }

  /**
   * Toggle BrainDump visibility (creates the window on first call).
   *
   * @returns True when the window is now visible, false when hidden.
   */
  toggleBrainDump(): boolean {
    if (!this.brainDumpWindow || this.brainDumpWindow.isDestroyed()) {
      this.createBrainDumpWindow()
      this.showBrainDump()
      return true
    }

    if (this.brainDumpWindow.isVisible()) {
      this.hideBrainDump()
      return false
    }

    this.showBrainDump()
    return true
  }

  /** Show the BrainDump window, creating it if needed, then focus it. */
  showBrainDump(): void {
    if (!this.brainDumpWindow || this.brainDumpWindow.isDestroyed()) {
      this.createBrainDumpWindow()
    }
    this.brainDumpWindow?.show()
    this.brainDumpWindow?.focus()
  }

  /** Hide the BrainDump window without destroying it (instant re-show). */
  hideBrainDump(): void {
    if (this.brainDumpWindow && !this.brainDumpWindow.isDestroyed()) {
      this.brainDumpWindow.hide()
    }
  }

  /**
   * Set BrainDump opacity, clamped to [0.30, 1.00] and persisted to config.
   *
   * @param value - Desired opacity (out-of-band values are clamped silently).
   * @returns The opacity actually applied (post-clamp).
   * @example
   * windowManager.setBrainDumpOpacity(0.85) // → 0.85
   * windowManager.setBrainDumpOpacity(0.10) // → 0.30 (clamped)
   */
  setBrainDumpOpacity(value: number): number {
    const clamped = Math.max(0.3, Math.min(1, value))

    if (this.brainDumpWindow && !this.brainDumpWindow.isDestroyed()) {
      this.brainDumpWindow.setOpacity(clamped)
    }

    if (this.configManager) {
      this.configManager.set('braindump.opacity', clamped)
    }

    return clamped
  }

  /** Read current BrainDump opacity (live window value, else config, else 1). */
  getBrainDumpOpacity(): number {
    if (this.brainDumpWindow && !this.brainDumpWindow.isDestroyed()) {
      return this.brainDumpWindow.getOpacity()
    }
    // Coerce + clamp the persisted value: a hand-edited config or a stale
    // value from before the clamp was introduced could otherwise hand the
    // renderer something out of [0.30, 1.00].
    const raw = this.configManager?.get('braindump.opacity', 1) ?? 1
    const numeric = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(numeric)) return 1
    return Math.max(0.3, Math.min(1, numeric))
  }

  /** Get the BrainDump BrowserWindow (or null if not yet created). */
  getBrainDumpWindow(): BrowserWindow | null {
    return this.brainDumpWindow
  }

  /** Whether the BrainDump window currently exists (and is not destroyed). */
  hasBrainDumpWindow(): boolean {
    return Boolean(this.brainDumpWindow && !this.brainDumpWindow.isDestroyed())
  }

  /**
   * Toggle floating navigator visibility.
   */
  toggleFloatingNavigator(): void {
    log.debug('toggleFloatingNavigator called', {
      hasWindow: !!this.floatingNavigator,
      isVisible: this.floatingNavigator?.isVisible?.(),
    })

    if (!this.floatingNavigator) {
      log.info('Creating floating navigator...')
      const navigator = this.createFloatingNavigator()
      log.info('Showing floating navigator...')
      navigator.show()
    } else if (this.floatingNavigator.isVisible()) {
      log.info('Hiding floating navigator')
      this.floatingNavigator.hide()
    } else {
      log.info('Showing floating navigator')
      this.floatingNavigator.show()
    }

    this.saveWindowState()
  }

  /**
   * Shows the floating navigator window.
   */
  showFloatingNavigator(): void {
    if (!this.floatingNavigator) {
      this.createFloatingNavigator()
    }
    this.floatingNavigator?.show()
    this.saveWindowState()
  }

  /**
   * Hides the floating navigator window without destroying it.
   */
  hideFloatingNavigator(): void {
    if (this.floatingNavigator) {
      this.floatingNavigator.hide()
      this.saveWindowState()
    }
  }

  /**
   * Surface the Floating Navigator from the tray / dock / notification click /
   * shortcut / deep-link — the primary companion window now that the main
   * window is being retired (T6). Shared chokepoint for every native-chrome
   * caller that used to "restore the app"; creates Floating if absent so these
   * paths always land on a real window, never a no-op on a tray-resident boot.
   *
   * @example
   * // tray "Focus Floating" / dock activate / notification click all call:
   * windowManager.restoreFromTray()
   */
  restoreFromTray(): void {
    if (!this.floatingNavigator) {
      this.createFloatingNavigator()
    }
    if (this.floatingNavigator) {
      if (this.floatingNavigator.isMinimized()) {
        this.floatingNavigator.restore()
      }
      this.floatingNavigator.show()
      this.floatingNavigator.focus()
    }
    this.saveWindowState()
  }

  /**
   * Set tray fallback mode.
   */
  setTrayFallbackMode(enabled: boolean): void {
    this.trayFallbackMode = enabled
  }

  /**
   * Check if in tray fallback mode.
   */
  isTrayFallbackMode(): boolean {
    return this.trayFallbackMode
  }

  /**
   * Get floating navigator instance.
   */
  getFloatingNavigator(): BrowserWindow | null {
    return this.floatingNavigator
  }

  /**
   * Check if floating navigator exists and is not destroyed.
   */
  hasFloatingNavigator(): boolean {
    return (
      this.floatingNavigator !== null && !this.floatingNavigator.isDestroyed()
    )
  }

  // ==========================================================================
  // Startup panel orchestration (nav-watch auth gate)
  // ==========================================================================

  /**
   * Build a startup panel's URL from the configured server origin. Single
   * source of truth shared by the create methods and the post-login re-show.
   *
   * @param kind - Which auxiliary panel.
   * @returns The fully-qualified panel URL.
   * @example
   * this.getPanelUrl('floating')  // => 'https://corelive.app/floating-navigator'
   * this.getPanelUrl('braindump') // => 'https://corelive.app/braindump'
   */
  private getPanelUrl(kind: StartupPanelKind): string {
    const baseUrl = this.serverUrl || 'https://corelive.app'
    return kind === 'floating'
      ? `${baseUrl}/floating-navigator`
      : `${baseUrl}/braindump`
  }

  /**
   * Resolve the web-app origin the renderers point at, independent of any one
   * window. OAuth URL building uses this so the system-browser flow targets the
   * correct origin (localhost in dev, corelive.app in prod) even with no main
   * window — the retired main window can no longer be read for its URL.
   *
   * @returns The origin (scheme + host + port) of the configured server URL, or
   * the production origin when `serverUrl` is unset/unparseable.
   * @example
   * windowManager.getWebAppOrigin() // => 'http://localhost:4991' (dev)
   * windowManager.getWebAppOrigin() // => 'https://corelive.app'    (prod)
   */
  getWebAppOrigin(): string {
    const baseUrl = this.serverUrl || 'https://corelive.app'
    try {
      return new URL(baseUrl).origin
    } catch {
      return 'https://corelive.app'
    }
  }

  /**
   * Whether a navigated URL is a Clerk auth page, i.e. the user is not yet
   * authenticated. A startup panel that lands here was redirected by proxy.ts.
   *
   * @param rawUrl - Full URL from a `did-navigate` event.
   * @returns true when the pathname is `/login` or `/sign-up`.
   * @example
   * this.isAuthPathname('https://corelive.app/login?redirect_url=/braindump') // true
   * this.isAuthPathname('https://corelive.app/floating-navigator')            // false
   */
  private isAuthPathname(rawUrl: string): boolean {
    try {
      const { pathname } = new URL(rawUrl)
      return AUTH_PATHNAMES.includes(pathname)
    } catch {
      // A malformed URL can't be an auth page; never crash startup over it.
      return false
    }
  }

  /**
   * Open an auxiliary panel as part of Electron startup, gated on auth.
   *
   * Why this exists: a panel-only cold boot must not flash an empty window when
   * the user is signed out. We create the panel hidden, watch its first load,
   * and only `show()` it once it actually renders the panel route (not /login).
   * Called from `main.ts` for each panel enabled in `behavior.startup`.
   *
   * @param kind - 'floating' | 'braindump' — which startup panel to open.
   * @example
   * windowManager.openStartupPanel('floating')
   */
  openStartupPanel(kind: StartupPanelKind): void {
    const panel =
      kind === 'floating'
        ? this.createFloatingNavigator()
        : this.createBrainDumpWindow()
    this.watchStartupPanelLoad(panel, kind)
  }

  /**
   * Panels suppressed at startup because they hit an auth page or failed to
   * load (so main was surfaced instead). A test-observability seam: the unit
   * tests assert the suppress-and-surface decision through this set; no
   * production code reads it.
   *
   * @returns A read-only view of the suppressed-panel set.
   * @example
   * if (windowManager.getStartupAuthFallbacks().has('braindump')) { ... }
   */
  getStartupAuthFallbacks(): ReadonlySet<StartupPanelKind> {
    return this.startupAuthFallbacks
  }

  /**
   * Decide a startup panel's fate from its settled load: show it if the load
   * lands on the panel route, or suppress it + surface main if the load
   * redirects to an auth page or fails (offline/timeout/5xx).
   *
   * Ordering note: `createFloatingNavigator`/`createBrainDumpWindow` call
   * `loadURL` synchronously *before* this runs. That is safe — `did-navigate`
   * is async, so these listeners register in the same tick, before the network
   * response arrives. Do NOT "fix" it by moving `loadURL`.
   *
   * @param panel - The freshly created (hidden) panel window.
   * @param kind - Which startup panel, used for the fallback record + re-show.
   */
  private watchStartupPanelLoad(
    panel: BrowserWindow,
    kind: StartupPanelKind,
  ): void {
    const { webContents } = panel
    // Removers run once the decision is made, so the panel's later in-app
    // navigations never re-trigger the auth gate.
    const removeListeners: Array<() => void> = []
    // Guard so the show-or-suppress decision is made exactly once per load,
    // even though `did-navigate` and `did-fail-load` can both fire.
    let decided = false
    let latestMainFrameUrl: string | null = null

    const finish = (authenticated: boolean): void => {
      if (decided) return
      decided = true
      removeListeners.forEach((remove) => remove())

      if (authenticated) {
        // Authed: reveal the panel the user asked to start with.
        panel.show()
        return
      }

      // Signed out or load failed: keep this panel hidden. With the main window
      // retired (T18), surface the Floating navigator instead — it is public
      // (`/floating-navigator`) and renders the signed-out OAuth front door, so a
      // signed-out launch always leaves one visible, interactive window to sign in
      // from. The suppressed panel reopens from the tray after sign-in; main's
      // post-login auto-reshow is retired with the window.
      this.startupAuthFallbacks.add(kind)
      this.restoreFromTray()
    }

    const onDidNavigate = (_event: Electron.Event, url: string): void => {
      latestMainFrameUrl = url
      // Auth redirects are terminal for this startup attempt: keep the panel
      // hidden and surface main immediately so a login page never flashes in
      // the auxiliary panel.
      if (this.isAuthPathname(url)) finish(false)
    }

    const onDidFinishLoad = (): void => {
      // Non-auth panel routes are only trusted after load settles; during an
      // unauthenticated cold boot Chromium can report the requested panel URL
      // before the redirect lands on /login.
      const currentUrl = webContents.getURL() || latestMainFrameUrl
      finish(currentUrl === null ? false : !this.isAuthPathname(currentUrl))
    }

    const onDidFailLoad = (
      _event: Electron.Event,
      errorCode: number,
      _errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean,
    ): void => {
      // Subresource failures and intentional cancellations (ERR_ABORTED fires
      // during the normal panel -> /login redirect chain) are not real errors.
      if (!isMainFrame || errorCode === ERR_ABORTED) return
      // Phase 1 / DT7: the Floating window owns its own load-failure recovery
      // (retry + native dialog in `createFloatingNavigator`), so the startup
      // gate must NOT suppress it and surface main on a network blip. Braindump
      // is still main-deferred in Phase 1, so it keeps the surface-main path.
      if (kind === 'floating') return
      finish(false)
    }

    webContents.on('did-navigate', onDidNavigate)
    webContents.on('did-finish-load', onDidFinishLoad)
    webContents.on('did-fail-load', onDidFailLoad)
    removeListeners.push(
      () => webContents.removeListener('did-navigate', onDidNavigate),
      () => webContents.removeListener('did-finish-load', onDidFinishLoad),
      () => webContents.removeListener('did-fail-load', onDidFailLoad),
    )
  }

  /**
   * Creates the settings window with security-first configuration.
   *
   * @returns The created settings window
   */
  createSettingsWindow(): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus()
      return this.settingsWindow
    }

    log.info('🔧 Creating settings popover window...')

    // Load persisted size, clamping out-of-range values (e.g. hand-edited config).
    const windowWidth = clampDimension(
      this.configManager?.get(
        'settingsPopover.width',
        SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
      ),
      SETTINGS_POPOVER_MIN_WIDTH_PX,
      SETTINGS_POPOVER_MAX_WIDTH_PX,
      SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
    )
    const windowHeight = clampDimension(
      this.configManager?.get(
        'settingsPopover.height',
        SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
      ),
      SETTINGS_POPOVER_MIN_HEIGHT_PX,
      SETTINGS_POPOVER_MAX_HEIGHT_PX,
      SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
    )

    const { x, y } = this.calculateSettingsPopoverPosition(
      windowWidth,
      windowHeight,
    )

    // Resolve preload script path (built by electron-vite). It is packaged
    // inside `app.asar`, so resolve it relative to `__dirname`;
    // `process.resourcesPath` would miss it in production.
    const preloadPath = path.join(__dirname, '..', 'preload', 'preload.cjs')

    this.settingsWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x,
      y,
      resizable: true,
      minWidth: SETTINGS_POPOVER_MIN_WIDTH_PX,
      minHeight: SETTINGS_POPOVER_MIN_HEIGHT_PX,
      maxWidth: SETTINGS_POPOVER_MAX_WIDTH_PX,
      maxHeight: SETTINGS_POPOVER_MAX_HEIGHT_PX,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      transparent: true,
      vibrancy: 'popover',
      visualEffectState: 'active',
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        devTools: isDevToolsEnabled(
          this.isDev,
          this.configManager?.get('advanced.enableDevTools', false) ?? false,
          process.env,
        ),
      },
      show: false,
    })

    // Load settings page
    const baseUrl = this.serverUrl || 'https://corelive.app'
    const settingsUrl = `${baseUrl}/settings`

    log.debug('🔧 Loading settings URL:', settingsUrl)
    this.settingsWindow.loadURL(settingsUrl)

    // Show when ready
    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow?.show()
    })

    // Track when the user starts manually dragging a resize handle so the blur
    // handler below does not close the window mid-drag. `will-resize` fires
    // only for manual (user-initiated) resizes, NOT for programmatic setSize().
    // Failsafe: if no `resize` event follows within 500 ms (e.g. the user
    // clicked the handle but released without moving), the flag self-clears so
    // the window can still be blur-closed in that session.
    this.settingsWindow.on('will-resize', () => {
      this.settingsWindowIsResizing = true
      if (this.settingsResizeDebounceTimer) {
        clearTimeout(this.settingsResizeDebounceTimer)
      }
      this.settingsResizeDebounceTimer = setTimeout(() => {
        this.settingsWindowIsResizing = false
        this.settingsResizeDebounceTimer = null
      }, 500)
    })

    // Debounce-persist the new size and clear the resizing flag.
    this.settingsWindow.on('resize', () => {
      if (this.settingsPersistDebounceTimer) {
        clearTimeout(this.settingsPersistDebounceTimer)
      }
      const capturedWindow = this.settingsWindow
      this.settingsPersistDebounceTimer = setTimeout(() => {
        this.settingsWindowIsResizing = false
        this.settingsPersistDebounceTimer = null
        if (!capturedWindow || capturedWindow.isDestroyed()) return
        const [width, height] = capturedWindow.getSize()
        this.configManager?.update({
          'settingsPopover.width': width,
          'settingsPopover.height': height,
        })
      }, SETTINGS_POPOVER_RESIZE_DEBOUNCE_MS)
    })

    // Auto-hide on blur (popover behavior). Skip while the user is dragging a
    // resize handle — the window losing focus mid-resize should not close it.
    this.settingsWindow.on('blur', () => {
      if (this.settingsWindowIsResizing) return
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        this.settingsWindow.hide()
      }
    })

    // Cleanup on close
    this.settingsWindow.on('closed', () => {
      log.debug('🔧 Settings popover closed')
      // Cancel any pending timers and reset resize state.
      if (this.settingsResizeDebounceTimer) {
        clearTimeout(this.settingsResizeDebounceTimer)
        this.settingsResizeDebounceTimer = null
      }
      if (this.settingsPersistDebounceTimer) {
        clearTimeout(this.settingsPersistDebounceTimer)
        this.settingsPersistDebounceTimer = null
      }
      this.settingsWindowIsResizing = false
      this.settingsWindow = null
    })

    // Make the popover follow the active macOS Space so Preferences always opens
    // on the CURRENT desktop. Without this, the window stays bound to the Space
    // it was last shown on, and reopening it after switching desktops yanks the
    // user over to that old Space (the reported "opens on another desktop" bug).
    // Unlike the floating panels (opt-in via config), this is transient tray
    // chrome that must ALWAYS follow the active Space, so `true` is hardcoded.
    this.applyVisibleOnAllWorkspaces(this.settingsWindow, true)

    return this.settingsWindow
  }

  /**
   * Opens or focuses the settings window.
   * Creates the window if it doesn't exist.
   */
  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      // Reposition in case tray icon moved (e.g., display change)
      const { width, height } = this.settingsWindow.getBounds()
      const { x, y } = this.calculateSettingsPopoverPosition(width, height)
      this.settingsWindow.setPosition(x, y)
      this.settingsWindow.show()
      this.settingsWindow.focus()
    } else {
      this.createSettingsWindow()
    }
  }

  /**
   * Closes the settings window if it exists.
   * The window reference is nulled by the 'closed' event handler
   * set up in createSettingsWindow().
   */
  closeSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close()
      // Note: Don't null here - the 'closed' event handler will do it
    }
  }

  /**
   * Get settings window instance
   */
  getSettingsWindow(): BrowserWindow | null {
    return this.settingsWindow
  }

  /**
   * Check if settings window exists and is not destroyed
   */
  hasSettingsWindow(): boolean {
    return this.settingsWindow !== null && !this.settingsWindow.isDestroyed()
  }

  /**
   * Resets the Settings popover to default size and re-anchors it to the tray.
   * Called by the "Restore default size" IPC handler. Persists the reset so the
   * next open also uses default dimensions.
   */
  resetSettingsPopoverSize(): void {
    this.configManager?.update({
      'settingsPopover.width': SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
      'settingsPopover.height': SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
    })

    const win = this.settingsWindow
    if (!win || win.isDestroyed()) return

    const { x, y } = this.calculateSettingsPopoverPosition(
      SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
      SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
    )
    win.setBounds({
      x,
      y,
      width: SETTINGS_POPOVER_DEFAULT_WIDTH_PX,
      height: SETTINGS_POPOVER_DEFAULT_HEIGHT_PX,
    })
  }

  /**
   * Cleanup and save state before app quit.
   */
  cleanup(): void {
    this.saveWindowState()

    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close()
    }

    if (this.brainDumpWindow && !this.brainDumpWindow.isDestroyed()) {
      this.brainDumpWindow.close()
    }

    if (this.floatingNavigator && !this.floatingNavigator.isDestroyed()) {
      this.floatingNavigator.close()
    }
  }
}

export default WindowManager

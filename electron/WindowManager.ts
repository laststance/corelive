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
 * - Support the three desktop surfaces: LiveEditor panel, login window, Settings popover
 *
 * @module electron/WindowManager
 */

import path from 'path'
import { fileURLToPath } from 'url'

import { BrowserWindow, dialog, screen } from 'electron'
import type { WebContents } from 'electron'

import type { ConfigManager } from './ConfigManager'
import {
  AUTH_PATHNAMES,
  ERR_ABORTED,
  LOGIN_WINDOW_HEIGHT_PX,
  LOGIN_WINDOW_WIDTH_PX,
  PANEL_LOAD_MAX_RETRIES,
  PANEL_LOAD_RETRY_BASE_MS,
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
import type { WindowStateManager, WindowOptions } from './WindowStateManager'

// Resolve __dirname for ES modules
// @ts-ignore - import.meta.url is valid at runtime (electron-vite handles this)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Type Definitions
// ============================================================================

/** How a panel that failed to load is retried, dismissed and parented by {@link WindowManager.recoverPanelFromLoadFailure}. */
interface PanelLoadRecoveryOptions {
  /** Reloads the panel route; run by each backoff retry and by the dialog's Retry button. */
  retry: () => void
  /** Run when the user picks Close in the recovery dialog. */
  dismiss: () => void
  /** Window to show and attach the dialog to, or null for an app-modal dialog (hidden transparent panels). */
  parent: BrowserWindow | null
  /** HTTP status of the error page when the failure was a 4xx/5xx rather than a network error. */
  httpStatus?: number
}

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
  /** Fixed-size sign-in window (`/login-shell`); the only signed-out surface. */
  private loginWindow: BrowserWindow | null

  /**
   * True from a login-window handoff ({@link completeLogin}) until LiveEditor is
   * actually revealed or the user logs out. While set, repeated sign-in reports
   * are ignored so a LiveEditor load failure that re-shows the login window can
   * never ping-pong back into another handoff.
   */
  private loginHandoffPending: boolean

  /**
   * Per-window load-failure retry bookkeeping for {@link recoverPanelFromLoadFailure}.
   * Keyed weakly so the state dies with its window: a replacement window always
   * starts a fresh retry budget, and a stale retry timer cannot touch it.
   */
  private readonly loadRecovery = new WeakMap<
    BrowserWindow,
    { attempts: number; pending: boolean }
  >()

  /** Frameless transparent LiveEditor Note panel */
  private liveEditorWindow: BrowserWindow | null
  /** True after LiveEditor has loaded its protected editor route in this window. */
  private liveEditorHasLoadedOnce: boolean
  /** True while a manual LiveEditor show waits for auth redirect/load settlement. */
  private liveEditorRevealPending: boolean
  /** Cancels the current delayed LiveEditor reveal watcher, if one is active. */
  private cancelLiveEditorReveal: (() => void) | null
  /** True after LiveEditor was suppressed and must reload `/live-editor` before reveal. */
  private liveEditorNeedsReloadBeforeReveal: boolean

  /** Settings window */
  private settingsWindow: BrowserWindow | null

  /** Whether running in development mode */
  private isDev: boolean

  /** URL of the Next.js server */
  private serverUrl: string | null

  /** Manages user settings */
  private configManager: ConfigManager | null

  /** Handles window state persistence */
  private windowStateManager: WindowStateManager | null

  /** Callback to get tray icon bounds for popover positioning */
  private getTrayBoundsProvider: (() => Electron.Rectangle | null) | null

  /**
   * True once the startup LiveEditor load was redirected to an auth page (or
   * failed), so the login window was surfaced in its place. Exposed only through
   * {@link hasStartupAuthFallback} as test-observable evidence of that decision;
   * no production code branches on it. Durable for the session.
   */
  private startupAuthFallbackOccurred: boolean
  /** Cancels startup-panel auth gates that have not reached a load decision yet. */
  private startupPanelLoadCancellations: Set<() => void>

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
   * @param configManager - Manages user settings
   * @param windowStateManager - Handles window state persistence
   */
  constructor(
    serverUrl: string | null = null,
    configManager: ConfigManager | null = null,
    windowStateManager: WindowStateManager | null = null,
  ) {
    this.loginWindow = null
    this.loginHandoffPending = false
    this.liveEditorWindow = null
    this.liveEditorHasLoadedOnce = false
    this.liveEditorRevealPending = false
    this.cancelLiveEditorReveal = null
    this.liveEditorNeedsReloadBeforeReveal = false
    this.settingsWindow = null
    this.isDev = process.env.NODE_ENV === 'development'
    this.serverUrl = serverUrl
    this.configManager = configManager
    this.windowStateManager = windowStateManager
    this.getTrayBoundsProvider = null
    this.startupAuthFallbackOccurred = false
    this.startupPanelLoadCancellations = new Set()
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
   * Applies the macOS Spaces-following behavior to a utility panel window.
   *
   * Electron exposes this through `setVisibleOnAllWorkspaces`, but it is only
   * meaningful on macOS for CoreLive's use case. The guard keeps Linux/Windows
   * behavior unchanged while still allowing the setting to be stored.
   *
   * @param browserWindow - Panel to update, if it currently exists
   * @param enabled - true keeps the window visible across Spaces/desktops
   * @example
   * this.applyVisibleOnAllWorkspaces(this.liveEditorWindow, true)
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
    // setAlwaysOnTop's default window level (above normal windows, below
    // menus) is the right one for these utility panels.
    browserWindow.setAlwaysOnTop(enabled)
  }

  /**
   * Reads whether the LiveEditor panel should follow macOS Spaces (config-backed, default off).
   *
   * @returns true when LiveEditor stays visible across desktops
   * @example
   * const enabled = windowManager.getLiveEditorVisibleOnAllWorkspaces()
   */
  getLiveEditorVisibleOnAllWorkspaces(): boolean {
    return (
      this.configManager?.get<boolean>(
        'liveEditor.visibleOnAllWorkspaces',
        false,
      ) ?? false
    )
  }

  /**
   * Persists and applies the "show on all Mac desktops" setting.
   *
   * Called from Settings via IPC. An open LiveEditor updates immediately; a
   * window created later reads the persisted config during creation.
   *
   * @param enabled - true keeps LiveEditor visible across Spaces
   * @returns The setting value that was applied
   * @example
   * windowManager.setLiveEditorVisibleOnAllWorkspaces(true)
   */
  setLiveEditorVisibleOnAllWorkspaces(enabled: boolean): boolean {
    if (this.configManager) {
      this.configManager.set('liveEditor.visibleOnAllWorkspaces', enabled)
    }

    this.applyVisibleOnAllWorkspaces(this.liveEditorWindow, enabled)

    return enabled
  }

  /**
   * Reads LiveEditor's always-on-top setting (config-backed, default off).
   * LiveEditor has no in-window pin control, so config is the single source of truth.
   * @returns true when the LiveEditor panel is pinned above other windows.
   */
  getLiveEditorAlwaysOnTop(): boolean {
    return (
      this.configManager?.get<boolean>('liveEditor.alwaysOnTop', false) ?? false
    )
  }

  /**
   * Persists + applies LiveEditor's always-on-top setting.
   * @param enabled - true pins LiveEditor above other windows; false unpins it.
   * @returns The applied value (echoed for optimistic-UI confirmation).
   */
  setLiveEditorAlwaysOnTop(enabled: boolean): boolean {
    if (this.configManager) {
      this.configManager.set('liveEditor.alwaysOnTop', enabled)
    }
    this.applyAlwaysOnTop(this.liveEditorWindow, enabled)
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
   * Saves the LiveEditor position and size to persistent storage.
   */
  saveWindowState(): void {
    if (this.windowStateManager && this.liveEditorWindow) {
      this.windowStateManager.updateWindowState(
        'liveEditor',
        this.liveEditorWindow,
      )
    }
  }

  // ==========================================================================
  // Login window
  // ==========================================================================

  /**
   * Create the login window: a fixed-size shell ({@link LOGIN_WINDOW_WIDTH_PX} ×
   * {@link LOGIN_WINDOW_HEIGHT_PX}) that loads `/login-shell`, the only
   * signed-out surface. Nothing about it is persisted (no config, no
   * window-state); it is created hidden so callers decide when it appears.
   *
   * @returns The (possibly already-existing) login BrowserWindow.
   * @example
   * windowManager.createLoginWindow().show()
   */
  createLoginWindow(): BrowserWindow {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      return this.loginWindow
    }

    log.debug('Creating login window...', { isDev: this.isDev })

    const loginWindow = new BrowserWindow({
      width: LOGIN_WINDOW_WIDTH_PX,
      height: LOGIN_WINDOW_HEIGHT_PX,
      resizable: false,
      center: true,
      // Framed with hidden title bar: the native traffic lights stay visible
      // over the content, the only non-login way to dismiss this window (they
      // work in accessory / no-Dock mode too). Do not add `frame: false` or an
      // off-screen `trafficLightPosition`.
      titleBarStyle: 'hidden',
      skipTaskbar: true,
      show: false,
      hasShadow: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Built by electron-vite and packaged inside `app.asar`, so resolve it
        // relative to `__dirname`; `process.resourcesPath` would miss it.
        preload: path.join(__dirname, '..', 'preload', 'preload-login.cjs'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        devTools: isDevToolsEnabled(
          this.isDev,
          this.configManager?.get('advanced.enableDevTools', false) ?? false,
          process.env,
        ),
      },
    })
    this.loginWindow = loginWindow

    const loginUrl = this.getPanelUrl('login')
    log.debug('Loading login window URL:', loginUrl)
    loginWindow.loadURL(loginUrl)

    // Load-failure recovery (DT7). Per-window closure state, so a replacement
    // window never inherits a predecessor's latch.
    /** Latched on the first real load; after it the renderer owns its own errors. */
    let hasLoadedOnce = false
    /**
     * True between a main-frame failure (network error or HTTP 4xx/5xx page)
     * and the `did-finish-load` Chromium then fires for the error page it
     * commits. Lets the finish handler tell an error-page settle (which must
     * NOT latch `hasLoadedOnce`, or recovery goes silent on a blank window)
     * from a genuine app load.
     */
    let errorPagePendingFinish = false
    const recoveryOptions: PanelLoadRecoveryOptions = {
      retry: () => {
        void loginWindow.webContents.loadURL(loginUrl)
      },
      // Close leaves the app tray-resident; the tray reopens the login window.
      dismiss: () => loginWindow.close(),
      parent: loginWindow,
    }

    loginWindow.on('closed', () => {
      log.debug('Login window closed')
      if (this.loginWindow === loginWindow) this.loginWindow = null
    })

    loginWindow.on('ready-to-show', () => {
      log.debug('Login window ready-to-show event')
    })

    loginWindow.webContents.on('did-finish-load', () => {
      // Chromium fires did-finish-load for the ERROR PAGE too, not only for a
      // real app load. Consume the marker instead of latching (the bug T20
      // native QA caught) so recovery keeps retrying.
      if (errorPagePendingFinish) {
        errorPagePendingFinish = false
        return
      }
      log.debug('Login window content loaded')
      hasLoadedOnce = true
      this.loadRecovery.delete(loginWindow)
    })

    // HTTP 4xx/5xx is a SUCCESSFUL navigation to an error page — it never
    // fires did-fail-load — so the status code on did-navigate is the only
    // signal that corelive.app answered with an error.
    loginWindow.webContents.on(
      'did-navigate',
      (_event, _url, httpResponseCode) => {
        if (!(httpResponseCode >= 400)) return
        errorPagePendingFinish = true
        if (hasLoadedOnce) return
        this.recoverPanelFromLoadFailure(loginWindow, {
          ...recoveryOptions,
          httpStatus: httpResponseCode,
        })
      },
    )

    loginWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
        // Sub-resource failures and intentional cancellations (ERR_ABORTED
        // fires during a normal redirect chain) are not real document failures.
        if (!isMainFrame || errorCode === ERR_ABORTED) return
        errorPagePendingFinish = true
        // Once loaded, the live renderer owns its error UI — main-process
        // retry is only for a never-loaded (dead) window.
        if (hasLoadedOnce) return
        this.recoverPanelFromLoadFailure(loginWindow, recoveryOptions)
      },
    )

    loginWindow.webContents.on('render-process-gone', (_event, details) => {
      log.error('Login window process gone:', { reason: details.reason })
    })

    return loginWindow
  }

  /**
   * Surface the login window (creating it if needed). The signed-out fallback
   * for every LiveEditor path — called directly, never via {@link restoreFromTray},
   * so a signed-out LiveEditor bounce cannot loop back into LiveEditor.
   *
   * @returns Nothing.
   * @example
   * windowManager.showLoginWindow()
   */
  showLoginWindow(): void {
    const loginWindow =
      this.loginWindow && !this.loginWindow.isDestroyed()
        ? this.loginWindow
        : this.createLoginWindow()
    loginWindow.show()
    loginWindow.focus()
  }

  /**
   * Whether the login window currently exists (and is not destroyed). A
   * test-observability seam; no production code reads it (`restoreFromTray`
   * deliberately does not short-circuit on it, see its docstring).
   *
   * @returns true while a live login window exists.
   * @example
   * expect(windowManager.hasLoginWindow()).toBe(true)
   */
  hasLoginWindow(): boolean {
    return this.loginWindow !== null && !this.loginWindow.isDestroyed()
  }

  /**
   * Hand off from the login window to LiveEditor once the login window reports
   * a signed-in user (`auth-set-user`). Only the login window's own
   * `webContents` may trigger it, and only once per handoff:
   *
   * ```
   * login window ──auth-set-user──▶ main ──completeLogin(sender)──▶ [pending=true] showLiveEditor() → close login
   *       ▲                                                                            │
   *       │ showLoginWindow() (fallback; pending stays set)             did-fail-load / /login bounce
   *       └────────────────── suppressLiveEditorAuthRedirect ◀─────────────────────────┘
   * A re-shown login window's auth-set-user arrives while pending → no-op → no loop.
   * Cleared by: revealLiveEditorNow() (LiveEditor shown + leftover login closed) / auth-logout → clearLoginHandoff()
   * ```
   *
   * @param sender - `event.sender` of the `auth-set-user` IPC.
   * @returns Nothing.
   * @example
   * windowManager.completeLogin(event.sender)
   */
  completeLogin(sender: WebContents): void {
    const loginWindow = this.loginWindow
    if (!loginWindow || loginWindow.isDestroyed()) return
    if (loginWindow.webContents !== sender) return
    if (this.loginHandoffPending) return

    this.loginHandoffPending = true
    this.showLiveEditor()
    // A cached reveal already ran synchronously (latch cleared, login window
    // closed by revealLiveEditorNow); otherwise close the login window here.
    if (this.loginHandoffPending && !loginWindow.isDestroyed()) {
      loginWindow.close()
    }
  }

  /**
   * Clear the login handoff latch so the next sign-in hands off again. Called
   * from `auth-logout`; the other release is a successful LiveEditor reveal.
   *
   * @returns Nothing.
   * @example
   * windowManager.clearLoginHandoff()
   */
  clearLoginHandoff(): void {
    this.loginHandoffPending = false
  }

  // ==========================================================================
  // Panel load-failure recovery
  // ==========================================================================

  /**
   * Drive a never-loaded panel back to life after a main-frame load failure:
   * silently retry with linear backoff, then — once retries are exhausted —
   * surface a NATIVE recovery dialog. Main-process owned because a never-loaded
   * renderer can't render its own error page; the dialog is native (not bundled
   * HTML) because electron-builder can drop asar leaf deps. Idempotent while a
   * retry timer or dialog is in flight for the same window.
   *
   * @param target - The window whose load failed; keys the retry state.
   * @param options - How to retry / dismiss / parent the dialog for this panel.
   * @returns Nothing — schedules a retry or opens the recovery dialog as a side effect.
   * @example
   * // offline boot: retries 3× (800/1600/2400 ms) then shows the dialog
   * this.recoverPanelFromLoadFailure(loginWindow, { retry, dismiss, parent: loginWindow })
   */
  private recoverPanelFromLoadFailure(
    target: BrowserWindow,
    options: PanelLoadRecoveryOptions,
  ): void {
    if (target.isDestroyed()) return

    const state = this.loadRecovery.get(target) ?? {
      attempts: 0,
      pending: false,
    }
    this.loadRecovery.set(target, state)
    // A retry timer or dialog is already in flight — don't stack them.
    if (state.pending) return
    state.pending = true

    // Still within the silent-retry budget: schedule a backed-off reload,
    // bound to the window that ACTUALLY failed (never a replacement).
    if (state.attempts < PANEL_LOAD_MAX_RETRIES) {
      state.attempts += 1
      setTimeout(() => {
        if (target.isDestroyed()) return
        state.pending = false
        options.retry()
      }, PANEL_LOAD_RETRY_BASE_MS * state.attempts)
      return
    }

    // Retries exhausted. Show the parent FIRST: a window-modal sheet attached
    // to a non-visible window may never render on macOS.
    options.parent?.show()
    void this.promptPanelLoadFailure(target, options)
  }

  /**
   * Native "couldn't reach corelive.app" recovery dialog shown when a panel
   * exhausts its silent reload retries. Either choice ends this recovery cycle
   * (a later failure starts a fresh one); Retry reloads, Close runs the panel's
   * dismiss action. Parentless when the panel is a hidden transparent window.
   *
   * @param target - The window being recovered.
   * @param options - Retry / dismiss actions, dialog parent and optional HTTP status.
   * @returns A promise that settles once the user picks Retry or Close.
   * @example
   * void this.promptPanelLoadFailure(loginWindow, options)
   */
  private async promptPanelLoadFailure(
    target: BrowserWindow,
    options: PanelLoadRecoveryOptions,
  ): Promise<void> {
    const messageBoxOptions: Electron.MessageBoxOptions = {
      type: 'warning',
      message: "Couldn't reach corelive.app",
      detail:
        options.httpStatus === undefined
          ? 'Check your internet connection, then try again.'
          : `corelive.app returned HTTP ${options.httpStatus}. Try again in a moment.`,
      buttons: ['Retry', 'Close'],
      defaultId: 0,
      cancelId: 1,
    }
    const { response } = options.parent
      ? await dialog.showMessageBox(options.parent, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions)

    // Clean slate either way so the next failure restarts the backoff sequence.
    this.loadRecovery.delete(target)
    if (target.isDestroyed()) return

    if (response === 0) {
      options.retry()
      return
    }
    options.dismiss()
  }

  // ==========================================================================
  // LiveEditor panel
  // ==========================================================================

  /**
   * Create the LiveEditor Note window — a frameless, transparent, always-on-top
   * panel that loads `${baseUrl}/live-editor`.
   *
   * Why frameless + transparent: the panel sits over other apps as a calm
   * scratchpad; the renderer paints its own chrome (titlebar, opacity slider).
   *
   * Why we cap opacity 0.30–1.00: lower than 0.30 makes the window
   * undiscoverable; the cap is enforced both here and at config persist time.
   *
   * @returns The (possibly already-existing) LiveEditor BrowserWindow.
   */
  createLiveEditorWindow(): BrowserWindow {
    if (this.liveEditorWindow) {
      return this.liveEditorWindow
    }

    const windowOptions: WindowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('liveEditor')
      : {
          width: 480,
          height: 640,
          minWidth: 320,
          minHeight: 320,
          maxWidth: 1200,
          frame: false,
          alwaysOnTop: this.getLiveEditorAlwaysOnTop(),
          resizable: true,
          skipTaskbar: true,
        }

    const initialOpacity = this.getLiveEditorOpacity()

    log.debug('Creating LiveEditor window...', {
      windowOptions,
      initialOpacity,
      isDev: this.isDev,
    })

    const liveEditorPreloadPath = path.join(
      __dirname,
      '..',
      'preload',
      'preload-live-editor.cjs',
    )

    this.liveEditorWindow = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: liveEditorPreloadPath,
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
      alwaysOnTop: this.getLiveEditorAlwaysOnTop(),
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

    this.liveEditorWindow.setOpacity(initialOpacity)

    const liveEditorUrl = this.getPanelUrl('liveEditor')

    log.debug('Loading LiveEditor URL:', liveEditorUrl)
    this.liveEditorHasLoadedOnce = false
    this.liveEditorRevealPending = false
    this.cancelLiveEditorReveal = null
    this.liveEditorNeedsReloadBeforeReveal = false
    this.liveEditorWindow.loadURL(liveEditorUrl)

    this.liveEditorWindow.on('resize', () => {
      if (this.windowStateManager && this.liveEditorWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'liveEditor',
          this.liveEditorWindow,
        )
      }
    })

    this.liveEditorWindow.on('move', () => {
      if (this.windowStateManager && this.liveEditorWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'liveEditor',
          this.liveEditorWindow,
        )
      }
    })

    // 'close' fires before destruction — capture bounds while the window
    // is still alive.
    this.liveEditorWindow.on('close', () => {
      this.saveWindowState()
    })

    this.liveEditorWindow.on('closed', () => {
      log.debug('LiveEditor window closed')
      this.liveEditorWindow = null
      this.liveEditorHasLoadedOnce = false
      this.liveEditorRevealPending = false
      this.cancelLiveEditorReveal = null
      this.liveEditorNeedsReloadBeforeReveal = false
    })

    this.liveEditorWindow.webContents.on(
      'render-process-gone',
      (_event, details) => {
        log.error('LiveEditor process gone:', { reason: details.reason })
      },
    )

    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState(
        'liveEditor',
        this.liveEditorWindow,
      )
    }

    this.applyVisibleOnAllWorkspaces(
      this.liveEditorWindow,
      this.getLiveEditorVisibleOnAllWorkspaces(),
    )

    return this.liveEditorWindow
  }

  /**
   * Toggles LiveEditor and reports its eventual authenticated reveal to shortcut-only callers.
   * @param onShown - Optional callback fired only after the panel is visibly shown.
   * @returns True when an open was requested, false when it was hidden or canceled.
   * @example
   * windowManager.toggleLiveEditor(() => playOpeningCue())
   */
  toggleLiveEditor(onShown?: () => void): boolean {
    if (!this.liveEditorWindow || this.liveEditorWindow.isDestroyed()) {
      this.createLiveEditorWindow()
      this.showLiveEditor(onShown)
      return true
    }

    if (this.liveEditorWindow.isVisible()) {
      this.hideLiveEditor()
      return false
    }

    if (this.liveEditorRevealPending) {
      this.cancelPendingLiveEditorReveal()
      // A user cancel ends any login handoff riding on this load; the next
      // sign-in must be able to hand off again (the latch only guards a load
      // that is still in flight).
      this.loginHandoffPending = false
      return false
    }

    this.showLiveEditor(onShown)
    return true
  }

  /**
   * Show LiveEditor only after its protected route settles; signed-out redirects surface the login window instead.
   * @param onShown - Optional callback fired after the authenticated panel appears.
   * @returns void.
   * @example
   * windowManager.showLiveEditor(() => playOpeningCue())
   */
  showLiveEditor(onShown?: () => void): void {
    const liveEditorWindow =
      !this.liveEditorWindow || this.liveEditorWindow.isDestroyed()
        ? this.createLiveEditorWindow()
        : this.liveEditorWindow

    this.revealLiveEditorAfterAuthGate(liveEditorWindow, onShown)
  }

  /**
   * Reveal a manual LiveEditor open only when it is on the editor route; auth pages are always re-homed to the login window.
   * @param panel - Hidden LiveEditor window whose current navigation decides whether it can appear.
   * @param onShown - Optional callback fired only after the panel is visibly shown.
   * @returns void.
   * @example
   * this.revealLiveEditorAfterAuthGate(this.createLiveEditorWindow(), onShown)
   */
  private revealLiveEditorAfterAuthGate(
    panel: BrowserWindow,
    onShown?: () => void,
  ): void {
    if (panel.isDestroyed()) return

    const currentUrl = panel.webContents.getURL()

    if (
      this.liveEditorNeedsReloadBeforeReveal ||
      (currentUrl && this.isAuthPathname(currentUrl))
    ) {
      // The old hidden window is parked on /login (or an error page); reload the
      // protected editor route so a later signed-in open can reach LiveEditor.
      this.liveEditorHasLoadedOnce = false
      this.cancelPendingLiveEditorReveal()
      this.liveEditorNeedsReloadBeforeReveal = false
      panel.loadURL(this.getPanelUrl('liveEditor'))
    }

    if (this.liveEditorHasLoadedOnce) {
      this.revealLiveEditorNow(panel, onShown)
      return
    }

    // A prior manual show is already waiting for the redirect/load decision.
    if (this.liveEditorRevealPending) return

    this.watchManualLiveEditorLoad(panel, onShown)
  }

  /**
   * The single place LiveEditor becomes visible: latch the loaded route, release
   * the login handoff, close any login window left over from a fallback re-show,
   * then show + focus. Shared by the cached reveal and both load watchers.
   *
   * @param panel - LiveEditor window sitting on its authenticated editor route.
   * @param onShown - Optional callback fired after the panel is visible.
   * @returns Nothing.
   * @example
   * this.revealLiveEditorNow(panel, onShown)
   */
  private revealLiveEditorNow(
    panel: BrowserWindow,
    onShown?: () => void,
  ): void {
    this.liveEditorHasLoadedOnce = true
    this.liveEditorNeedsReloadBeforeReveal = false
    this.loginHandoffPending = false
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.close()
    }
    panel.show()
    panel.focus()
    onShown?.()
  }

  /**
   * Wire the did-navigate / did-finish-load / did-fail-load trio that decides a
   * hidden LiveEditor load, shared by the startup and manual watchers. Auth pages
   * and network failures settle as unauthenticated; HTTP 4xx/5xx pages (a
   * SUCCESSFUL navigation, never `did-fail-load`) keep the watch alive and
   * self-heal in place through {@link recoverPanelFromLoadFailure}.
   *
   * @param panel - Hidden LiveEditor window that has started loading `/live-editor`.
   * @param onSettled - Receives the one-time authenticated / unauthenticated decision.
   * @returns A stop function: detaches the listeners and reports whether the watch was still undecided.
   * @example
   * const stopWatching = this.watchLiveEditorNavigation(panel, (authenticated) => { ... })
   */
  private watchLiveEditorNavigation(
    panel: BrowserWindow,
    onSettled: (authenticated: boolean) => void,
  ): () => boolean {
    const { webContents } = panel
    const removeListeners: Array<() => void> = []
    // Guard so the decision is made exactly once per load, even though
    // `did-navigate`, `did-finish-load` and `did-fail-load` can all fire.
    let decided = false
    let latestMainFrameUrl = webContents.getURL() || null
    // True after an HTTP error page navigation so its did-finish-load is never
    // mistaken for the editor; the next real navigation clears it.
    let errorPagePendingFinish = false

    const stopWatching = (): boolean => {
      if (decided) return false
      decided = true
      removeListeners.forEach((remove) => remove())
      // Any in-flight retry belongs to this watch; forget its budget with it.
      this.loadRecovery.delete(panel)
      return true
    }

    const finish = (authenticated: boolean): void => {
      if (stopWatching()) onSettled(authenticated)
    }

    const onDidNavigate = (
      _event: Electron.Event,
      url: string,
      httpResponseCode: number,
    ): void => {
      latestMainFrameUrl = url
      // Auth redirects are terminal: do not let /login render inside LiveEditor.
      if (this.isAuthPathname(url)) {
        finish(false)
        return
      }
      errorPagePendingFinish = httpResponseCode >= 400
      if (!errorPagePendingFinish) return
      // corelive.app answered 4xx/5xx: keep the panel hidden and reload this
      // same window (the watch stays armed), parentless dialog on exhaustion so
      // an empty transparent panel is never shown as a dialog parent.
      this.recoverPanelFromLoadFailure(panel, {
        retry: () => {
          if (!decided) panel.loadURL(this.getPanelUrl('liveEditor'))
        },
        // Close ends this open: drop the still-armed watch so the next toggle
        // starts a fresh load instead of cancelling a reveal that never comes,
        // and keep the error page hidden until that reload.
        dismiss: () => {
          this.cancelPendingLiveEditorReveal()
          this.liveEditorNeedsReloadBeforeReveal = true
        },
        parent: null,
        httpStatus: httpResponseCode,
      })
    }

    const onDidFinishLoad = (): void => {
      if (errorPagePendingFinish) return
      // Trust the route only after load settles; unauthenticated redirects can
      // report the requested /live-editor URL before landing on /login.
      const settledUrl = webContents.getURL() || latestMainFrameUrl
      finish(settledUrl === null ? false : !this.isAuthPathname(settledUrl))
    }

    const onDidFailLoad = (
      _event: Electron.Event,
      errorCode: number,
      _errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean,
    ): void => {
      // Ignore subresource failures and normal redirect cancellations.
      if (!isMainFrame || errorCode === ERR_ABORTED) return
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

    return stopWatching
  }

  /**
   * Watch a manual LiveEditor open until it either reaches the editor or redirects to auth.
   * @param panel - LiveEditor BrowserWindow that has started loading `/live-editor`.
   * @param onShown - Optional callback fired only after an authenticated reveal.
   * @returns void.
   * @example
   * this.watchManualLiveEditorLoad(panel, onShown)
   */
  private watchManualLiveEditorLoad(
    panel: BrowserWindow,
    onShown?: () => void,
  ): void {
    this.liveEditorRevealPending = true

    const stopWatching = this.watchLiveEditorNavigation(
      panel,
      (authenticated) => {
        this.liveEditorRevealPending = false
        this.cancelLiveEditorReveal = null
        if (panel.isDestroyed()) return
        if (authenticated) {
          // Authenticated: now the editor route is safe to expose in LiveEditor.
          this.revealLiveEditorNow(panel, onShown)
          return
        }
        this.suppressLiveEditorAuthRedirect(panel)
      },
    )

    const cancelReveal = (): void => {
      if (!stopWatching()) return
      this.liveEditorRevealPending = false
      this.liveEditorHasLoadedOnce = false
      this.liveEditorNeedsReloadBeforeReveal = true
      this.cancelLiveEditorReveal = null
      // A toggle-off before load settlement must keep LiveEditor hidden.
      if (!panel.isDestroyed()) panel.hide()
    }
    this.cancelLiveEditorReveal = cancelReveal
  }

  /**
   * Hide LiveEditor when it hits auth and show the login window as the only sign-in surface.
   *
   * @param panel - LiveEditor BrowserWindow that attempted to host an auth page.
   * @returns void.
   * @example
   * this.suppressLiveEditorAuthRedirect(panel)
   */
  private suppressLiveEditorAuthRedirect(panel: BrowserWindow): void {
    this.liveEditorHasLoadedOnce = false
    this.liveEditorRevealPending = false
    this.cancelLiveEditorReveal = null
    this.liveEditorNeedsReloadBeforeReveal = true
    panel.hide()
    // Direct, not restoreFromTray(): that now opens LiveEditor and would loop.
    this.showLoginWindow()
  }

  /**
   * Cancels every pending LiveEditor reveal (manual and startup) when callers toggle it off, reload it, or shut down before navigation settles.
   *
   * @returns void.
   * @example
   * this.cancelPendingLiveEditorReveal()
   */
  private cancelPendingLiveEditorReveal(): void {
    // A reload or toggle-off supersedes any startup gate still waiting on the old load.
    for (const cancelStartupPanelLoad of [
      ...this.startupPanelLoadCancellations,
    ]) {
      cancelStartupPanelLoad()
    }
    this.startupPanelLoadCancellations.clear()

    if (this.cancelLiveEditorReveal) {
      this.cancelLiveEditorReveal()
      return
    }

    this.liveEditorRevealPending = false
  }

  /** Hide the LiveEditor window without destroying it (instant re-show). */
  hideLiveEditor(): void {
    if (this.liveEditorWindow && !this.liveEditorWindow.isDestroyed()) {
      this.liveEditorWindow.hide()
    }
  }

  /**
   * Set LiveEditor opacity, clamped to [0.30, 1.00] and persisted to config.
   *
   * @param value - Desired opacity (out-of-band values are clamped silently).
   * @returns The opacity actually applied (post-clamp).
   * @example
   * windowManager.setLiveEditorOpacity(0.85) // → 0.85
   * windowManager.setLiveEditorOpacity(0.10) // → 0.30 (clamped)
   */
  setLiveEditorOpacity(value: number): number {
    const clamped = Math.max(0.3, Math.min(1, value))

    if (this.liveEditorWindow && !this.liveEditorWindow.isDestroyed()) {
      this.liveEditorWindow.setOpacity(clamped)
    }

    if (this.configManager) {
      this.configManager.set('liveEditor.opacity', clamped)
    }

    return clamped
  }

  /** Read current LiveEditor opacity (live window value, else config, else 1). */
  getLiveEditorOpacity(): number {
    if (this.liveEditorWindow && !this.liveEditorWindow.isDestroyed()) {
      return this.liveEditorWindow.getOpacity()
    }
    // Coerce + clamp the persisted value: a hand-edited config or a stale
    // value from before the clamp was introduced could otherwise hand the
    // renderer something out of [0.30, 1.00].
    const raw = this.configManager?.get('liveEditor.opacity', 1) ?? 1
    const numeric = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(numeric)) return 1
    return Math.max(0.3, Math.min(1, numeric))
  }

  /** Get the LiveEditor BrowserWindow (or null if not yet created). */
  getLiveEditorWindow(): BrowserWindow | null {
    return this.liveEditorWindow
  }

  /** Whether the LiveEditor window currently exists (and is not destroyed). */
  hasLiveEditorWindow(): boolean {
    return Boolean(
      this.liveEditorWindow && !this.liveEditorWindow.isDestroyed(),
    )
  }

  /**
   * Surface the app from the tray / dock / notification click / deep link:
   * opens LiveEditor, whose auth gate re-homes a signed-out user to the login
   * window. Shared chokepoint for every native-chrome caller that "restores the
   * app". Deliberately no `hasLoginWindow()` short-circuit — this is also the
   * retry path while a login handoff is pending.
   *
   * @example
   * // tray click / dock activate / notification click all call:
   * windowManager.restoreFromTray()
   */
  restoreFromTray(): void {
    this.showLiveEditor()
  }

  // ==========================================================================
  // Startup panel orchestration (nav-watch auth gate)
  // ==========================================================================

  /**
   * Build a panel's URL from the configured server origin. Single source of
   * truth shared by the create methods, the retries and the post-login reload.
   *
   * @param kind - Which panel.
   * @returns The fully-qualified panel URL.
   * @example
   * this.getPanelUrl('login')      // => 'https://corelive.app/login-shell'
   * this.getPanelUrl('liveEditor') // => 'https://corelive.app/live-editor'
   */
  private getPanelUrl(kind: 'login' | 'liveEditor'): string {
    const baseUrl = this.serverUrl || 'https://corelive.app'
    return kind === 'login'
      ? `${baseUrl}/login-shell`
      : `${baseUrl}/live-editor`
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
   * authenticated. A panel that lands here was redirected by proxy.ts.
   *
   * @param rawUrl - Full URL from a `did-navigate` event.
   * @returns true when the pathname is `/login` or `/sign-up`.
   * @example
   * this.isAuthPathname('https://corelive.app/login?redirect_url=/live-editor') // true
   * this.isAuthPathname('https://corelive.app/login-shell')                    // false
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
   * Open the LiveEditor panel as part of Electron startup, gated on auth.
   *
   * Why this exists: a cold boot must not flash an empty window when the user
   * is signed out. We create the panel hidden, watch its first load, and only
   * `show()` it once it actually renders the editor route (not /login).
   * Called once from `main.ts`.
   *
   * @example
   * windowManager.openStartupPanel()
   */
  openStartupPanel(): void {
    this.watchStartupPanelLoad(this.createLiveEditorWindow())
  }

  /**
   * Whether the startup LiveEditor load was suppressed (auth page or load
   * failure) and the login window surfaced instead. A test-observability seam;
   * no production code reads it.
   *
   * @returns true once the startup suppress-and-surface decision was made.
   * @example
   * if (windowManager.hasStartupAuthFallback()) { ... }
   */
  hasStartupAuthFallback(): boolean {
    return this.startupAuthFallbackOccurred
  }

  /**
   * Decide the startup panel's fate from its settled load: show it if the load
   * lands on the editor route, or keep it hidden + surface the login window if
   * the load redirects to an auth page or fails (offline/timeout). HTTP error
   * pages retry in place instead (see {@link watchLiveEditorNavigation}).
   *
   * Ordering note: `createLiveEditorWindow` calls `loadURL` synchronously
   * *before* this runs. That is safe — `did-navigate` is async, so these
   * listeners register in the same tick, before the network response arrives.
   * Do NOT "fix" it by moving `loadURL`.
   *
   * @param panel - The freshly created (hidden) LiveEditor window.
   */
  private watchStartupPanelLoad(panel: BrowserWindow): void {
    const stopWatching = this.watchLiveEditorNavigation(
      panel,
      (authenticated) => {
        this.startupPanelLoadCancellations.delete(stopWatching)
        if (authenticated) {
          // Authed: reveal the panel the app starts with.
          this.revealLiveEditorNow(panel)
          return
        }
        // Signed out or offline: the login window is the only sign-in surface;
        // LiveEditor reopens from the tray / handoff after sign-in.
        this.startupAuthFallbackOccurred = true
        this.suppressLiveEditorAuthRedirect(panel)
      },
    )
    this.startupPanelLoadCancellations.add(stopWatching)
  }

  // ==========================================================================
  // Settings popover
  // ==========================================================================

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

    // Make the popover follow the active macOS Space so Settings always opens
    // on the CURRENT desktop. Without this, the window stays bound to the Space
    // it was last shown on, and reopening it after switching desktops yanks the
    // user over to that old Space (the reported "opens on another desktop" bug).
    // Unlike the LiveEditor panel (opt-in via config), this is transient tray
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

  /** Saves window state and cancels pending reveals before app shutdown closes every window.
   * @returns Nothing.
   * @example
   * windowManager.cleanup()
   */
  cleanup(): void {
    this.saveWindowState()

    // Shutdown must detach load listeners before late navigation can reveal
    // LiveEditor or open the login window.
    this.cancelPendingLiveEditorReveal()

    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close()
    }

    if (this.liveEditorWindow && !this.liveEditorWindow.isDestroyed()) {
      this.liveEditorWindow.close()
    }

    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.close()
    }
  }
}

export default WindowManager

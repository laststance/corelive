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

import {
  ERR_ABORTED,
  HTTP_ERROR_STATUS_MIN,
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
} from '@corelive/desktop-contract/constants'
import { BrowserWindow, dialog, screen } from 'electron'
import type { WebContents } from 'electron'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
import {
  isLocalEditorDocument,
  LOCAL_EDITOR_URL,
} from './offline/localEditorOrigin'
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
  /** Bundled asset failures need reinstall guidance, never a connectivity instruction. */
  localEditor?: boolean
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
  /** True after the bundled editor document has loaded in this window. */
  private liveEditorHasLoadedOnce: boolean
  /** True while the bundled editor assets are loading for a requested reveal. */
  private liveEditorRevealPending: boolean
  /** Cancels the current delayed LiveEditor reveal watcher, if one is active. */
  private cancelLiveEditorReveal: (() => void) | null
  /** True after a cancelled/failed asset load needs retry before reveal. */
  private liveEditorNeedsReloadBeforeReveal: boolean

  /** Settings window */
  private settingsWindow: BrowserWindow | null
  private settingsNeedsReload = false

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

  /** A pending hide is cancelled by a subsequent show/toggle intent. */
  private hideRequest = 0
  private hidePending = false
  private beforeEditorHide: () => Promise<boolean> = async () => true
  private onEditorShown: () => void = () => undefined
  private closingForQuit = false

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
        additionalArguments: [
          `--corelive-app-origin=${this.getWebAppOrigin()}`,
        ],
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
        // Reassign, never latch (mirrors the LiveEditor watcher): a retry that
        // outraces Chromium's error-page commit leaves the marker set with no
        // did-finish-load to consume it, so a later SUCCESSFUL navigation must
        // clear it. Latching would make the retry's real did-finish-load look
        // like the error page's, stranding the window at hasLoadedOnce=false
        // with an unreset retry budget.
        errorPagePendingFinish = httpResponseCode >= HTTP_ERROR_STATUS_MIN
        if (!errorPagePendingFinish) return
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

  /** Reveals the local editor after its exact login window reports a signed-in user.
   * The local scene owns preparation/locked/recovery feedback; it never hosts a remote auth page.
   * @example windowManager.completeLogin(event.sender)
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
      message: options.localEditor
        ? "Couldn't open LiveEditor"
        : "Couldn't reach corelive.app",
      detail: options.localEditor
        ? 'The bundled editor could not be loaded. Retry, or reinstall CoreLive if this continues. Saved writing remains on this Mac.'
        : options.httpStatus === undefined
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
      'preload-offline-editor.cjs',
    )

    this.liveEditorWindow = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        additionalArguments: [
          `--corelive-app-origin=${this.getWebAppOrigin()}`,
        ],
        nodeIntegration: false,
        contextIsolation: true,
        preload: liveEditorPreloadPath,
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: true,
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
    void Promise.resolve(this.liveEditorWindow.loadURL(liveEditorUrl)).catch(
      () => undefined,
    )

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
    this.liveEditorWindow.on('close', (event) => {
      this.saveWindowState()
      // Ordinary close keeps the current writing available until its save is acknowledged.
      if (!this.closingForQuit) {
        event.preventDefault()
        void this.hideLiveEditor()
      }
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
        this.cancelPendingLiveEditorReveal()
        this.liveEditorHasLoadedOnce = false
        this.liveEditorNeedsReloadBeforeReveal = true
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
   * Hides the focused LiveEditor or reveals it for menu, tray, IPC, and {@link ShortcutManager} callers.
   * @param onShown - Optional callback fired only after the panel is visibly shown.
   * @returns True when an open was requested, false when it was hidden or canceled.
   * @example
   * windowManager.toggleLiveEditor(() => playOpeningCue())
   */
  toggleLiveEditor(onShown?: () => void): boolean {
    if (this.hidePending) {
      this.showLiveEditor(onShown)
      return true
    }
    if (!this.liveEditorWindow || this.liveEditorWindow.isDestroyed()) {
      this.createLiveEditorWindow()
      this.showLiveEditor(onShown)
      return true
    }

    // Electron also considers panels covered by another app visible; those need focus.
    if (
      this.liveEditorWindow.isVisible() &&
      this.liveEditorWindow.isFocused() &&
      this.liveEditorHasLoadedOnce &&
      !this.liveEditorNeedsReloadBeforeReveal
    ) {
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

  /** Reveals bundled assets without waiting for authentication or connectivity.
   * @example windowManager.showLiveEditor(() => playOpeningCue())
   */
  showLiveEditor(onShown?: () => void): void {
    this.hideRequest++
    this.hidePending = false
    const panel =
      !this.liveEditorWindow || this.liveEditorWindow.isDestroyed()
        ? this.createLiveEditorWindow()
        : this.liveEditorWindow
    if (
      this.liveEditorHasLoadedOnce &&
      !this.liveEditorNeedsReloadBeforeReveal
    ) {
      this.revealLiveEditorNow(panel, onShown)
      return
    }
    if (this.liveEditorRevealPending) return
    const reload = this.liveEditorNeedsReloadBeforeReveal
    this.liveEditorNeedsReloadBeforeReveal = false
    this.watchLocalEditorLoad(panel, onShown)
    if (reload) void panel.loadURL(LOCAL_EDITOR_URL).catch(() => undefined)
  }

  /** Presents the loaded local scene, which owns ready/preparing/locked/recovery states.
   * @example this.revealLiveEditorNow(panel, onShown)
   */
  private revealLiveEditorNow(
    panel: BrowserWindow,
    onShown?: () => void,
  ): void {
    this.liveEditorHasLoadedOnce = true
    this.liveEditorNeedsReloadBeforeReveal = false
    this.loginHandoffPending = false
    if (this.loginWindow && !this.loginWindow.isDestroyed())
      this.loginWindow.close()
    panel.show()
    panel.focus()
    this.onEditorShown()
    onShown?.()
  }

  /** Retries only broken packaged assets; a network/auth failure cannot replace the editor.
   * @example this.watchLocalEditorLoad(panel, onShown)
   */
  private watchLocalEditorLoad(
    panel: BrowserWindow,
    onShown?: () => void,
  ): void {
    const { webContents } = panel
    let stopped = false
    let failed = false
    this.liveEditorRevealPending = true
    const stop = (): void => {
      if (stopped) return
      stopped = true
      webContents.removeListener('did-finish-load', onLoaded)
      webContents.removeListener('did-fail-load', onFailed)
      webContents.removeListener('did-navigate', onNavigate)
      panel.removeListener('closed', stop)
      this.loadRecovery.delete(panel)
      this.liveEditorRevealPending = false
      this.cancelLiveEditorReveal = null
    }
    const recover = (): void => {
      if (stopped) return
      failed = true
      this.recoverPanelFromLoadFailure(panel, {
        localEditor: true,
        retry: () => {
          if (!stopped) {
            failed = false
            void panel.loadURL(LOCAL_EDITOR_URL).catch(() => undefined)
          }
        },
        dismiss: () => {
          stop()
          this.liveEditorNeedsReloadBeforeReveal = true
        },
        parent: null,
      })
    }
    const onLoaded = (): void => {
      if (stopped || failed) return
      if (!isLocalEditorDocument(webContents.getURL())) {
        recover()
        return
      }
      stop()
      if (!panel.isDestroyed()) this.revealLiveEditorNow(panel, onShown)
    }
    const onFailed = (
      _event: Electron.Event,
      code: number,
      _description: string,
      _url: string,
      isMainFrame: boolean,
    ): void => {
      if (isMainFrame && code !== ERR_ABORTED) recover()
    }
    const onNavigate = (
      _event: Electron.Event,
      url: string,
      status: number,
    ): void => {
      if (!isLocalEditorDocument(url) || status >= HTTP_ERROR_STATUS_MIN)
        recover()
    }
    webContents.on('did-finish-load', onLoaded)
    webContents.on('did-fail-load', onFailed)
    webContents.on('did-navigate', onNavigate)
    panel.on('closed', stop)
    this.cancelLiveEditorReveal = (): void => {
      stop()
      this.liveEditorNeedsReloadBeforeReveal = true
      if (!panel.isDestroyed()) panel.hide()
    }
  }

  /** Cancels a delayed reveal when a shortcut toggles off or shutdown begins.
   * @example this.cancelPendingLiveEditorReveal()
   */
  private cancelPendingLiveEditorReveal(): void {
    this.cancelLiveEditorReveal?.()
    this.liveEditorRevealPending = false
  }

  /** Installs main's durable-save handshake before any ordinary hide/close.
   * @example manager.setBeforeEditorHide(() => runtime.flush())
   */
  setBeforeEditorHide(flush: () => Promise<boolean>): void {
    this.beforeEditorHide = flush
  }

  /** Refreshes cached categories after a prepared editor becomes visible.
   * @example manager.setOnEditorShown(() => controller.retryPreparation())
   */
  setOnEditorShown(callback: () => void): void {
    this.onEditorShown = callback
  }

  /** Saves the live draft before hiding; a failed save leaves recovery actions visible.
   * @example await windowManager.hideLiveEditor()
   */
  async hideLiveEditor(): Promise<void> {
    const panel = this.liveEditorWindow
    if (!panel || panel.isDestroyed()) return
    const request = ++this.hideRequest
    this.hidePending = true
    try {
      if (
        (await this.beforeEditorHide()) &&
        request === this.hideRequest &&
        !panel.isDestroyed()
      )
        panel.hide()
    } finally {
      if (request === this.hideRequest) this.hidePending = false
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
  // Panel URLs and local startup
  // ==========================================================================

  /**
   * Build a panel's URL from the configured server origin. Single source of
   * truth shared by the create methods, the retries and the post-login reload.
   *
   * @param kind - Which panel.
   * @returns The fully-qualified panel URL.
   * @example
   * this.getPanelUrl('login')      // => 'https://corelive.app/login-shell'
   * this.getPanelUrl('liveEditor') // => 'corelive-editor://app/index.html'
   */
  private getPanelUrl(kind: 'login' | 'liveEditor'): string {
    const baseUrl = this.serverUrl || 'https://corelive.app'
    return kind === 'login' ? `${baseUrl}/login-shell` : LOCAL_EDITOR_URL
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

  /** Opens the bundled editor on startup, including offline and signed-out states.
   * @example windowManager.openStartupPanel()
   */
  openStartupPanel(): void {
    this.showLiveEditor()
  }

  /** Returns the actual Settings window for native capability authorization.
   * @example const settings = windowManager.getSettingsWindow()
   */
  getSettingsWindow(): BrowserWindow | null {
    return this.settingsWindow
  }

  /** Returns the actual login window for main-frame authentication notifications.
   * @example const login = windowManager.getLoginWindow()
   */
  getLoginWindow(): BrowserWindow | null {
    return this.loginWindow
  }

  // ==========================================================================
  // Settings popover
  // ==========================================================================

  /**
   * Creates the settings window with security-first configuration.
   *
   * @returns The created settings window
   */
  createSettingsWindow(background = false): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      // A preparation timeout may have left a stale/failed remote document; retry that same window.
      if (background || this.settingsNeedsReload)
        this.reloadSettings(this.settingsWindow)
      if (!background) {
        this.settingsWindow.show()
        this.settingsWindow.focus()
      }
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
        additionalArguments: [
          `--corelive-app-origin=${this.getWebAppOrigin()}`,
        ],
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
    this.watchSettingsLoad(this.settingsWindow, background)
    this.reloadSettings(this.settingsWindow)

    // Show when ready
    if (!background)
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
      this.settingsNeedsReload = false
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
      if (this.settingsNeedsReload) this.reloadSettings(this.settingsWindow)
    } else {
      this.createSettingsWindow()
    }
  }

  /** Reloads only the configured Settings route after a preparation timeout or explicit retry.
   * @example this.reloadSettings(settings)
   */
  private reloadSettings(settings: BrowserWindow): void {
    void Promise.resolve(
      settings.loadURL(`${this.serverUrl || 'https://corelive.app'}/settings`),
    ).catch(() => undefined)
  }

  /** Keeps hidden preparation failures quiet while giving a visible Settings window Retry/Close.
   * @example this.watchSettingsLoad(settings, true)
   */
  private watchSettingsLoad(
    settings: BrowserWindow,
    background: boolean,
  ): void {
    let failed = false
    const fail = (httpStatus?: number): void => {
      failed = true
      this.settingsNeedsReload = true
      if (background && !settings.isVisible()) return
      this.recoverPanelFromLoadFailure(settings, {
        retry: () => this.reloadSettings(settings),
        dismiss: () => settings.hide(),
        parent: settings,
        httpStatus,
      })
    }
    settings.webContents.on('did-start-loading', () => {
      failed = false
    })
    settings.webContents.on(
      'did-fail-load',
      (_event, code, _description, _url, mainFrame) => {
        if (mainFrame && code !== ERR_ABORTED) fail()
      },
    )
    settings.webContents.on('did-navigate', (_event, _url, status) => {
      if (status >= HTTP_ERROR_STATUS_MIN) fail(status)
    })
    settings.webContents.on('did-finish-load', () => {
      if (failed) return
      this.settingsNeedsReload = false
      this.loadRecovery.delete(settings)
    })
    settings.webContents.on('render-process-gone', () => {
      this.settingsNeedsReload = true
    })
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

  /** Allows native updater close events after main has durably drained writing.
   * macOS closes windows before before-quit during installation, so main's prepareForQuit calls this first.
   * @example windowManager.allowWindowCloseForQuit()
   */
  allowWindowCloseForQuit(): void {
    this.closingForQuit = true
  }

  /** Saves window state and cancels pending reveals before app shutdown closes every window.
   * @returns Nothing.
   * @example
   * windowManager.cleanup()
   */
  cleanup(): void {
    this.allowWindowCloseForQuit()
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

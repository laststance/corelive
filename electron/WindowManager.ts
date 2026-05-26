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

import { BrowserWindow, screen } from 'electron'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
import type { WindowStateManager, WindowOptions } from './WindowStateManager'

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
  /** Primary application window */
  private mainWindow: BrowserWindow | null

  /** Always-on-top utility window */
  private floatingNavigator: BrowserWindow | null

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
    this.mainWindow = null
    this.floatingNavigator = null
    this.brainDumpWindow = null
    this.settingsWindow = null
    this.isDev = process.env.NODE_ENV === 'development'
    this.serverUrl = serverUrl
    this.configManager = configManager
    this.windowStateManager = windowStateManager
    this.trayFallbackMode = false
    this.getTrayBoundsProvider = null
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
      if (this.mainWindow) {
        this.windowStateManager.updateWindowState('main', this.mainWindow)
      }
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
   * Creates the main application window with security-first configuration.
   *
   * The window is always *created* (so it can be revealed later from the tray,
   * `app.activate`, or a settings change) but is only auto-shown on
   * `ready-to-show` when `showOnReady` is true. Panel-only startup configs
   * (`behavior.startup.showMain === false`) pass `false` to keep main hidden.
   *
   * @param showOnReady - Auto-show the window once its content is ready. Defaults
   *   to `true` so existing no-arg callers (and tests) preserve prior behavior.
   * @returns The created main window
   * @example
   * windowManager.createMainWindow() // visible on launch (default)
   * windowManager.createMainWindow(false) // created hidden for panel-only startup
   */
  createMainWindow(showOnReady: boolean = true): BrowserWindow {
    const windowOptions: WindowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('main')
      : { width: 1200, height: 800, minWidth: 800, minHeight: 600 }

    // Resolve preload script path (built by electron-vite).
    //
    // IMPORTANT:
    // - `dist-electron/preload/*` is packaged inside `app.asar` by electron-builder
    //   (it is included via `files: ["dist-electron/**/*", ...]`).
    // - Therefore, using `process.resourcesPath/preload/*` will fail in production
    //   unless we explicitly copy preload scripts to `extraResources`.
    //
    // This relative-to-__dirname path works in both dev and packaged builds because:
    // - Dev: __dirname = dist-electron/main
    // - Prod: __dirname = .../resources/app.asar/dist-electron/main
    const preloadPath = path.join(__dirname, '..', 'preload', 'preload.cjs')

    this.mainWindow = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        spellcheck: false,
        devTools: true,
      },
      icon: path.join(__dirname, '../build/icons/icon.icns'),
      show: false,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#ffffff',
    })

    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState('main', this.mainWindow)
    }

    // Load /home directly so already-authenticated users skip the public
    // landing page (`/`) and Clerk's proxy.ts redirects unauthenticated users
    // to /login. Without this path, Electron always opened `/`, which has no
    // auth check and made signed-in users see the Login button.
    const startUrl = `${this.serverUrl || 'https://corelive.app'}/home`
    this.mainWindow.loadURL(startUrl)

    this.mainWindow.once('ready-to-show', () => {
      // Panel-only startup configs create main hidden; skip the auto-show so
      // the user only sees the windows they asked for at launch.
      if (showOnReady) {
        this.mainWindow?.show()
      }
    })

    // Track window state changes with debouncing
    this.mainWindow.on('resize', () => {
      if (this.windowStateManager && this.mainWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })

    this.mainWindow.on('move', () => {
      if (this.windowStateManager && this.mainWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })

    this.mainWindow.on('maximize', () => {
      if (this.windowStateManager && this.mainWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })

    this.mainWindow.on('unmaximize', () => {
      if (this.windowStateManager && this.mainWindow) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })

    this.mainWindow.on('close', () => {
      this.saveWindowState()
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    return this.mainWindow
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

    // Resolve floating preload script path (built by electron-vite).
    // See `createMainWindow()` for why we avoid `process.resourcesPath` here.
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
        devTools:
          this.isDev ||
          (this.configManager?.get('advanced.enableDevTools', false) ?? false),
      },
      frame: floatingConfig.frame,
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

    const baseUrl = this.serverUrl || 'https://corelive.app'
    const floatingUrl = `${baseUrl}/floating-navigator`

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
      log.debug('Floating navigator content loaded')
    })

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

    return this.floatingNavigator
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
          alwaysOnTop: true,
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
        devTools:
          this.isDev ||
          (this.configManager?.get('advanced.enableDevTools', false) ?? false),
      },
      frame: false,
      alwaysOnTop: true,
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

    const baseUrl = this.serverUrl || 'https://corelive.app'
    const brainDumpUrl = `${baseUrl}/braindump`

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
   * Restore main window from tray.
   */
  restoreFromTray(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * Minimize main window to tray (or minimize normally in fallback mode).
   */
  minimizeToTray(): void {
    if (this.mainWindow) {
      if (this.trayFallbackMode) {
        this.mainWindow.minimize()
      } else {
        this.mainWindow.hide()
      }
    }
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
   * Get main window instance.
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * Get floating navigator instance.
   */
  getFloatingNavigator(): BrowserWindow | null {
    return this.floatingNavigator
  }

  /**
   * Check if main window exists and is not destroyed.
   */
  hasMainWindow(): boolean {
    return this.mainWindow !== null && !this.mainWindow.isDestroyed()
  }

  /**
   * Check if floating navigator exists and is not destroyed.
   */
  hasFloatingNavigator(): boolean {
    return (
      this.floatingNavigator !== null && !this.floatingNavigator.isDestroyed()
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

    const windowWidth = 360
    const windowHeight = 380
    const { x, y } = this.calculateSettingsPopoverPosition(
      windowWidth,
      windowHeight,
    )

    // Resolve preload script path (built by electron-vite).
    // See `createMainWindow()` for why we avoid `process.resourcesPath` here.
    const preloadPath = path.join(__dirname, '..', 'preload', 'preload.cjs')

    this.settingsWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x,
      y,
      resizable: false,
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
        devTools:
          this.isDev ||
          (this.configManager?.get('advanced.enableDevTools', false) ?? false),
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

    // Auto-hide on blur (popover behavior)
    this.settingsWindow.on('blur', () => {
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        this.settingsWindow.hide()
      }
    })

    // Cleanup on close
    this.settingsWindow.on('closed', () => {
      log.debug('🔧 Settings popover closed')
      this.settingsWindow = null
    })

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

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
    }
  }
}

export default WindowManager

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

import { BrowserWindow } from 'electron'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
import type { WindowStateManager, WindowOptions } from './WindowStateManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Floating window configuration */
interface FloatingConfig {
  frame: boolean
  alwaysOnTop: boolean
  resizable: boolean
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
    this.isDev = process.env.NODE_ENV === 'development'
    this.serverUrl = serverUrl
    this.configManager = configManager
    this.windowStateManager = windowStateManager
    this.trayFallbackMode = false
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
    }
  }

  /**
   * Creates the main application window with security-first configuration.
   *
   * @returns The created main window
   */
  createMainWindow(): BrowserWindow {
    const windowOptions: WindowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('main')
      : { width: 1200, height: 800, minWidth: 800, minHeight: 600 }

    this.mainWindow = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        spellcheck: false,
        devTools:
          this.isDev ||
          (this.configManager?.get('advanced.enableDevTools', false) ?? false),
      },
      icon: path.join(__dirname, '../build/icons/icon.icns'),
      show: false,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#ffffff',
    })

    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState('main', this.mainWindow)
    }

    const startUrl = this.serverUrl || 'https://corelive.app'
    this.mainWindow.loadURL(startUrl)

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
      if (this.isDev) {
        this.mainWindow?.webContents.openDevTools()
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

    this.floatingNavigator = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload-floating.cjs'),
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

    return this.floatingNavigator
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
   * Cleanup and save state before app quit.
   */
  cleanup(): void {
    this.saveWindowState()

    if (this.floatingNavigator && !this.floatingNavigator.isDestroyed()) {
      this.floatingNavigator.close()
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
    }
  }
}

export default WindowManager

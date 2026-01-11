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

const path = require('path')

const { BrowserWindow } = require('electron')

const { log } = require('./logger.cjs')

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
class WindowManager {
  /**
   * Creates a new WindowManager instance.
   *
   * @param {string|null} serverUrl - URL of the Next.js server (null uses default)
   * @param {ConfigManager|null} configManager - Manages user preferences
   * @param {WindowStateManager|null} windowStateManager - Handles window state persistence
   */
  constructor(
    serverUrl = null,
    configManager = null,
    windowStateManager = null,
  ) {
    // Window references - kept to manage lifecycle
    this.mainWindow = null // Primary application window
    this.floatingNavigator = null // Always-on-top utility window

    // Environment and configuration
    this.isDev = process.env.NODE_ENV === 'development'
    this.serverUrl = serverUrl
    this.configManager = configManager
    this.windowStateManager = windowStateManager

    // Fallback mode for when window minimize to tray fails
    this.trayFallbackMode = false
  }

  /**
   * Saves current window positions and sizes to persistent storage.
   *
   * This method is called during:
   * - Window resize/move events (debounced)
   * - Before window close
   * - App shutdown
   *
   * Why save window state?
   * - Users expect windows to appear where they left them
   * - Essential for multi-monitor setups
   * - Improves perceived app quality (feels more "native")
   */
  saveWindowState() {
    if (this.windowStateManager) {
      // Save main window state if it exists
      if (this.mainWindow) {
        this.windowStateManager.updateWindowState('main', this.mainWindow)
      }
      // Save floating window state separately
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
   * Window creation involves:
   * 1. Retrieving saved position/size or using defaults
   * 2. Configuring security settings (most important!)
   * 3. Setting up event handlers
   * 4. Loading the web content
   *
   * @returns {BrowserWindow} The created main window
   */
  createMainWindow() {
    // Restore previous window bounds or use sensible defaults
    const windowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('main')
      : { width: 1200, height: 800, minWidth: 800, minHeight: 600 }

    this.mainWindow = new BrowserWindow({
      ...windowOptions,

      /**
       * Security configuration - CRITICAL!
       * These settings prevent common Electron vulnerabilities.
       */
      webPreferences: {
        nodeIntegration: false, // Prevent direct Node.js access from web content
        contextIsolation: true, // Isolate preload script context
        enableRemoteModule: false, // Disable deprecated remote module
        preload: path.join(__dirname, 'preload.cjs'), // Secure bridge script
        webSecurity: true, // Enforce same-origin policy
        allowRunningInsecureContent: false, // Block mixed content
        experimentalFeatures: false, // Avoid unstable features
        sandbox: false, // Note: Consider enabling for extra security
        spellcheck: false, // Disable for performance

        // DevTools access - only in dev or when explicitly enabled
        devTools:
          this.isDev ||
          (this.configManager &&
            this.configManager.get('advanced.enableDevTools', false)),
      },

      // Visual configuration (macOS)
      icon: path.join(__dirname, '../build/icons/icon.icns'),
      show: false, // Hidden initially to prevent visual flash
      titleBarStyle: 'hiddenInset', // macOS native inset title bar
      backgroundColor: '#ffffff', // Prevents white flash on load
    })

    // Apply saved window state
    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState('main', this.mainWindow)
    }

    // Load the application
    // In development: local Next.js dev server
    // In production: production web app URL
    const startUrl =
      this.serverUrl ||
      (this.isDev ? 'http://localhost:3011' : 'https://corelive.app/')

    this.mainWindow.loadURL(startUrl)

    /**
     * Show window only when content is ready.
     * This prevents the "white flash" that occurs when showing
     * a window before its content has loaded.
     */
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()

      // Auto-open DevTools in development for debugging
      if (this.isDev) {
        this.mainWindow.webContents.openDevTools()
      }
    })

    /**
     * Track window state changes.
     * Uses debouncing to avoid excessive saves during resize/drag.
     * This improves performance and reduces disk writes.
     */
    this.mainWindow.on('resize', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })
    // Track all state-changing events
    this.mainWindow.on('move', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })

    // Maximize/unmaximize events need special handling
    this.mainWindow.on('maximize', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })
    this.mainWindow.on('unmaximize', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })

    /**
     * Window close handling.
     * Note: This handler may be overridden by SystemTrayManager
     * to minimize to tray instead of closing.
     */
    this.mainWindow.on('close', () => {
      this.saveWindowState()
    })

    /**
     * Cleanup when window is destroyed.
     * Important: Set to null to prevent memory leaks and
     * allow garbage collection of the BrowserWindow instance.
     */
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    return this.mainWindow
  }
  /**
   * Create the floating navigator window
   */
  createFloatingNavigator() {
    if (this.floatingNavigator) {
      return this.floatingNavigator
    }

    // Get window options from WindowStateManager
    const windowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('floating')
      : {
          width: 300,
          height: 400,
          minWidth: 250,
          minHeight: 300,
          maxWidth: 400,
        }

    // Get configuration settings
    const floatingConfig = this.configManager
      ? this.configManager.getSection('window').floating
      : { frame: false, alwaysOnTop: true, resizable: true }

    log.debug('🔹 Creating floating navigator window...', {
      windowOptions,
      floatingConfig,
      isDev: this.isDev,
    })

    this.floatingNavigator = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload-floating.cjs'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        sandbox: false,
        devTools:
          this.isDev ||
          (this.configManager &&
            this.configManager.get('advanced.enableDevTools', false)),
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
      // Hide window control buttons (red, yellow, green on macOS)
      trafficLightPosition: { x: -100, y: -100 },
    })

    // Load floating navigator page
    // In production: loads from corelive.app
    // In development: loads from local dev server
    const floatingUrl = this.serverUrl
      ? `${this.serverUrl}/floating-navigator`
      : this.isDev
        ? 'http://localhost:3011/floating-navigator'
        : 'https://corelive.app/floating-navigator'

    log.debug('🔹 Loading floating navigator URL:', floatingUrl)
    this.floatingNavigator.loadURL(floatingUrl)

    // Save state on window events with debouncing
    this.floatingNavigator.on('resize', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'floating',
          this.floatingNavigator,
        )
      }
    })
    this.floatingNavigator.on('move', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'floating',
          this.floatingNavigator,
        )
      }
    })

    this.floatingNavigator.on('closed', () => {
      log.debug('🔹 Floating navigator window closed')
      this.floatingNavigator = null
      this.saveWindowState()
    })

    // Add ready-to-show handler
    this.floatingNavigator.on('ready-to-show', () => {
      log.debug('🔹 Floating navigator ready-to-show event')
    })

    // Add did-finish-load handler
    this.floatingNavigator.webContents.on('did-finish-load', () => {
      log.debug('🔹 Floating navigator content loaded')
    })

    // Add error handler
    this.floatingNavigator.webContents.on('crashed', () => {
      log.error('🔴 Floating navigator content crashed')
    })

    // Apply saved window state
    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState(
        'floating',
        this.floatingNavigator,
      )
    }

    return this.floatingNavigator
  }

  /**
   * Toggle floating navigator visibility
   */
  toggleFloatingNavigator() {
    log.debug('🔹 toggleFloatingNavigator called', {
      hasWindow: !!this.floatingNavigator,
      isVisible: this.floatingNavigator?.isVisible?.(),
    })

    if (!this.floatingNavigator) {
      log.info('🔹 Creating floating navigator...')
      this.createFloatingNavigator()
      log.info('🔹 Showing floating navigator...')
      this.floatingNavigator.show()
    } else if (this.floatingNavigator.isVisible()) {
      log.info('🔹 Hiding floating navigator')
      this.floatingNavigator.hide()
    } else {
      log.info('🔹 Showing floating navigator')
      this.floatingNavigator.show()
    }

    this.saveWindowState()
  }

  /**
   * Shows the floating navigator window.
   *
   * Creates the window if it doesn't exist, then makes it visible.
   * Used when user explicitly wants to see the floating window.
   */
  showFloatingNavigator() {
    if (!this.floatingNavigator) {
      this.createFloatingNavigator()
    }
    this.floatingNavigator.show()
    this.saveWindowState() // Save visibility state
  }

  /**
   * Hides the floating navigator window without destroying it.
   *
   * Keeps the window in memory for quick access later.
   * Useful for temporary hiding without losing window state.
   */
  hideFloatingNavigator() {
    if (this.floatingNavigator) {
      this.floatingNavigator.hide()
      this.saveWindowState() // Save hidden state
    }
  }

  /**
   * Restore main window from tray
   */
  restoreFromTray() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * Minimize main window to tray (or minimize normally in fallback mode)
   */
  minimizeToTray() {
    if (this.mainWindow) {
      if (this.trayFallbackMode) {
        // In fallback mode, minimize normally instead of hiding
        this.mainWindow.minimize()
      } else {
        this.mainWindow.hide()
      }
    }
  }

  /**
   * Set tray fallback mode
   */
  setTrayFallbackMode(enabled) {
    this.trayFallbackMode = enabled
  }

  /**
   * Check if in tray fallback mode
   */
  isTrayFallbackMode() {
    return this.trayFallbackMode
  }

  /**
   * Get main window instance
   */
  getMainWindow() {
    return this.mainWindow
  }

  /**
   * Get floating navigator instance
   */
  getFloatingNavigator() {
    return this.floatingNavigator
  }

  /**
   * Check if main window exists and is not destroyed
   */
  hasMainWindow() {
    return this.mainWindow && !this.mainWindow.isDestroyed()
  }

  /**
   * Check if floating navigator exists and is not destroyed
   */
  hasFloatingNavigator() {
    return this.floatingNavigator && !this.floatingNavigator.isDestroyed()
  }

  /**
   * Cleanup and save state before app quit
   */
  cleanup() {
    this.saveWindowState()

    if (this.floatingNavigator && !this.floatingNavigator.isDestroyed()) {
      this.floatingNavigator.close()
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
    }
  }
}

module.exports = WindowManager

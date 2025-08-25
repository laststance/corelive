const path = require('path')

const { BrowserWindow } = require('electron')

class WindowManager {
  constructor(
    serverUrl = null,
    configManager = null,
    windowStateManager = null,
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
   * Save window state using WindowStateManager
   */
  saveWindowState() {
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
   * Create the main application window
   */
  createMainWindow() {
    // Get window options from WindowStateManager
    const windowOptions = this.windowStateManager
      ? this.windowStateManager.getWindowOptions('main')
      : { width: 1200, height: 800, minWidth: 800, minHeight: 600 }

    // Configuration settings are handled by WindowStateManager

    this.mainWindow = new BrowserWindow({
      ...windowOptions,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.cjs'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        sandbox: false,
        spellcheck: false,
        devTools:
          this.isDev ||
          (this.configManager &&
            this.configManager.get('advanced.enableDevTools', false)),
      },
      icon: path.join(__dirname, '../public/favicon.ico'),
      show: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      backgroundColor: '#ffffff',
    })

    // Apply saved window state
    if (this.windowStateManager) {
      this.windowStateManager.applyWindowState('main', this.mainWindow)
    }

    // Load the application
    const startUrl =
      this.serverUrl ||
      (this.isDev ? 'http://localhost:3000' : 'http://localhost:3000')

    this.mainWindow.loadURL(startUrl)

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()

      if (this.isDev) {
        this.mainWindow.webContents.openDevTools()
      }
    })

    // Save state on window events with debouncing
    this.mainWindow.on('resize', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })
    this.mainWindow.on('move', () => {
      if (this.windowStateManager) {
        this.windowStateManager.updateWindowStateDebounced(
          'main',
          this.mainWindow,
        )
      }
    })
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

    // Handle window close - will be overridden by SystemTrayManager
    this.mainWindow.on('close', () => {
      this.saveWindowState()
    })

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
    })

    // Load floating navigator page
    const floatingUrl = this.serverUrl
      ? `${this.serverUrl}/floating-navigator`
      : this.isDev
        ? 'http://localhost:3000/floating-navigator'
        : 'http://localhost:3000/floating-navigator'

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
      this.floatingNavigator = null
      this.saveWindowState()
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
    if (!this.floatingNavigator) {
      this.createFloatingNavigator()
      this.floatingNavigator.show()
    } else if (this.floatingNavigator.isVisible()) {
      this.floatingNavigator.hide()
    } else {
      this.floatingNavigator.show()
    }

    this.saveWindowState()
  }

  /**
   * Show floating navigator
   */
  showFloatingNavigator() {
    if (!this.floatingNavigator) {
      this.createFloatingNavigator()
    }
    this.floatingNavigator.show()
    this.saveWindowState()
  }

  /**
   * Hide floating navigator
   */
  hideFloatingNavigator() {
    if (this.floatingNavigator) {
      this.floatingNavigator.hide()
      this.saveWindowState()
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
    console.log(`Tray fallback mode ${enabled ? 'enabled' : 'disabled'}`)
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

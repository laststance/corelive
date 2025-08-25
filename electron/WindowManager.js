const fs = require('fs')
const path = require('path')

const { BrowserWindow, screen } = require('electron')

class WindowManager {
  constructor(serverUrl = null) {
    this.mainWindow = null
    this.floatingNavigator = null
    this.configPath = path.join(__dirname, 'window-state.json')
    this.isDev = process.env.NODE_ENV === 'development'
    this.serverUrl = serverUrl
  }

  /**
   * Load window state from persistent storage
   */
  loadWindowState() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('Failed to load window state:', error)
    }

    // Return default state if no saved state exists
    return {
      main: {
        width: 1200,
        height: 800,
        x: undefined,
        y: undefined,
        isMaximized: false,
      },
      floating: {
        width: 300,
        height: 400,
        x: undefined,
        y: undefined,
        isVisible: false,
      },
    }
  }

  /**
   * Save window state to persistent storage
   */
  saveWindowState() {
    try {
      const state = {
        main: this.getMainWindowState(),
        floating: this.getFloatingNavigatorState(),
      }

      fs.writeFileSync(this.configPath, JSON.stringify(state, null, 2))
    } catch (error) {
      console.error('Failed to save window state:', error)
    }
  }

  /**
   * Get current main window state
   */
  getMainWindowState() {
    if (!this.mainWindow) return null

    const bounds = this.mainWindow.getBounds()
    return {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: this.mainWindow.isMaximized(),
    }
  }

  /**
   * Get current floating navigator state
   */
  getFloatingNavigatorState() {
    if (!this.floatingNavigator) return null

    const bounds = this.floatingNavigator.getBounds()
    return {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isVisible: this.floatingNavigator.isVisible(),
    }
  }

  /**
   * Ensure window is visible on screen
   */
  ensureVisibleOnSomeDisplay(windowState) {
    const displays = screen.getAllDisplays()
    let isVisible = false

    for (const display of displays) {
      const { x, y, width, height } = display.workArea
      if (
        windowState.x >= x &&
        windowState.y >= y &&
        windowState.x < x + width &&
        windowState.y < y + height
      ) {
        isVisible = true
        break
      }
    }

    if (!isVisible) {
      // Reset to center of primary display
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.workAreaSize
      windowState.x = Math.round((width - windowState.width) / 2)
      windowState.y = Math.round((height - windowState.height) / 2)
    }

    return windowState
  }

  /**
   * Create the main application window
   */
  createMainWindow() {
    const savedState = this.loadWindowState()
    const mainState = this.ensureVisibleOnSomeDisplay(savedState.main)

    this.mainWindow = new BrowserWindow({
      width: mainState.width,
      height: mainState.height,
      x: mainState.x,
      y: mainState.y,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        sandbox: false,
        spellcheck: false,
        devTools: this.isDev,
      },
      icon: path.join(__dirname, '../public/favicon.ico'),
      show: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
    })

    // Restore maximized state
    if (mainState.isMaximized) {
      this.mainWindow.maximize()
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

    // Save state on window events
    this.mainWindow.on('resize', () => this.saveWindowState())
    this.mainWindow.on('move', () => this.saveWindowState())
    this.mainWindow.on('maximize', () => this.saveWindowState())
    this.mainWindow.on('unmaximize', () => this.saveWindowState())

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

    const savedState = this.loadWindowState()
    const floatingState = this.ensureVisibleOnSomeDisplay(savedState.floating)

    this.floatingNavigator = new BrowserWindow({
      width: floatingState.width,
      height: floatingState.height,
      x: floatingState.x,
      y: floatingState.y,
      minWidth: 250,
      minHeight: 300,
      maxWidth: 400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload-floating.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        sandbox: false,
        devTools: this.isDev,
      },
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
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

    // Save state on window events
    this.floatingNavigator.on('resize', () => this.saveWindowState())
    this.floatingNavigator.on('move', () => this.saveWindowState())

    this.floatingNavigator.on('closed', () => {
      this.floatingNavigator = null
      this.saveWindowState()
    })

    // Show if it was visible before
    if (floatingState.isVisible) {
      this.floatingNavigator.show()
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
   * Minimize main window to tray
   */
  minimizeToTray() {
    if (this.mainWindow) {
      this.mainWindow.hide()
    }
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

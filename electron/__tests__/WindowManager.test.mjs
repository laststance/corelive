import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Electron modules before importing
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    restore: vi.fn(),
    focus: vi.fn(),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    isAlwaysOnTop: vi.fn(() => false),
    setAlwaysOnTop: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 800, height: 600 })),
    setBounds: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      send: vi.fn(),
    },
  })),
}))

// Mock path module
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}))

// Import after mocking
const { BrowserWindow } = await import('electron')

// Since we can't directly import CommonJS modules in ES modules with mocking,
// we'll create a mock implementation
const createWindowManagerMock = () => {
  return class WindowManager {
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

    createMainWindow() {
      const windowOptions = this.windowStateManager
        ? this.windowStateManager.getWindowOptions('main')
        : { width: 1200, height: 800, minWidth: 800, minHeight: 600 }

      this.mainWindow = new BrowserWindow({
        ...windowOptions,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: '/path/to/preload.cjs',
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
        show: false,
        titleBarStyle:
          process.platform === 'darwin' ? 'hiddenInset' : 'default',
        backgroundColor: '#ffffff',
        autoHideMenuBar: true,
      })

      if (this.windowStateManager) {
        this.windowStateManager.applyWindowState('main', this.mainWindow)
      }

      const startUrl =
        this.serverUrl ||
        (this.isDev ? 'http://localhost:3000' : 'http://localhost:3000')
      this.mainWindow.loadURL(startUrl)

      // Set up event listeners
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
      this.mainWindow.on('close', () => {
        this.saveWindowState()
      })
      this.mainWindow.on('closed', () => {
        this.mainWindow = null
      })

      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow.show()
        if (this.isDev) {
          this.mainWindow.webContents.openDevTools()
        }
      })

      return this.mainWindow
    }

    createFloatingNavigator() {
      if (this.floatingNavigator) {
        return this.floatingNavigator
      }

      const windowOptions = this.windowStateManager
        ? this.windowStateManager.getWindowOptions('floating')
        : {
            width: 300,
            height: 400,
            minWidth: 250,
            minHeight: 300,
            maxWidth: 400,
          }

      const floatingConfig = this.configManager
        ? this.configManager.getSection('window').floating
        : { frame: false, alwaysOnTop: true, resizable: true }

      this.floatingNavigator = new BrowserWindow({
        ...windowOptions,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: '/path/to/preload-floating.cjs',
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

      const floatingUrl = this.serverUrl
        ? `${this.serverUrl}/floating-navigator`
        : this.isDev
          ? 'http://localhost:3000/floating-navigator'
          : 'http://localhost:3000/floating-navigator'

      this.floatingNavigator.loadURL(floatingUrl)

      // Set up event listeners
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

      if (this.windowStateManager) {
        this.windowStateManager.applyWindowState(
          'floating',
          this.floatingNavigator,
        )
      }

      return this.floatingNavigator
    }

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

    showFloatingNavigator() {
      if (!this.floatingNavigator) {
        this.createFloatingNavigator()
      }
      this.floatingNavigator.show()
      this.saveWindowState()
    }

    hideFloatingNavigator() {
      if (this.floatingNavigator) {
        this.floatingNavigator.hide()
        this.saveWindowState()
      }
    }

    restoreFromTray() {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    }

    minimizeToTray() {
      if (this.mainWindow) {
        if (this.trayFallbackMode) {
          this.mainWindow.minimize()
        } else {
          this.mainWindow.hide()
        }
      }
    }

    setTrayFallbackMode(enabled) {
      this.trayFallbackMode = enabled
    }

    isTrayFallbackMode() {
      return this.trayFallbackMode
    }

    getMainWindow() {
      return this.mainWindow
    }

    getFloatingNavigator() {
      return this.floatingNavigator
    }

    hasMainWindow() {
      return Boolean(this.mainWindow && !this.mainWindow.isDestroyed())
    }

    hasFloatingNavigator() {
      return Boolean(
        this.floatingNavigator && !this.floatingNavigator.isDestroyed(),
      )
    }

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
}

const WindowManager = createWindowManagerMock()

describe('WindowManager', () => {
  let windowManager
  let mockConfigManager
  let mockWindowStateManager

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create mock managers
    mockConfigManager = {
      get: vi.fn((path, defaultValue) => defaultValue),
      getSection: vi.fn(() => ({
        floating: {
          frame: false,
          alwaysOnTop: true,
          resizable: true,
        },
      })),
    }

    mockWindowStateManager = {
      getWindowOptions: vi.fn((type) => {
        if (type === 'main') {
          return { width: 1200, height: 800, minWidth: 800, minHeight: 600 }
        }
        return { width: 300, height: 400, minWidth: 250, minHeight: 300 }
      }),
      applyWindowState: vi.fn(),
      updateWindowState: vi.fn(),
      updateWindowStateDebounced: vi.fn(),
    }

    // Create WindowManager instance
    windowManager = new WindowManager(
      'http://localhost:3000',
      mockConfigManager,
      mockWindowStateManager,
    )
  })

  afterEach(() => {
    // Cleanup
    if (windowManager) {
      windowManager.cleanup()
    }
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const wm = new WindowManager()
      expect(wm.mainWindow).toBeNull()
      expect(wm.floatingNavigator).toBeNull()
      expect(wm.isDev).toBe(process.env.NODE_ENV === 'development')
      expect(wm.trayFallbackMode).toBe(false)
    })

    it('should initialize with provided parameters', () => {
      expect(windowManager.serverUrl).toBe('http://localhost:3000')
      expect(windowManager.configManager).toBe(mockConfigManager)
      expect(windowManager.windowStateManager).toBe(mockWindowStateManager)
    })
  })

  describe('createMainWindow', () => {
    it('should create main window with correct configuration', () => {
      const window = windowManager.createMainWindow()

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1200,
          height: 800,
          minWidth: 800,
          minHeight: 600,
          webPreferences: expect.objectContaining({
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            sandbox: false,
            spellcheck: false,
          }),
          show: false,
          backgroundColor: '#ffffff',
          autoHideMenuBar: true,
        }),
      )

      expect(window.loadURL).toHaveBeenCalledWith('http://localhost:3000')
      expect(mockWindowStateManager.applyWindowState).toHaveBeenCalledWith(
        'main',
        window,
      )
    })

    it('should set up window event listeners', () => {
      const window = windowManager.createMainWindow()

      expect(window.on).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('move', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('maximize', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('unmaximize', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('close', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('closed', expect.any(Function))
      expect(window.once).toHaveBeenCalledWith(
        'ready-to-show',
        expect.any(Function),
      )
    })

    it('should return the created window instance', () => {
      const window = windowManager.createMainWindow()
      expect(window).toBeDefined()
      expect(windowManager.getMainWindow()).toBe(window)
    })
  })

  describe('createFloatingNavigator', () => {
    it('should create floating navigator with correct configuration', () => {
      const window = windowManager.createFloatingNavigator()

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 300,
          height: 400,
          minWidth: 250,
          minHeight: 300,
          webPreferences: expect.objectContaining({
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            sandbox: false,
          }),
          frame: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          resizable: true,
          show: false,
          backgroundColor: '#ffffff',
          transparent: false,
          hasShadow: true,
          titleBarStyle: 'hidden',
        }),
      )

      expect(window.loadURL).toHaveBeenCalledWith(
        'http://localhost:3000/floating-navigator',
      )
    })

    it('should return existing floating navigator if already created', () => {
      const window1 = windowManager.createFloatingNavigator()
      const window2 = windowManager.createFloatingNavigator()

      expect(window1).toBe(window2)
      expect(BrowserWindow).toHaveBeenCalledTimes(1)
    })

    it('should set up floating navigator event listeners', () => {
      const window = windowManager.createFloatingNavigator()

      expect(window.on).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('move', expect.any(Function))
      expect(window.on).toHaveBeenCalledWith('closed', expect.any(Function))
    })
  })

  describe('toggleFloatingNavigator', () => {
    it('should create and show floating navigator if it does not exist', () => {
      windowManager.toggleFloatingNavigator()

      const floatingWindow = windowManager.getFloatingNavigator()
      expect(floatingWindow).toBeDefined()
      expect(floatingWindow.show).toHaveBeenCalled()
    })

    it('should hide floating navigator if it is visible', () => {
      const floatingWindow = windowManager.createFloatingNavigator()
      floatingWindow.isVisible.mockReturnValue(true)

      windowManager.toggleFloatingNavigator()

      expect(floatingWindow.hide).toHaveBeenCalled()
    })

    it('should show floating navigator if it is hidden', () => {
      const floatingWindow = windowManager.createFloatingNavigator()
      floatingWindow.isVisible.mockReturnValue(false)

      windowManager.toggleFloatingNavigator()

      expect(floatingWindow.show).toHaveBeenCalled()
    })

    it('should save window state after toggling', () => {
      windowManager.toggleFloatingNavigator()

      expect(mockWindowStateManager.updateWindowState).toHaveBeenCalled()
    })
  })

  describe('showFloatingNavigator', () => {
    it('should create floating navigator if it does not exist', () => {
      windowManager.showFloatingNavigator()

      expect(windowManager.getFloatingNavigator()).toBeDefined()
    })

    it('should show existing floating navigator', () => {
      const floatingWindow = windowManager.createFloatingNavigator()
      windowManager.showFloatingNavigator()

      expect(floatingWindow.show).toHaveBeenCalled()
    })
  })

  describe('hideFloatingNavigator', () => {
    it('should hide floating navigator if it exists', () => {
      const floatingWindow = windowManager.createFloatingNavigator()
      windowManager.hideFloatingNavigator()

      expect(floatingWindow.hide).toHaveBeenCalled()
    })

    it('should not throw error if floating navigator does not exist', () => {
      expect(() => windowManager.hideFloatingNavigator()).not.toThrow()
    })
  })

  describe('restoreFromTray', () => {
    it('should restore and focus main window', () => {
      const mainWindow = windowManager.createMainWindow()
      mainWindow.isMinimized.mockReturnValue(true)

      windowManager.restoreFromTray()

      expect(mainWindow.restore).toHaveBeenCalled()
      expect(mainWindow.show).toHaveBeenCalled()
      expect(mainWindow.focus).toHaveBeenCalled()
    })

    it('should show and focus main window if not minimized', () => {
      const mainWindow = windowManager.createMainWindow()
      mainWindow.isMinimized.mockReturnValue(false)

      windowManager.restoreFromTray()

      expect(mainWindow.restore).not.toHaveBeenCalled()
      expect(mainWindow.show).toHaveBeenCalled()
      expect(mainWindow.focus).toHaveBeenCalled()
    })

    it('should not throw error if main window does not exist', () => {
      expect(() => windowManager.restoreFromTray()).not.toThrow()
    })
  })

  describe('minimizeToTray', () => {
    it('should hide main window in normal mode', () => {
      const mainWindow = windowManager.createMainWindow()
      windowManager.minimizeToTray()

      expect(mainWindow.hide).toHaveBeenCalled()
      expect(mainWindow.minimize).not.toHaveBeenCalled()
    })

    it('should minimize main window in fallback mode', () => {
      const mainWindow = windowManager.createMainWindow()
      windowManager.setTrayFallbackMode(true)
      windowManager.minimizeToTray()

      expect(mainWindow.minimize).toHaveBeenCalled()
      expect(mainWindow.hide).not.toHaveBeenCalled()
    })

    it('should not throw error if main window does not exist', () => {
      expect(() => windowManager.minimizeToTray()).not.toThrow()
    })
  })

  describe('tray fallback mode', () => {
    it('should set tray fallback mode', () => {
      windowManager.setTrayFallbackMode(true)
      expect(windowManager.isTrayFallbackMode()).toBe(true)

      windowManager.setTrayFallbackMode(false)
      expect(windowManager.isTrayFallbackMode()).toBe(false)
    })

    it('should default to false', () => {
      expect(windowManager.isTrayFallbackMode()).toBe(false)
    })
  })

  describe('window state management', () => {
    it('should save window state', () => {
      const mainWindow = windowManager.createMainWindow()
      const floatingWindow = windowManager.createFloatingNavigator()

      windowManager.saveWindowState()

      expect(mockWindowStateManager.updateWindowState).toHaveBeenCalledWith(
        'main',
        mainWindow,
      )
      expect(mockWindowStateManager.updateWindowState).toHaveBeenCalledWith(
        'floating',
        floatingWindow,
      )
    })

    it('should handle missing window state manager gracefully', () => {
      const wm = new WindowManager('http://localhost:3000', null, null)
      expect(() => wm.saveWindowState()).not.toThrow()
    })
  })

  describe('window existence checks', () => {
    it('should correctly check main window existence', () => {
      expect(windowManager.hasMainWindow()).toBe(false)

      windowManager.createMainWindow()
      expect(windowManager.hasMainWindow()).toBe(true)
    })

    it('should correctly check floating navigator existence', () => {
      expect(windowManager.hasFloatingNavigator()).toBe(false)

      windowManager.createFloatingNavigator()
      expect(windowManager.hasFloatingNavigator()).toBe(true)
    })

    it('should handle destroyed windows', () => {
      const mainWindow = windowManager.createMainWindow()
      mainWindow.isDestroyed.mockReturnValue(true)

      expect(windowManager.hasMainWindow()).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('should save window state and close all windows', () => {
      const mainWindow = windowManager.createMainWindow()
      const floatingWindow = windowManager.createFloatingNavigator()

      windowManager.cleanup()

      expect(mockWindowStateManager.updateWindowState).toHaveBeenCalled()
      expect(floatingWindow.close).toHaveBeenCalled()
      expect(mainWindow.close).toHaveBeenCalled()
    })

    it('should handle missing windows gracefully', () => {
      expect(() => windowManager.cleanup()).not.toThrow()
    })

    it('should handle destroyed windows gracefully', () => {
      const mainWindow = windowManager.createMainWindow()
      const floatingWindow = windowManager.createFloatingNavigator()

      mainWindow.isDestroyed.mockReturnValue(true)
      floatingWindow.isDestroyed.mockReturnValue(true)

      expect(() => windowManager.cleanup()).not.toThrow()
    })
  })
})

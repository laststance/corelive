const { app, BrowserWindow, ipcMain, session } = require('electron')
const notifier = require('node-notifier')

// Enable remote debugging for Playwright-driven Electron tests when requested
if (process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch(
    'remote-debugging-port',
    process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT,
  )
}

const { log } = require('../src/lib/logger.cjs')

// Performance optimization imports
const { APIBridge } = require('./api-bridge.cjs')
const ConfigManager = require('./ConfigManager.cjs')
const IPCErrorHandler = require('./IPCErrorHandler.cjs')
const { lazyLoadManager } = require('./LazyLoadManager.cjs')
const { memoryProfiler } = require('./MemoryProfiler.cjs')
// Critical imports - loaded immediately
const { NextServerManager } = require('./next-server.cjs')
const {
  performanceOptimizer,
  OPTIMIZATION_LEVELS,
} = require('./performance-config.cjs')
const WindowManager = require('./WindowManager.cjs')
const WindowStateManager = require('./WindowStateManager.cjs')

const isDev = process.env.NODE_ENV === 'development'
const isTestEnvironment = process.env.NODE_ENV === 'test'

// Set optimization level based on environment
const optimizationLevel = isDev ? 'development' : 'production'
const config = OPTIMIZATION_LEVELS[optimizationLevel]

// Keep a global reference of managers
let configManager
let windowStateManager
let windowManager
let apiBridge
let ipcErrorHandler
let nextServerManager

// Lazy-loaded managers (loaded when needed)
let autoUpdater
let systemTrayManager
let notificationManager
let shortcutManager
let systemIntegrationErrorHandler
let menuManager
let deepLinkManager
let activeUser = null

function ensureDeepLinkManager() {
  if (!windowManager || !apiBridge) {
    return null
  }

  if (!deepLinkManager) {
    const DeepLinkManager = require('./DeepLinkManager.cjs')
    deepLinkManager = new DeepLinkManager(
      windowManager,
      apiBridge,
      notificationManager || null,
      app,
    )
  }

  if (!deepLinkManager.isInitialized) {
    deepLinkManager.initialize()
  }

  return deepLinkManager
}

function ensureWindowStateManagerInstance() {
  if (!windowStateManager) {
    throw new Error('Window state manager not initialized')
  }
  return windowStateManager
}

function getBrowserWindowForType(windowType = 'main') {
  if (!windowManager) {
    return null
  }

  if (windowType === 'floating') {
    if (!windowManager.hasFloatingNavigator()) {
      try {
        windowManager.createFloatingNavigator()
      } catch (error) {
        log.warn('Failed to create floating navigator window:', error.message)
      }
    }
    return windowManager.getFloatingNavigator
      ? windowManager.getFloatingNavigator()
      : null
  }

  return windowManager.getMainWindow ? windowManager.getMainWindow() : null
}

function syncWindowBoundsToBrowserWindow(windowType = 'main') {
  try {
    const stateManager = ensureWindowStateManagerInstance()
    const state = stateManager.getWindowState(windowType)
    const targetWindow = getBrowserWindowForType(windowType)

    if (!state || !targetWindow || targetWindow.isDestroyed?.()) {
      return
    }

    const existingBounds = targetWindow.getBounds()
    const bounds = {
      x:
        typeof state.x === 'number'
          ? state.x
          : typeof existingBounds.x === 'number'
            ? existingBounds.x
            : undefined,
      y:
        typeof state.y === 'number'
          ? state.y
          : typeof existingBounds.y === 'number'
            ? existingBounds.y
            : undefined,
      width:
        typeof state.width === 'number'
          ? state.width
          : typeof existingBounds.width === 'number'
            ? existingBounds.width
            : undefined,
      height:
        typeof state.height === 'number'
          ? state.height
          : typeof existingBounds.height === 'number'
            ? existingBounds.height
            : undefined,
    }

    if (
      typeof bounds.width === 'number' &&
      typeof bounds.height === 'number' &&
      typeof bounds.x === 'number' &&
      typeof bounds.y === 'number'
    ) {
      targetWindow.setBounds(bounds)
    }

    if (windowType === 'floating' && typeof state.isAlwaysOnTop === 'boolean') {
      targetWindow.setAlwaysOnTop(state.isAlwaysOnTop)
    }

    if (windowType === 'main') {
      if (typeof state.isFullScreen === 'boolean') {
        targetWindow.setFullScreen(state.isFullScreen)
      }

      if (typeof state.isMaximized === 'boolean') {
        if (state.isMaximized && !targetWindow.isMaximized()) {
          targetWindow.maximize()
        } else if (!state.isMaximized && targetWindow.isMaximized()) {
          targetWindow.unmaximize()
        }
      }
    }
  } catch (error) {
    log.warn('Failed to synchronize window bounds:', error.message)
  }
}

async function setActiveUser(userPayload) {
  if (!apiBridge) {
    throw new Error('API bridge not initialized')
  }

  if (!userPayload || typeof userPayload !== 'object' || !userPayload.clerkId) {
    throw new Error('Invalid user payload: clerkId is required')
  }

  const prismaUser = await apiBridge.setUserByClerkId(userPayload.clerkId)
  activeUser = {
    id: prismaUser.id,
    clerkId: prismaUser.clerkId,
    emailAddresses: prismaUser.email
      ? [{ emailAddress: prismaUser.email }]
      : [],
    firstName: prismaUser.name || null,
  }
  return activeUser
}

// Content Security Policy for enhanced security
const CSP_POLICY = [
  "default-src 'self'",
  // Allow Clerk assets from .dev and .com domains
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "img-src 'self' data: https: https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "font-src 'self' data: https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  // Include Clerk telemetry and .com endpoints in connect-src for development
  "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com https://clerk-telemetry.com",
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
].join('; ')

function setupSecurity() {
  try {
    // Set up Content Security Policy
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP_POLICY],
        },
      })
    })

    // Security: Set permissions policy
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        // Deny all permissions by default for security
        const allowedPermissions = ['notifications'] // Only allow notifications
        callback(allowedPermissions.includes(permission))
      },
    )

    // Security: Block external protocols
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, _permission, _requestingOrigin, _details) => {
        return false // Deny all permission checks by default
      },
    )
  } catch (error) {
    log.error('❌ Security setup failed:', error.message)
  }
}

async function createWindow() {
  // Start performance monitoring
  if (config.enableMemoryMonitoring) {
    memoryProfiler.startMonitoring()
  }

  // Critical initialization - must happen immediately
  const criticalInit = async () => {
    // Initialize IPC error handler first
    ipcErrorHandler = new IPCErrorHandler({
      maxRetries: 3,
      baseDelay: 1000,
      enableLogging: true,
    })

    // Initialize configuration manager
    configManager = new ConfigManager()

    // Initialize window state manager
    windowStateManager = new WindowStateManager(configManager)

    // Resolve server URL
    let serverUrl = process.env.ELECTRON_DEV_SERVER_URL

    // In test environment, always use external server if available
    if (isTestEnvironment && !serverUrl) {
      serverUrl = 'http://localhost:3011'
    }

    // In development, use external Next dev server when provided by scripts/dev.js
    if (!serverUrl) {
      // Initialize internal Next.js server (used in production or if external not provided)
      nextServerManager = new NextServerManager()
      serverUrl = await nextServerManager.start()
    }

    // Initialize API bridge (skip in test mode to avoid DB issues)
    apiBridge = new APIBridge()
    await apiBridge.initialize()

    // Initialize window manager with server URL and managers
    windowManager = new WindowManager(
      serverUrl,
      configManager,
      windowStateManager,
    )

    // Create main window immediately for better perceived performance

    const mainWindow = windowManager.createMainWindow()

    performanceOptimizer.startupMetrics.windowsCreated++

    return { mainWindow, serverUrl }
  }

  // Deferred initialization - happens after main window is shown
  const deferredInit = async () => {
    try {
      // Load system integration components lazily
      log.info('🔧 [DEFERRED] Loading SystemIntegrationErrorHandler...')
      const SystemIntegrationErrorHandler = await lazyLoadManager.loadComponent(
        'SystemIntegrationErrorHandler',
      )
      systemIntegrationErrorHandler = new SystemIntegrationErrorHandler(
        windowManager,
        configManager,
      )
      log.info('✅ [DEFERRED] SystemIntegrationErrorHandler loaded')

      log.info('🔧 [DEFERRED] Loading MenuManager...')
      // Load menu manager
      const MenuManager = await lazyLoadManager.loadComponent('MenuManager')
      menuManager = new MenuManager()

      // Get mainWindow from windowManager (mainWindow is local to criticalInit)
      const mainWindowRef = windowManager.getMainWindow()
      log.debug(
        '🔧 [DEFERRED] Retrieved mainWindow from windowManager:',
        !!mainWindowRef,
      )

      menuManager.initialize(mainWindowRef, windowManager, configManager)
      log.info('✅ [DEFERRED] MenuManager loaded')

      log.info('🔧 [DEFERRED] Loading SystemTrayManager...')
      // Load system tray manager
      const SystemTrayManager =
        await lazyLoadManager.loadComponent('SystemTrayManager')
      systemTrayManager = new SystemTrayManager(windowManager)
      log.info('✅ [DEFERRED] SystemTrayManager loaded')

      log.info('🔧 [DEFERRED] Loading NotificationManager...')
      // Load notification manager
      const NotificationManager = await lazyLoadManager.loadComponent(
        'NotificationManager',
      )
      notificationManager = new NotificationManager(
        windowManager,
        systemTrayManager,
        configManager,
      )
      log.info('✅ [DEFERRED] NotificationManager loaded')

      log.info('🔧 [DEFERRED] Loading ShortcutManager...')
      // Load shortcut manager
      const ShortcutManager =
        await lazyLoadManager.loadComponent('ShortcutManager')
      shortcutManager = new ShortcutManager(
        windowManager,
        notificationManager,
        configManager,
      )
      log.info('✅ [DEFERRED] ShortcutManager loaded')

      log.info('🔧 [DEFERRED] Setting managers in error handler...')
      // Set managers in error handler
      systemIntegrationErrorHandler.setManagers(
        systemTrayManager,
        notificationManager,
        shortcutManager,
      )
      log.info('✅ [DEFERRED] Managers set')

      log.info('🔧 [DEFERRED] Initializing system integration...')
      // Initialize system integration with comprehensive error handling
      await systemIntegrationErrorHandler.initializeSystemIntegration()
      log.info('✅ [DEFERRED] System integration initialized')

      // Load auto-updater in background (skip during automated tests)
      if (!isTestEnvironment) {
        const AutoUpdater = await lazyLoadManager.loadComponent('AutoUpdater')
        autoUpdater = new AutoUpdater()
        autoUpdater.setMainWindow(windowManager.getMainWindow())
      } else {
        log.info('AutoUpdater initialization skipped in test environment')
      }

      // Ensure deep link manager is ready once supporting managers exist
      const manager = ensureDeepLinkManager()
      if (manager) {
        manager.notificationManager = notificationManager

        // Process any pending deep link URL after initialization
        setTimeout(() => {
          try {
            manager.processPendingUrl()
          } catch (error) {
            log.warn('⚠️ Failed to process pending deep link URL', error)
          }
        }, 1000)
      }

      // Set up window close behavior after tray manager is loaded
      const mainWindow = windowManager.getMainWindow()
      mainWindow.on('close', (event) => {
        if (systemTrayManager) {
          systemTrayManager.handleWindowClose(event)
        }
      })
    } catch (error) {
      log.error('❌ Deferred initialization failed:', error)
      // Continue without non-critical components
    }
  }

  // Use optimized startup

  // const { mainWindow } = await performanceOptimizer.optimizeStartup(
  //   criticalInit,
  //   deferredInit,
  // )
  //

  // Run critical initialization directly
  const criticalResult = await criticalInit()

  // Run deferred initialization
  setImmediate(async () => {
    try {
      log.info('🔄 Starting deferred initialization...')
      await deferredInit()
      log.info('✅ Deferred initialization completed successfully')
    } catch (error) {
      console.error('❌ Main: Deferred initialization failed:', error)
      log.error(
        '❌ Main: Deferred initialization failed:',
        error.message,
        error.stack,
      )
    }
  })

  const { mainWindow } = criticalResult

  // Set up IPC handlers immediately (they handle lazy loading internally)

  setupIPCHandlers()

  return mainWindow
}

function setupIPCHandlers() {
  // Basic IPC handlers
  ipcMain.handle('app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app-quit', () => {
    app.quit()
  })

  // Todo operation IPC handlers - connected to API bridge with error handling
  ipcMain.handle(
    'todo-get-all',
    ipcErrorHandler.wrapHandler(
      async (_event, options = {}) => {
        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }

        const filters = options && typeof options === 'object' ? options : {}

        return apiBridge.listTodos({
          completed:
            typeof filters.completed === 'boolean'
              ? filters.completed
              : undefined,
          limit:
            typeof filters.limit === 'number' && filters.limit > 0
              ? filters.limit
              : 100,
          offset:
            typeof filters.offset === 'number' && filters.offset >= 0
              ? filters.offset
              : 0,
        })
      },
      {
        channel: 'todo-get-all',
        operationType: 'getTodos',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'todo-get-by-id',
    ipcErrorHandler.wrapHandler(
      async (_event, id) => {
        if (id === undefined || id === null) {
          throw new Error('Todo ID is required')
        }
        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }
        return apiBridge.getTodoById(id)
      },
      {
        channel: 'todo-get-by-id',
        operationType: 'getTodo',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'todo-create',
    ipcErrorHandler.wrapHandler(
      async (_event, todoData) => {
        if (!todoData || typeof todoData !== 'object') {
          throw new Error('Invalid todo data')
        }

        const validation = ipcErrorHandler.validateInput(todoData.text, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid todo text: ${validation.error}`)
        }

        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }

        const newTodo = await apiBridge.createTodo(todoData)

        // Show notification for task creation (with error handling)
        try {
          if (notificationManager) {
            notificationManager.showTaskCreatedNotification(newTodo)
          }
        } catch (notificationError) {
          ipcErrorHandler.logWarning(
            'Failed to show task creation notification',
            {
              error: notificationError.message,
              todoId: newTodo?.id,
            },
          )
        }

        return newTodo
      },
      {
        channel: 'todo-create',
        operationType: 'createTodo',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'todo-update',
    ipcErrorHandler.wrapHandler(
      async (_event, id, updates) => {
        if (id === undefined || id === null) {
          throw new Error('Todo ID is required')
        }

        if (!updates || typeof updates !== 'object') {
          throw new Error('Invalid update data')
        }

        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }

        const updatedTodo = await apiBridge.updateTodo(id, updates)

        // Show appropriate notification based on what was updated (with error handling)
        try {
          if (notificationManager) {
            if (updates.hasOwnProperty('completed')) {
              notificationManager.showTaskCompletedNotification(updatedTodo)
            } else {
              notificationManager.showTaskUpdatedNotification(
                updatedTodo,
                updates,
              )
            }
          }
        } catch (notificationError) {
          ipcErrorHandler.logWarning(
            'Failed to show task update notification',
            {
              error: notificationError.message,
              todoId: updatedTodo?.id,
            },
          )
        }

        return updatedTodo
      },
      {
        channel: 'todo-update',
        operationType: 'updateTodo',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'todo-delete',
    ipcErrorHandler.wrapHandler(
      async (_event, id) => {
        if (id === undefined || id === null) {
          throw new Error('Todo ID is required')
        }

        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }

        // Get todo before deletion for notification (with error handling)
        let todoToDelete = null
        try {
          todoToDelete = await apiBridge.getTodoById(id)
        } catch (error) {
          ipcErrorHandler.logWarning('Failed to get todo before deletion', {
            error: error.message,
            todoId: id,
          })
        }

        const result = await apiBridge.deleteTodo(id)

        // Show notification for task deletion (with error handling)
        try {
          if (notificationManager && todoToDelete) {
            notificationManager.showTaskDeletedNotification(todoToDelete)
          }
        } catch (notificationError) {
          ipcErrorHandler.logWarning(
            'Failed to show task deletion notification',
            {
              error: notificationError.message,
              todoId: id,
            },
          )
        }

        return result
      },
      {
        channel: 'todo-delete',
        operationType: 'deleteTodo',
        enableDegradation: true,
      },
    ),
  )

  // Window management IPC handlers with error handling
  ipcMain.handle(
    'window-minimize',
    ipcErrorHandler.wrapHandler(
      () => {
        if (!windowManager) {
          throw new Error('Window manager not initialized')
        }

        if (!windowManager.hasMainWindow()) {
          throw new Error('Main window not available')
        }

        windowManager.minimizeToTray()
        return true
      },
      {
        channel: 'window-minimize',
        operationType: 'windowOperation',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-close',
    ipcErrorHandler.wrapHandler(
      () => {
        if (!windowManager) {
          throw new Error('Window manager not initialized')
        }

        if (!windowManager.hasMainWindow()) {
          throw new Error('Main window not available')
        }

        windowManager.minimizeToTray()
        return true
      },
      {
        channel: 'window-close',
        operationType: 'windowOperation',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-toggle-floating-navigator',
    ipcErrorHandler.wrapHandler(
      () => {
        if (!windowManager) {
          throw new Error('Window manager not initialized')
        }

        windowManager.toggleFloatingNavigator()
        return true
      },
      {
        channel: 'window-toggle-floating-navigator',
        operationType: 'windowOperation',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main') => {
        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getWindowState(type)
      },
      {
        channel: 'window-state-get',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-set',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main', properties = {}) => {
        if (!properties || typeof properties !== 'object') {
          throw new Error('Window state properties must be an object')
        }

        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        stateManager.setWindowState(type, properties)
        syncWindowBoundsToBrowserWindow(type)
        return stateManager.getWindowState(type)
      },
      {
        channel: 'window-state-set',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-reset',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main') => {
        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        stateManager.resetWindowState(type)
        syncWindowBoundsToBrowserWindow(type)
        return stateManager.getWindowState(type)
      },
      {
        channel: 'window-state-reset',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get-stats',
    ipcErrorHandler.wrapHandler(
      () => {
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getStats()
      },
      {
        channel: 'window-state-get-stats',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-move-to-display',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main', displayId) => {
        if (typeof displayId !== 'number') {
          throw new Error('Display ID must be a number')
        }

        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        const targetWindow = getBrowserWindowForType(type)
        return stateManager.moveWindowToDisplay(type, displayId, targetWindow)
      },
      {
        channel: 'window-state-move-to-display',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-snap-to-edge',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main', edge) => {
        if (!edge || typeof edge !== 'string') {
          throw new Error('Edge must be provided as a string')
        }

        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        const targetWindow = getBrowserWindowForType(type)
        return stateManager.snapWindowToEdge(type, edge, targetWindow)
      },
      {
        channel: 'window-state-snap-to-edge',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get-display',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main') => {
        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getWindowDisplay(type)
      },
      {
        channel: 'window-state-get-display',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get-all-displays',
    ipcErrorHandler.wrapHandler(
      () => {
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getAllDisplays()
      },
      {
        channel: 'window-state-get-all-displays',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  // System tray IPC handlers
  ipcMain.handle('window-show-floating-navigator', () => {
    if (windowManager) {
      windowManager.showFloatingNavigator()
    }
  })

  ipcMain.handle('window-hide-floating-navigator', () => {
    if (windowManager) {
      windowManager.hideFloatingNavigator()
    }
  })

  // Floating window control IPC handlers
  ipcMain.handle('floating-window-close', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.close()
        }
      }
      return true
    } catch (error) {
      log.error('Failed to close floating window:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-minimize', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.minimize()
        }
      }
      return true
    } catch (error) {
      log.error('Failed to minimize floating window:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-toggle-always-on-top', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          const isAlwaysOnTop = floatingWindow.isAlwaysOnTop()
          floatingWindow.setAlwaysOnTop(!isAlwaysOnTop)
          return !isAlwaysOnTop
        }
      }
      return false
    } catch (error) {
      log.error('Failed to toggle always on top:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-get-bounds', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          return floatingWindow.getBounds()
        }
      }
      return null
    } catch (error) {
      log.error('Failed to get floating window bounds:', error)
      return null
    }
  })

  ipcMain.handle('floating-window-set-bounds', (_event, bounds) => {
    try {
      if (!bounds || typeof bounds !== 'object') {
        throw new Error('Invalid bounds data')
      }

      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.setBounds(bounds)
        }
      }
      return true
    } catch (error) {
      log.error('Failed to set floating window bounds:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-is-always-on-top', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          return floatingWindow.isAlwaysOnTop()
        }
      }
      return false
    } catch (error) {
      log.error('Failed to check always on top status:', error)
      return false
    }
  })

  ipcMain.handle('tray-show-notification', (event, title, body, options) => {
    if (systemTrayManager) {
      return systemTrayManager.showNotification(title, body, options)
    }
  })

  ipcMain.handle('tray-update-menu', (event, tasks) => {
    if (systemTrayManager) {
      systemTrayManager.updateTrayMenu(tasks)
    }
  })

  ipcMain.handle('tray-set-tooltip', (event, text) => {
    if (systemTrayManager) {
      systemTrayManager.setTrayTooltip(text)
    }
  })

  ipcMain.handle('tray-set-icon-state', (event, state) => {
    if (systemTrayManager) {
      return systemTrayManager.setTrayIconState(state)
    }
    return false
  })

  // Notification management IPC handlers with error handling and lazy loading
  ipcMain.handle(
    'notification-show',
    ipcErrorHandler.wrapHandler(
      async (event, title, body, options) => {
        // Validate input
        const titleValidation = ipcErrorHandler.validateInput(title, {
          type: 'string',
          required: true,
        })

        if (!titleValidation.isValid) {
          throw new Error(
            `Invalid notification title: ${titleValidation.error}`,
          )
        }

        const bodyValidation = ipcErrorHandler.validateInput(body, {
          type: 'string',
          required: true,
        })

        if (!bodyValidation.isValid) {
          throw new Error(`Invalid notification body: ${bodyValidation.error}`)
        }

        // Lazy load notification manager if not available
        if (!notificationManager) {
          try {
            const NotificationManager = await lazyLoadManager.loadComponent(
              'NotificationManager',
            )
            // eslint-disable-next-line require-atomic-updates
            notificationManager = new NotificationManager(
              windowManager,
              systemTrayManager,
              configManager,
            )
          } catch (error) {
            log.warn('Failed to load notification manager:', error.message)
            throw new Error('Notification manager not available')
          }
        }

        return notificationManager.showNotification(title, body, options || {})
      },
      {
        channel: 'notification-show',
        operationType: 'notification',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle('notification-get-preferences', () => {
    if (notificationManager) {
      return notificationManager.getPreferences()
    }
    return null
  })

  ipcMain.handle('notification-update-preferences', (event, preferences) => {
    if (notificationManager) {
      notificationManager.updatePreferences(preferences)
      return notificationManager.getPreferences()
    }
    return null
  })

  // Configuration management IPC handlers with error handling
  ipcMain.handle(
    'config-get',
    ipcErrorHandler.wrapHandler(
      (event, path, defaultValue) => {
        // Validate input
        const validation = ipcErrorHandler.validateInput(path, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid config path: ${validation.error}`)
        }

        if (!configManager) {
          throw new Error('Configuration manager not initialized')
        }

        return configManager.get(path, defaultValue)
      },
      {
        channel: 'config-get',
        operationType: 'getConfig',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'config-set',
    ipcErrorHandler.wrapHandler(
      (event, path, value) => {
        // Validate input
        const validation = ipcErrorHandler.validateInput(path, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid config path: ${validation.error}`)
        }

        if (!configManager) {
          throw new Error('Configuration manager not initialized')
        }

        return configManager.set(path, value)
      },
      {
        channel: 'config-set',
        operationType: 'setConfig',
        enableDegradation: true,
      },
    ),
  )

  // Authentication IPC handlers (basic implementations for testing)
  ipcMain.handle('auth-get-user', () => {
    return activeUser
  })

  ipcMain.handle('auth-set-user', async (_event, user) => {
    try {
      return await setActiveUser(user)
    } catch (error) {
      log.error('Failed to set active user:', error)
      throw error
    }
  })

  ipcMain.handle('auth-logout', async () => {
    activeUser = null
    if (apiBridge) {
      apiBridge.clearActiveUser()
    }
    return true
  })

  ipcMain.handle('auth-is-authenticated', () => {
    return Boolean(activeUser)
  })

  ipcMain.handle('auth-sync-from-web', async (_event, authData) => {
    try {
      await setActiveUser(authData)
      return true
    } catch (error) {
      log.error('Failed to sync auth from web:', error)
      return false
    }
  })

  // Performance monitoring IPC handlers
  ipcMain.handle('performance-get-metrics', () => {
    return {
      optimizer: performanceOptimizer.getMetrics(),
      memory: memoryProfiler.getStatistics(),
      lazyLoad: lazyLoadManager.getStatus(),
    }
  })

  ipcMain.handle('performance-trigger-cleanup', () => {
    memoryProfiler.performCleanup('manual')
    return true
  })

  ipcMain.handle('performance-get-startup-time', () => {
    return Date.now() - performanceOptimizer.startupMetrics.startTime
  })

  // Menu action IPC handlers
  ipcMain.handle('menu-action', (event, action) => {
    if (menuManager) {
      menuManager.handleMenuAction(action)
    }
  })

  // Deep linking IPC handlers
  ipcMain.handle('deep-link-generate', (_event, action, params) => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.generateDeepLink(action, params)
    }
    return null
  })

  ipcMain.handle('deep-link-get-examples', () => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.getExampleUrls()
    }
    return {}
  })

  ipcMain.handle('deep-link-handle-url', (_event, url) => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.handleDeepLink(url)
    }
    return false
  })

  // Add other IPC handlers without error wrapping for simplicity
  ipcMain.handle('window-show-main', () => {
    if (windowManager) {
      windowManager.restoreFromTray()
    }
  })

  // Quick todo operations for floating navigator
  ipcMain.handle('todo-quick-create', async (_event, todoData) => {
    try {
      if (!todoData || typeof todoData !== 'object') {
        throw new Error('Invalid todo data')
      }

      const text = todoData.text || todoData.title
      if (!text || typeof text !== 'string') {
        throw new Error('Todo text is required')
      }

      const normalizedData = {
        text,
        notes: todoData.notes ?? null,
      }

      if (!apiBridge) {
        throw new Error('API bridge not initialized')
      }

      const quickTodo = await apiBridge.createTodo(normalizedData)

      if (notificationManager) {
        notificationManager.showTaskCreatedNotification(quickTodo)
      }

      if (windowManager && windowManager.hasMainWindow()) {
        windowManager
          .getMainWindow()
          .webContents.send('todo-created', quickTodo)
      }

      return quickTodo
    } catch (error) {
      log.error('Failed to quick create todo:', error)
      throw new Error('Failed to create todo')
    }
  })

  ipcMain.handle('todo-toggle-complete', async (_event, id) => {
    try {
      if (id === undefined || id === null) {
        throw new Error('Invalid todo ID')
      }

      if (!apiBridge) {
        throw new Error('API bridge not initialized')
      }

      const updatedTodo = await apiBridge.toggleTodo(id)

      if (notificationManager) {
        notificationManager.showTaskCompletedNotification(updatedTodo)
      }

      if (windowManager && windowManager.hasMainWindow()) {
        windowManager
          .getMainWindow()
          .webContents.send('todo-updated', updatedTodo)
      }

      return updatedTodo
    } catch (error) {
      log.error('Failed to toggle todo completion:', error)
      throw new Error('Failed to toggle todo')
    }
  })

  ipcMain.handle('todo-clear-completed', async () => {
    try {
      if (!apiBridge) {
        throw new Error('API bridge not initialized')
      }

      return apiBridge.clearCompleted()
    } catch (error) {
      log.error('Failed to clear completed todos:', error)
      throw new Error('Failed to clear completed todos')
    }
  })
}

// Ensure single instance (disabled in test environment to allow parallel testing)
const gotTheLock = isTestEnvironment ? true : app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  // Security: Set app security policies before ready
  app.whenReady().then(async () => {
    // Setup security policies
    setupSecurity()
    // Create the main application window
    const mainWindow = await createWindow()
    if (isTestEnvironment) {
      notifier.notify('Electron is Testing')
      // Simulate headless mode in Playwright e2e
      // app.hide()
      // In test mode, show without stealing focus
      mainWindow.showInactive()
      // Mac Only: Hide from dock during test
      // app.setActivationPolicy('accessory')
    }

    app.on('activate', () => {
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup before quit
app.on('before-quit', async () => {
  // Stop performance monitoring
  memoryProfiler.stopMonitoring()

  // Cleanup managers in reverse order of initialization
  if (deepLinkManager) {
    deepLinkManager.cleanup()
  }
  if (systemTrayManager) {
    systemTrayManager.setQuitting(true)
  }
  if (systemIntegrationErrorHandler) {
    systemIntegrationErrorHandler.handleAppQuit()
  }
  if (shortcutManager) {
    shortcutManager.cleanup()
  }
  if (notificationManager) {
    notificationManager.cleanup()
  }
  if (windowStateManager) {
    windowStateManager.cleanup()
  }
  if (windowManager) {
    windowManager.cleanup()
  }
  if (ipcErrorHandler) {
    ipcErrorHandler.cleanup()
  }
  if (apiBridge) {
    await apiBridge.disconnect()
  }
  if (nextServerManager) {
    await nextServerManager.stop()
  }

  // Cleanup performance components
  lazyLoadManager.cleanup()
  performanceOptimizer.cleanup()
  memoryProfiler.cleanup()
})

// Security: Prevent new window creation from renderer and other security measures
app.on('web-contents-created', (_event, contents) => {
  // Prevent new window creation
  contents.on('new-window', (event, _navigationUrl) => {
    event.preventDefault()
  })

  // Security: Prevent webSecurity bypass
  contents.on('will-attach-webview', (event, webPreferences, _params) => {
    // Strip away preload scripts if unused or verify their location is legitimate
    delete webPreferences.preload
    delete webPreferences.preloadURL

    // Disable Node.js integration
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
  })

  // Security: Prevent navigation to external protocols
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    if (
      parsedUrl.protocol !== 'http:' &&
      parsedUrl.protocol !== 'https:' &&
      parsedUrl.protocol !== 'file:'
    ) {
      event.preventDefault()
    }
  })
})

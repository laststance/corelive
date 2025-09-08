const { app, BrowserWindow, ipcMain, session } = require('electron')

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

// Content Security Policy for enhanced security
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.dev", // Allow Clerk.js and Next.js
  "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.dev", // Allow Clerk styles and Next.js
  "img-src 'self' data: https: https://*.clerk.accounts.dev https://*.clerk.dev",
  "font-src 'self' data: https://*.clerk.accounts.dev https://*.clerk.dev",
  "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https://*.clerk.accounts.dev https://*.clerk.dev", // Allow Clerk API and dev server connections
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.dev",
  "worker-src 'self' blob:", // Allow Clerk workers from blob URLs
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.clerk.accounts.dev https://*.clerk.dev",
].join('; ')

function setupSecurity() {
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

    // Initialize Next.js server
    nextServerManager = new NextServerManager()
    const serverUrl = await nextServerManager.start()

    // Initialize API bridge
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
      const SystemIntegrationErrorHandler = await lazyLoadManager.loadComponent(
        'SystemIntegrationErrorHandler',
      )
      systemIntegrationErrorHandler = new SystemIntegrationErrorHandler(
        windowManager,
        configManager,
      )

      // Load menu manager
      const MenuManager = await lazyLoadManager.loadComponent('MenuManager')
      menuManager = new MenuManager()
      menuManager.initialize(mainWindow, windowManager, configManager)

      // Load system tray manager
      const SystemTrayManager =
        await lazyLoadManager.loadComponent('SystemTrayManager')
      systemTrayManager = new SystemTrayManager(windowManager)

      // Load notification manager
      const NotificationManager = await lazyLoadManager.loadComponent(
        'NotificationManager',
      )
      notificationManager = new NotificationManager(
        windowManager,
        systemTrayManager,
        configManager,
      )

      // Load shortcut manager
      const ShortcutManager =
        await lazyLoadManager.loadComponent('ShortcutManager')
      shortcutManager = new ShortcutManager(
        windowManager,
        notificationManager,
        configManager,
      )

      // Set managers in error handler
      systemIntegrationErrorHandler.setManagers(
        systemTrayManager,
        notificationManager,
        shortcutManager,
      )

      // Initialize system integration with comprehensive error handling
      await systemIntegrationErrorHandler.initializeSystemIntegration()

      // Load auto-updater in background
      const AutoUpdater = await lazyLoadManager.loadComponent('AutoUpdater')
      autoUpdater = new AutoUpdater()
      autoUpdater.setMainWindow(windowManager.getMainWindow())

      // Initialize deep link manager
      const DeepLinkManager = require('./DeepLinkManager.cjs')
      deepLinkManager = new DeepLinkManager(
        windowManager,
        apiBridge,
        notificationManager,
      )
      deepLinkManager.initialize()

      // Process any pending deep link URL after initialization
      setTimeout(() => {
        if (deepLinkManager) {
          deepLinkManager.processPendingUrl()
        }
      }, 1000)

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
  const { mainWindow } = await performanceOptimizer.optimizeStartup(
    criticalInit,
    deferredInit,
  )

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
      async () => {
        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }
        return apiBridge.getTodos()
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
      async (event, id) => {
        // Validate input
        const validation = ipcErrorHandler.validateInput(id, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid todo ID: ${validation.error}`)
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
        // Validate input
        const validation = ipcErrorHandler.validateInput(todoData, {
          type: 'object',
          required: true,
          properties: {
            title: { required: true },
          },
        })

        if (!validation.isValid) {
          throw new Error(`Invalid todo data: ${validation.error}`)
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
        // Validate input
        const idValidation = ipcErrorHandler.validateInput(id, {
          type: 'string',
          required: true,
        })

        if (!idValidation.isValid) {
          throw new Error(`Invalid todo ID: ${idValidation.error}`)
        }

        const updatesValidation = ipcErrorHandler.validateInput(updates, {
          type: 'object',
          required: true,
        })

        if (!updatesValidation.isValid) {
          throw new Error(`Invalid update data: ${updatesValidation.error}`)
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
        // Validate input
        const validation = ipcErrorHandler.validateInput(id, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid todo ID: ${validation.error}`)
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
    // Return a mock user for testing
    return {
      id: 'test-user',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
      firstName: 'Test',
      lastName: 'User',
    }
  })

  ipcMain.handle('auth-set-user', (_event, _user) => {
    // Mock implementation - just return success

    return true
  })

  ipcMain.handle('auth-logout', () => {
    // Mock implementation - just return success

    return true
  })

  ipcMain.handle('auth-is-authenticated', () => {
    // For testing, always return true
    return true
  })

  ipcMain.handle('auth-sync-from-web', (_event, _authData) => {
    // Mock implementation - just return success

    return true
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
  ipcMain.handle('deep-link-generate', (event, action, params) => {
    if (deepLinkManager) {
      return deepLinkManager.generateDeepLink(action, params)
    }
    return null
  })

  ipcMain.handle('deep-link-get-examples', () => {
    if (deepLinkManager) {
      return deepLinkManager.getExampleUrls()
    }
    return {}
  })

  ipcMain.handle('deep-link-handle-url', (event, url) => {
    if (deepLinkManager) {
      deepLinkManager.handleDeepLink(url)
      return true
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
      if (!todoData || typeof todoData !== 'object' || !todoData.title) {
        throw new Error('Invalid todo data')
      }

      if (!apiBridge) {
        throw new Error('API bridge not initialized')
      }

      const quickTodo = await apiBridge.createTodo(todoData)

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

  ipcMain.handle(
    'todo-toggle-complete',
    async (_event, id, currentCompleted) => {
      try {
        if (!id || typeof id !== 'string') {
          throw new Error('Invalid todo ID')
        }

        if (!apiBridge) {
          throw new Error('API bridge not initialized')
        }

        const updatedTodo = await apiBridge.updateTodo(id, {
          completed: !currentCompleted,
        })

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
    },
  )
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  // Security: Set app security policies before ready
  app.whenReady().then(() => {
    // Setup security policies
    setupSecurity()

    // Security: Remove default protocols that could be exploited
    if (isDev) {
      // Only install dev extensions in development
      const {
        default: installExtension,
        REACT_DEVELOPER_TOOLS,
      } = require('electron-devtools-installer')
      installExtension(REACT_DEVELOPER_TOOLS)
        .then(() => {})
        .catch(() => {})
    }

    createWindow()

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

const { app, BrowserWindow, ipcMain, session } = require('electron')

const { APIBridge } = require('./api-bridge.cjs')
const AutoUpdater = require('./AutoUpdater.cjs')
const ConfigManager = require('./ConfigManager.cjs')
const IPCErrorHandler = require('./IPCErrorHandler.cjs')
const { NextServerManager } = require('./next-server.cjs')
const NotificationManager = require('./NotificationManager.cjs')
const ShortcutManager = require('./ShortcutManager.cjs')
const SystemIntegrationErrorHandler = require('./SystemIntegrationErrorHandler.cjs')
const SystemTrayManager = require('./SystemTrayManager.cjs')
const WindowManager = require('./WindowManager.cjs')
const WindowStateManager = require('./WindowStateManager.cjs')
// const { AuthManager } = require('./auth-manager')
const isDev = process.env.NODE_ENV === 'development'

// Keep a global reference of managers
let autoUpdater
let configManager
let windowStateManager
let windowManager
let systemTrayManager
let notificationManager
let shortcutManager
let apiBridge
let ipcErrorHandler
let systemIntegrationErrorHandler
// let authManager
let nextServerManager

// Content Security Policy for enhanced security
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline and unsafe-eval
  "style-src 'self' 'unsafe-inline'", // Allow inline styles for Next.js
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*", // Allow dev server connections
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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

  // Initialize authentication manager
  // authManager = new AuthManager(apiBridge)

  // Initialize window manager with server URL and managers
  windowManager = new WindowManager(
    serverUrl,
    configManager,
    windowStateManager,
  )

  // Initialize system integration error handler
  systemIntegrationErrorHandler = new SystemIntegrationErrorHandler(
    windowManager,
    configManager,
  )

  // Initialize system tray manager
  systemTrayManager = new SystemTrayManager(windowManager)

  // Initialize notification manager
  notificationManager = new NotificationManager(
    windowManager,
    systemTrayManager,
    configManager,
  )

  // Initialize shortcut manager
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
  const integrationResults =
    await systemIntegrationErrorHandler.initializeSystemIntegration()

  console.log('🔧 System integration results:', integrationResults)

  // Create main window using WindowManager
  const mainWindow = windowManager.createMainWindow()

  // Initialize auto-updater
  autoUpdater = new AutoUpdater()
  autoUpdater.setMainWindow(mainWindow)

  // Override window close behavior to minimize to tray
  mainWindow.on('close', (event) => {
    systemTrayManager.handleWindowClose(event)
  })

  return mainWindow
}

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
      .then((name) => console.log(`Added Extension: ${name}`))
      .catch((err) => console.log('An error occurred: ', err))
  }

  createWindow()

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup before quit
app.on('before-quit', async () => {
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
  // Auto-updater doesn't need explicit cleanup
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
        ipcErrorHandler.logWarning('Failed to show task update notification', {
          error: notificationError.message,
          todoId: updatedTodo?.id,
        })
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

// System tray IPC handlers
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

// Notification management IPC handlers with error handling
ipcMain.handle(
  'notification-show',
  ipcErrorHandler.wrapHandler(
    (event, title, body, options) => {
      // Validate input
      const titleValidation = ipcErrorHandler.validateInput(title, {
        type: 'string',
        required: true,
      })

      if (!titleValidation.isValid) {
        throw new Error(`Invalid notification title: ${titleValidation.error}`)
      }

      const bodyValidation = ipcErrorHandler.validateInput(body, {
        type: 'string',
        required: true,
      })

      if (!bodyValidation.isValid) {
        throw new Error(`Invalid notification body: ${bodyValidation.error}`)
      }

      if (!notificationManager) {
        throw new Error('Notification manager not initialized')
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

ipcMain.handle('notification-clear-all', () => {
  if (notificationManager) {
    notificationManager.clearAllNotifications()
  }
})

ipcMain.handle('notification-clear', (event, tag) => {
  if (notificationManager) {
    notificationManager.clearNotification(tag)
  }
})

ipcMain.handle('notification-is-enabled', () => {
  if (notificationManager) {
    return notificationManager.isEnabled()
  }
  return false
})

ipcMain.handle('notification-get-active-count', () => {
  if (notificationManager) {
    return notificationManager.getActiveNotificationCount()
  }
  return 0
})

// Keyboard shortcut management IPC handlers
ipcMain.handle('shortcuts-get-registered', () => {
  if (shortcutManager) {
    return shortcutManager.getRegisteredShortcuts()
  }
  return {}
})

ipcMain.handle('shortcuts-get-defaults', () => {
  if (shortcutManager) {
    return shortcutManager.getDefaultShortcutsConfig()
  }
  return {}
})

ipcMain.handle('shortcuts-update', (event, shortcuts) => {
  if (shortcutManager) {
    return shortcutManager.updateShortcuts(shortcuts)
  }
  return false
})

ipcMain.handle('shortcuts-register', (event, accelerator, id) => {
  if (shortcutManager) {
    const handler = shortcutManager.getHandlerForShortcut(id)
    if (handler) {
      return shortcutManager.registerShortcut(accelerator, id, handler)
    }
  }
  return false
})

ipcMain.handle('shortcuts-unregister', (event, id) => {
  if (shortcutManager) {
    return shortcutManager.unregisterShortcut(id)
  }
  return false
})

ipcMain.handle('shortcuts-is-registered', (event, accelerator) => {
  if (shortcutManager) {
    return shortcutManager.isShortcutRegistered(accelerator)
  }
  return false
})

ipcMain.handle('shortcuts-enable', () => {
  if (shortcutManager) {
    shortcutManager.enable()
    return true
  }
  return false
})

ipcMain.handle('shortcuts-disable', () => {
  if (shortcutManager) {
    shortcutManager.disable()
    return true
  }
  return false
})

ipcMain.handle('shortcuts-get-stats', () => {
  if (shortcutManager) {
    return shortcutManager.getStats()
  }
  return null
})

// Floating navigator specific IPC handlers
ipcMain.handle('floating-window-close', () => {
  if (windowManager) {
    windowManager.hideFloatingNavigator()
  }
})

ipcMain.handle('floating-window-minimize', () => {
  if (windowManager && windowManager.hasFloatingNavigator()) {
    const floatingWindow = windowManager.getFloatingNavigator()
    if (floatingWindow) {
      floatingWindow.minimize()
    }
  }
})

ipcMain.handle('floating-window-toggle-always-on-top', () => {
  if (windowManager && windowManager.hasFloatingNavigator()) {
    const floatingWindow = windowManager.getFloatingNavigator()
    if (floatingWindow) {
      const isAlwaysOnTop = floatingWindow.isAlwaysOnTop()
      floatingWindow.setAlwaysOnTop(!isAlwaysOnTop)
      return !isAlwaysOnTop
    }
  }
  return false
})

ipcMain.handle('floating-window-get-bounds', () => {
  if (windowManager && windowManager.hasFloatingNavigator()) {
    const floatingWindow = windowManager.getFloatingNavigator()
    if (floatingWindow) {
      return floatingWindow.getBounds()
    }
  }
  return null
})

ipcMain.handle('floating-window-set-bounds', (event, bounds) => {
  if (windowManager && windowManager.hasFloatingNavigator()) {
    const floatingWindow = windowManager.getFloatingNavigator()
    if (floatingWindow && bounds) {
      floatingWindow.setBounds(bounds)
      return true
    }
  }
  return false
})

ipcMain.handle('floating-window-is-always-on-top', () => {
  if (windowManager && windowManager.hasFloatingNavigator()) {
    const floatingWindow = windowManager.getFloatingNavigator()
    if (floatingWindow) {
      return floatingWindow.isAlwaysOnTop()
    }
  }
  return false
})

ipcMain.handle('window-show-main', () => {
  if (windowManager) {
    windowManager.restoreFromTray()
  }
})

// Quick todo operations for floating navigator
ipcMain.handle('todo-quick-create', async (_event, todoData) => {
  try {
    // Validate input
    if (!todoData || typeof todoData !== 'object' || !todoData.title) {
      throw new Error('Invalid todo data')
    }

    if (!apiBridge) {
      throw new Error('API bridge not initialized')
    }

    const quickTodo = await apiBridge.createTodo(todoData)

    // Show notification for task creation
    if (notificationManager) {
      notificationManager.showTaskCreatedNotification(quickTodo)
    }

    // Notify main window of new todo
    if (windowManager && windowManager.hasMainWindow()) {
      windowManager.getMainWindow().webContents.send('todo-created', quickTodo)
    }

    return quickTodo
  } catch (error) {
    console.error('Failed to quick create todo:', error)
    throw new Error('Failed to create todo')
  }
})

ipcMain.handle('todo-toggle-complete', async (_event, id, currentCompleted) => {
  try {
    // Validate input
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid todo ID')
    }

    if (!apiBridge) {
      throw new Error('API bridge not initialized')
    }

    // Toggle the completion status
    const updatedTodo = await apiBridge.updateTodo(id, {
      completed: !currentCompleted,
    })

    // Show notification for task completion
    if (notificationManager) {
      notificationManager.showTaskCompletedNotification(updatedTodo)
    }

    // Notify main window of todo update
    if (windowManager && windowManager.hasMainWindow()) {
      windowManager
        .getMainWindow()
        .webContents.send('todo-updated', updatedTodo)
    }

    return updatedTodo
  } catch (error) {
    console.error('Failed to toggle todo completion:', error)
    throw new Error('Failed to toggle todo')
  }
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

ipcMain.handle('config-get-all', () => {
  if (configManager) {
    return configManager.getAll()
  }
  return {}
})

ipcMain.handle('config-get-section', (event, section) => {
  if (configManager) {
    return configManager.getSection(section)
  }
  return {}
})

ipcMain.handle('config-update', (event, updates) => {
  if (configManager) {
    return configManager.update(updates)
  }
  return false
})

ipcMain.handle('config-reset', () => {
  if (configManager) {
    return configManager.reset()
  }
  return false
})

ipcMain.handle('config-reset-section', (event, section) => {
  if (configManager) {
    return configManager.resetSection(section)
  }
  return false
})

ipcMain.handle('config-validate', () => {
  if (configManager) {
    return configManager.validate()
  }
  return { isValid: false, errors: ['Configuration manager not available'] }
})

ipcMain.handle('config-export', (event, filePath) => {
  if (configManager) {
    return configManager.exportConfig(filePath)
  }
  return false
})

ipcMain.handle('config-import', (event, filePath) => {
  if (configManager) {
    return configManager.importConfig(filePath)
  }
  return null
})

// Auto-updater IPC handlers
ipcMain.handle('updater-check-for-updates', () => {
  if (autoUpdater) {
    autoUpdater.manualCheckForUpdates()
  }
})

ipcMain.handle('updater-quit-and-install', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall()
  }
})

ipcMain.handle('updater-get-status', () => {
  if (autoUpdater) {
    return autoUpdater.getUpdateStatus()
  }
  return { updateAvailable: false, updateDownloaded: false }
})

ipcMain.handle('config-import-file', (event, filePath) => {
  if (configManager) {
    return configManager.importConfig(filePath)
  }
  return false
})

ipcMain.handle('config-backup', () => {
  if (configManager) {
    return configManager.backup()
  }
  return null
})

ipcMain.handle('config-get-paths', () => {
  if (configManager) {
    return configManager.getConfigPaths()
  }
  return {}
})

// Window state management IPC handlers
ipcMain.handle('window-state-get', (event, windowType) => {
  if (windowStateManager) {
    return windowStateManager.getWindowState(windowType)
  }
  return null
})

ipcMain.handle('window-state-set', (event, windowType, properties) => {
  if (windowStateManager) {
    return windowStateManager.setWindowState(windowType, properties)
  }
  return false
})

ipcMain.handle('window-state-reset', (event, windowType) => {
  if (windowStateManager) {
    return windowStateManager.resetWindowState(windowType)
  }
  return false
})

ipcMain.handle('window-state-get-stats', () => {
  if (windowStateManager) {
    return windowStateManager.getStats()
  }
  return {}
})

ipcMain.handle(
  'window-state-move-to-display',
  (event, windowType, displayId) => {
    if (windowStateManager && windowManager) {
      const browserWindow =
        windowType === 'main'
          ? windowManager.getMainWindow()
          : windowManager.getFloatingNavigator()

      return windowStateManager.moveWindowToDisplay(
        windowType,
        displayId,
        browserWindow,
      )
    }
    return false
  },
)

ipcMain.handle('window-state-snap-to-edge', (event, windowType, edge) => {
  if (windowStateManager && windowManager) {
    const browserWindow =
      windowType === 'main'
        ? windowManager.getMainWindow()
        : windowManager.getFloatingNavigator()

    return windowStateManager.snapWindowToEdge(windowType, edge, browserWindow)
  }
  return false
})

ipcMain.handle('window-state-get-display', (event, windowType) => {
  if (windowStateManager) {
    return windowStateManager.getWindowDisplay(windowType)
  }
  return null
})

ipcMain.handle('window-state-get-all-displays', () => {
  if (windowStateManager) {
    return windowStateManager.getAllDisplays()
  }
  return []
})

// Floating navigator shortcut management
ipcMain.handle('floating-window-register-shortcuts', (event, shortcuts) => {
  try {
    // TODO: Implement shortcut registration in task 6.2
    console.log(
      'IPC: Registering floating navigator shortcuts:',
      shortcuts,
      '(placeholder)',
    )
    return true
  } catch (error) {
    console.error('Failed to register shortcuts:', error)
    return false
  }
})

ipcMain.handle(
  'floating-window-unregister-shortcuts',
  (event, shortcutKeys) => {
    try {
      // TODO: Implement shortcut unregistration in task 6.2
      console.log(
        'IPC: Unregistering floating navigator shortcuts:',
        shortcutKeys,
        '(placeholder)',
      )
      return true
    } catch (error) {
      console.error('Failed to unregister shortcuts:', error)
      return false
    }
  },
)

// IPC Error handling and monitoring handlers
ipcMain.handle('ipc-error-stats', () => {
  if (ipcErrorHandler) {
    return ipcErrorHandler.getStats()
  }
  return null
})

ipcMain.handle('ipc-error-health-check', async () => {
  if (ipcErrorHandler) {
    return ipcErrorHandler.healthCheck()
  }
  return { isHealthy: false, error: 'Error handler not initialized' }
})

ipcMain.handle('ipc-error-reset-stats', () => {
  if (ipcErrorHandler) {
    ipcErrorHandler.resetStats()
    return true
  }
  return false
})

// System integration error handling IPC handlers
ipcMain.handle('system-integration-get-status', () => {
  if (systemIntegrationErrorHandler) {
    return systemIntegrationErrorHandler.getIntegrationStatus()
  }
  return { overall: 'unknown', issues: [], components: {} }
})

ipcMain.handle('system-integration-get-report', () => {
  if (systemIntegrationErrorHandler) {
    return systemIntegrationErrorHandler.getStatusReport()
  }
  return null
})

ipcMain.handle('system-integration-retry-failed', async () => {
  if (systemIntegrationErrorHandler) {
    return systemIntegrationErrorHandler.retryFailedIntegrations()
  }
  return {}
})

ipcMain.handle('shortcuts-get-failed', () => {
  if (shortcutManager) {
    return shortcutManager.getFailedShortcuts()
  }
  return {}
})

ipcMain.handle('shortcuts-retry-failed', () => {
  if (shortcutManager) {
    return shortcutManager.retryFailedShortcuts()
  }
  return { success: false, message: 'Shortcut manager not available' }
})

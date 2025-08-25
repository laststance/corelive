const { app, BrowserWindow, ipcMain, session } = require('electron')

const { APIBridge } = require('./api-bridge.cjs')
const ConfigManager = require('./ConfigManager.cjs')
const { NextServerManager } = require('./next-server.cjs')
const NotificationManager = require('./NotificationManager.cjs')
const ShortcutManager = require('./ShortcutManager.cjs')
const SystemTrayManager = require('./SystemTrayManager.cjs')
const WindowManager = require('./WindowManager.cjs')
const WindowStateManager = require('./WindowStateManager.cjs')
// const { AuthManager } = require('./auth-manager')
const isDev = process.env.NODE_ENV === 'development'

// Keep a global reference of managers
let configManager
let windowStateManager
let windowManager
let systemTrayManager
let notificationManager
let shortcutManager
let apiBridge
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

  // Initialize system tray manager
  systemTrayManager = new SystemTrayManager(windowManager)

  // Initialize notification manager
  notificationManager = new NotificationManager(
    windowManager,
    systemTrayManager,
    configManager,
  )
  await notificationManager.initialize()

  // Initialize shortcut manager
  shortcutManager = new ShortcutManager(
    windowManager,
    notificationManager,
    configManager,
  )
  shortcutManager.initialize()

  // Create main window using WindowManager
  const mainWindow = windowManager.createMainWindow()

  // Create system tray
  systemTrayManager.createTray()

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
  if (apiBridge) {
    await apiBridge.disconnect()
  }
  if (nextServerManager) {
    await nextServerManager.stop()
  }
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

// Todo operation IPC handlers - connected to API bridge
ipcMain.handle('todo-get-all', async () => {
  try {
    if (!apiBridge) {
      throw new Error('API bridge not initialized')
    }
    return await apiBridge.getTodos()
  } catch (error) {
    console.error('Failed to get todos:', error)
    throw new Error('Failed to retrieve todos')
  }
})

ipcMain.handle('todo-get-by-id', async (event, id) => {
  try {
    // Validate input
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid todo ID')
    }

    // TODO: Connect to ORPC API in task 4.2
    console.log('IPC: Getting todo by ID:', id, '(placeholder)')
    return null
  } catch (error) {
    console.error('Failed to get todo:', error)
    throw new Error('Failed to retrieve todo')
  }
})

ipcMain.handle('todo-create', async (_event, todoData) => {
  try {
    // Validate input
    if (!todoData || typeof todoData !== 'object' || !todoData.title) {
      throw new Error('Invalid todo data')
    }

    if (!apiBridge) {
      throw new Error('API bridge not initialized')
    }

    const newTodo = await apiBridge.createTodo(todoData)

    // Show notification for task creation
    if (notificationManager) {
      notificationManager.showTaskCreatedNotification(newTodo)
    }

    return newTodo
  } catch (error) {
    console.error('Failed to create todo:', error)
    throw new Error('Failed to create todo')
  }
})

ipcMain.handle('todo-update', async (_event, id, updates) => {
  try {
    // Validate input
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid todo ID')
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Invalid update data')
    }

    if (!apiBridge) {
      throw new Error('API bridge not initialized')
    }

    const updatedTodo = await apiBridge.updateTodo(id, updates)

    // Show appropriate notification based on what was updated
    if (notificationManager) {
      if (updates.hasOwnProperty('completed')) {
        notificationManager.showTaskCompletedNotification(updatedTodo)
      } else {
        notificationManager.showTaskUpdatedNotification(updatedTodo, updates)
      }
    }

    return updatedTodo
  } catch (error) {
    console.error('Failed to update todo:', error)
    throw new Error('Failed to update todo')
  }
})

ipcMain.handle('todo-delete', async (_event, id) => {
  try {
    // Validate input
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid todo ID')
    }

    if (!apiBridge) {
      throw new Error('API bridge not initialized')
    }

    // Get todo before deletion for notification
    const todoToDelete = await apiBridge.getTodoById(id)

    const result = await apiBridge.deleteTodo(id)

    // Show notification for task deletion
    if (notificationManager && todoToDelete) {
      notificationManager.showTaskDeletedNotification(todoToDelete)
    }

    return result
  } catch (error) {
    console.error('Failed to delete todo:', error)
    throw new Error('Failed to delete todo')
  }
})

// Window management IPC handlers
ipcMain.handle('window-minimize', () => {
  if (windowManager && windowManager.hasMainWindow()) {
    windowManager.minimizeToTray()
  }
})

ipcMain.handle('window-close', () => {
  if (windowManager && windowManager.hasMainWindow()) {
    windowManager.minimizeToTray()
  }
})

ipcMain.handle('window-toggle-floating-navigator', () => {
  if (windowManager) {
    windowManager.toggleFloatingNavigator()
  }
})

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

// Notification management IPC handlers
ipcMain.handle('notification-show', (event, title, body, options) => {
  if (notificationManager) {
    return notificationManager.showNotification(title, body, options)
  }
})

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

// Configuration management IPC handlers
ipcMain.handle('config-get', (event, path, defaultValue) => {
  if (configManager) {
    return configManager.get(path, defaultValue)
  }
  return defaultValue
})

ipcMain.handle('config-set', (event, path, value) => {
  if (configManager) {
    return configManager.set(path, value)
  }
  return false
})

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

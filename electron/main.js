const { app, BrowserWindow, ipcMain, session } = require('electron')

const { APIBridge } = require('./api-bridge')
const { NextServerManager } = require('./next-server')
const SystemTrayManager = require('./SystemTrayManager')
const WindowManager = require('./WindowManager')
// const { AuthManager } = require('./auth-manager')
const isDev = process.env.NODE_ENV === 'development'

// Keep a global reference of managers
let windowManager
let systemTrayManager
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
  // Initialize Next.js server
  nextServerManager = new NextServerManager()
  const serverUrl = await nextServerManager.start()

  // Initialize API bridge
  apiBridge = new APIBridge()
  await apiBridge.initialize()

  // Initialize authentication manager
  // authManager = new AuthManager(apiBridge)

  // Initialize window manager with server URL
  windowManager = new WindowManager(serverUrl)

  // Initialize system tray manager
  systemTrayManager = new SystemTrayManager(windowManager)

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

    return await apiBridge.createTodo(todoData)
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

    return await apiBridge.updateTodo(id, updates)
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

    return await apiBridge.deleteTodo(id)
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

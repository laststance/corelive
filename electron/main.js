const { app, BrowserWindow, ipcMain, session } = require('electron')

const SystemTrayManager = require('./SystemTrayManager')
const WindowManager = require('./WindowManager')
const isDev = process.env.NODE_ENV === 'development'

// Keep a global reference of managers
let windowManager
let systemTrayManager

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

function createWindow() {
  // Initialize window manager
  windowManager = new WindowManager()

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
app.on('before-quit', () => {
  if (systemTrayManager) {
    systemTrayManager.setQuitting(true)
  }
  if (windowManager) {
    windowManager.cleanup()
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

// Basic IPC handlers (will be expanded in later tasks)
ipcMain.handle('app-version', () => {
  return app.getVersion()
})

ipcMain.handle('app-quit', () => {
  app.quit()
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

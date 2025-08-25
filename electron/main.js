const path = require('path')

const { app, BrowserWindow, ipcMain } = require('electron')
const isDev = process.env.NODE_ENV === 'development'

// Keep a global reference of the window object
let mainWindow

function createWindow() {
  // Create the browser window with security best practices
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false, // Security: disable node integration
      contextIsolation: true, // Security: enable context isolation
      enableRemoteModule: false, // Security: disable remote module
      preload: path.join(__dirname, 'preload.js'), // Preload script for secure IPC
      webSecurity: true, // Security: enable web security
    },
    icon: path.join(__dirname, '../public/favicon.ico'), // App icon
    show: false, // Don't show until ready-to-show
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  })

  // Load the Next.js app
  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../out/index.html')}`

  mainWindow.loadURL(startUrl)

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()

    // Open DevTools in development
    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Security: Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow same-origin navigation
    if (url.startsWith(startUrl)) {
      return { action: 'allow' }
    }
    return { action: 'deny' }
  })

  // Security: Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, _navigationUrl) => {
    const parsedUrl = new URL(_navigationUrl)

    if (parsedUrl.origin !== new URL(startUrl).origin) {
      event.preventDefault()
    }
  })
}

// App event handlers
app.whenReady().then(() => {
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

// Security: Prevent new window creation from renderer
app.on('web-contents-created', (_event, contents) => {
  contents.on('new-window', (event, _navigationUrl) => {
    event.preventDefault()
  })
})

// Basic IPC handlers (will be expanded in later tasks)
ipcMain.handle('app-version', () => {
  return app.getVersion()
})

ipcMain.handle('app-quit', () => {
  app.quit()
})

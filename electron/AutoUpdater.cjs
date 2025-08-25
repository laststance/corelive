const { dialog } = require('electron')
const log = require('electron-log')
const { autoUpdater } = require('electron-updater')

class AutoUpdater {
  constructor() {
    this.mainWindow = null
    this.updateAvailable = false
    this.updateDownloaded = false

    // Configure logging
    log.transports.file.level = 'info'
    autoUpdater.logger = log

    // Configure auto-updater
    this.setupAutoUpdater()
  }

  setMainWindow(window) {
    this.mainWindow = window
  }

  setupAutoUpdater() {
    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...')
      this.sendStatusToWindow('Checking for update...')
    })

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info)
      this.updateAvailable = true
      this.sendStatusToWindow('Update available')
      this.showUpdateAvailableDialog(info)
    })

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info)
      this.sendStatusToWindow('Update not available')
    })

    autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater:', err)
      this.sendStatusToWindow('Error in auto-updater')
    })

    autoUpdater.on('download-progress', (progressObj) => {
      let logMessage = `Download speed: ${progressObj.bytesPerSecond}`
      logMessage += ` - Downloaded ${progressObj.percent}%`
      logMessage += ` (${progressObj.transferred}/${progressObj.total})`
      log.info(logMessage)
      this.sendStatusToWindow(
        `Downloading update: ${Math.round(progressObj.percent)}%`,
      )
    })

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info)
      this.updateDownloaded = true
      this.sendStatusToWindow('Update downloaded')
      this.showUpdateDownloadedDialog()
    })

    // Check for updates on startup (after 3 seconds)
    setTimeout(() => {
      this.checkForUpdates()
    }, 3000)

    // Check for updates every 4 hours
    setInterval(
      () => {
        this.checkForUpdates()
      },
      4 * 60 * 60 * 1000,
    )
  }

  checkForUpdates() {
    if (process.env.NODE_ENV === 'development') {
      log.info('Skipping update check in development mode')
      return
    }

    try {
      autoUpdater.checkForUpdatesAndNotify()
    } catch (error) {
      log.error('Failed to check for updates:', error)
    }
  }

  async showUpdateAvailableDialog(info) {
    if (!this.mainWindow) return

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail:
        'Would you like to download it now? The update will be installed when you restart the application.',
      buttons: ['Download Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })

    if (result.response === 0) {
      autoUpdater.downloadUpdate()
    }
  }

  async showUpdateDownloadedDialog() {
    if (!this.mainWindow) return

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: 'The application will restart to apply the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })

    if (result.response === 0) {
      autoUpdater.quitAndInstall()
    }
  }

  sendStatusToWindow(text) {
    log.info(text)
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('updater-message', text)
    }
  }

  // Manual update check (called from menu or UI)
  manualCheckForUpdates() {
    autoUpdater.checkForUpdatesAndNotify()
  }

  // Force update installation
  quitAndInstall() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall()
    }
  }

  // Get update status
  getUpdateStatus() {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
    }
  }
}

module.exports = AutoUpdater

/**
 * @fileoverview Auto-Update Manager for Electron Application
 *
 * Manages automatic application updates using electron-updater.
 *
 * @module electron/AutoUpdater
 */

import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'

// ============================================================================
// Type Definitions
// ============================================================================

/** Update status */
interface UpdateStatus {
  updateAvailable: boolean
  updateDownloaded: boolean
}

// ============================================================================
// Auto Updater Class
// ============================================================================

/**
 * Manages automatic application updates.
 */
export class AutoUpdater {
  /** Reference to main window for dialogs */
  private mainWindow: BrowserWindow | null

  /** Track if update is available */
  private updateAvailable: boolean

  /** Track if update is ready */
  private updateDownloaded: boolean

  constructor() {
    this.mainWindow = null
    this.updateAvailable = false
    this.updateDownloaded = false

    log.transports.file.level = 'info'
    autoUpdater.logger = log

    this.setupAutoUpdater()
  }

  /**
   * Set the main window reference.
   *
   * @param window - The main BrowserWindow
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * Configures auto-updater event handlers and scheduling.
   */
  setupAutoUpdater(): void {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...')
      this.sendStatusToWindow('Checking for update...')
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info('Update available:', info)
      this.updateAvailable = true
      this.sendStatusToWindow('Update available')
      this.showUpdateAvailableDialog(info)
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      log.info('Update not available:', info)
      this.sendStatusToWindow('Update not available')
    })

    autoUpdater.on('error', (err: Error) => {
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

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded:', info)
      this.updateDownloaded = true
      this.sendStatusToWindow('Update downloaded')
      this.showUpdateDownloadedDialog()
    })

    // Initial check after startup
    setTimeout(() => {
      this.checkForUpdates()
    }, 3000)

    // Periodic checks every 4 hours
    setInterval(
      () => {
        this.checkForUpdates()
      },
      4 * 60 * 60 * 1000,
    )
  }

  /**
   * Checks for available updates.
   */
  checkForUpdates(): void {
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

  /**
   * Shows dialog when update is available.
   *
   * @param info - Update information including version
   */
  async showUpdateAvailableDialog(info: UpdateInfo): Promise<void> {
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

  /**
   * Shows dialog when update has been downloaded.
   */
  async showUpdateDownloadedDialog(): Promise<void> {
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

  /**
   * Sends status message to window.
   *
   * @param text - Status message
   */
  sendStatusToWindow(text: string): void {
    log.info(text)
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('updater-message', text)
    }
  }

  /**
   * Manual update check (called from menu or UI).
   */
  manualCheckForUpdates(): void {
    autoUpdater.checkForUpdatesAndNotify()
  }

  /**
   * Force update installation.
   */
  quitAndInstall(): void {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall()
    }
  }

  /**
   * Get update status.
   *
   * @returns Current update status
   */
  getUpdateStatus(): UpdateStatus {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
    }
  }
}

export default AutoUpdater

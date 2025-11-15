/**
 * @fileoverview Auto-Update Manager for Electron Application
 *
 * Manages automatic application updates using electron-updater.
 *
 * Why auto-updates are crucial for desktop apps:
 * - Security: Quickly patch vulnerabilities
 * - Bug fixes: Deploy fixes without user intervention
 * - Features: Deliver new functionality seamlessly
 * - Consistency: Keep all users on compatible versions
 * - User experience: No manual download/install process
 *
 * How electron-updater works:
 * 1. Checks update server for new versions
 * 2. Downloads updates in background
 * 3. Verifies signatures for security
 * 4. Prompts user to install
 * 5. Applies update on restart
 *
 * Update channels:
 * - Stable: Production releases
 * - Beta: Preview releases
 * - Alpha: Development releases
 *
 * Security considerations:
 * - Always use code signing for updates
 * - Use HTTPS for update servers
 * - Verify update integrity
 * - Never auto-update without user consent
 *
 * @module electron/AutoUpdater
 */

const { dialog } = require('electron')
const log = require('electron-log')
const { autoUpdater } = require('electron-updater')

/**
 * Manages automatic application updates.
 *
 * Features:
 * - Automatic update checking
 * - Background downloading
 * - Progress reporting
 * - User notifications
 * - Manual update triggers
 * - Rollback support (via electron-updater)
 *
 * The updater requires:
 * - Code signing certificates (macOS/Windows)
 * - Update server (GitHub releases, S3, etc.)
 * - Version configuration in package.json
 */
class AutoUpdater {
  constructor() {
    this.mainWindow = null // Reference to main window for dialogs
    this.updateAvailable = false // Track if update is available
    this.updateDownloaded = false // Track if update is ready

    // Configure logging for debugging update issues
    log.transports.file.level = 'info'
    autoUpdater.logger = log

    // Set up event handlers and start checking
    this.setupAutoUpdater()
  }

  setMainWindow(window) {
    this.mainWindow = window
  }

  /**
   * Configures auto-updater event handlers and scheduling.
   *
   * Sets up:
   * - Event listeners for update lifecycle
   * - Automatic checking schedule
   * - User notification dialogs
   *
   * Update lifecycle events:
   * 1. checking-for-update: Started checking
   * 2. update-available: New version found
   * 3. update-not-available: Already latest
   * 4. download-progress: Downloading update
   * 5. update-downloaded: Ready to install
   * 6. error: Something went wrong
   */
  setupAutoUpdater() {
    /**
     * Event: Checking for updates started
     * Good UX to show user something is happening
     */
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

    /**
     * Automatic update checking schedule.
     *
     * Strategy:
     * - Wait 3 seconds after startup (let app fully load)
     * - Check every 4 hours thereafter
     *
     * Why these intervals?
     * - Startup delay: Avoid competing with app initialization
     * - 4 hours: Balance between timely updates and server load
     * - Not too frequent: Respect user bandwidth
     */

    // Initial check after startup
    setTimeout(() => {
      this.checkForUpdates()
    }, 3000)

    // Periodic checks
    setInterval(
      () => {
        this.checkForUpdates()
      },
      4 * 60 * 60 * 1000, // 4 hours in milliseconds
    )
  }

  /**
   * Checks for available updates.
   *
   * Safety features:
   * - Skips in development (no update server)
   * - Catches errors (network issues, server down)
   * - Non-blocking (won't crash app)
   *
   * The actual update check:
   * - Fetches latest release from update server
   * - Compares version with current app
   * - Triggers download if newer version exists
   */
  checkForUpdates() {
    // Never check for updates in development
    if (process.env.NODE_ENV === 'development') {
      log.info('Skipping update check in development mode')
      return
    }

    try {
      // Check and notify user if update found
      autoUpdater.checkForUpdatesAndNotify()
    } catch (error) {
      // Non-fatal: App works without updates
      log.error('Failed to check for updates:', error)
    }
  }

  /**
   * Shows dialog when update is available.
   *
   * User consent is critical:
   * - Never force updates without permission
   * - Explain what will happen
   * - Allow users to postpone
   * - Respect user's bandwidth
   *
   * @param {Object} info - Update information including version
   */
  async showUpdateAvailableDialog(info) {
    if (!this.mainWindow) return

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail:
        'Would you like to download it now? The update will be installed when you restart the application.',
      buttons: ['Download Now', 'Later'],
      defaultId: 0, // Focus on 'Download Now'
      cancelId: 1, // ESC key selects 'Later'
    })

    if (result.response === 0) {
      // User chose to download
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

/**
 * @fileoverview Auto-Update Manager for Electron Application
 *
 * Manages automatic application updates using electron-updater.
 *
 * @module electron/AutoUpdater
 */

import { BrowserWindow, dialog, screen } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'

import {
  UPDATE_PROGRESS_PERCENT_MAX,
  UPDATE_PROGRESS_PERCENT_MIN,
  UPDATE_PROGRESS_WINDOW_BOTTOM_OFFSET_PX,
  UPDATE_PROGRESS_WINDOW_HEIGHT_PX,
  UPDATE_PROGRESS_WINDOW_WIDTH_PX,
} from './constants'
import { typedSend } from './ipc/typedSend'
import { log } from './logger'
import type { UpdaterDownloadProgress } from './types/ipc'
import {
  buildUpdateProgressWindowHtml,
  buildUpdateProgressWindowUpdateScript,
} from './update-progress-window-html'

// ============================================================================
// Type Definitions
// ============================================================================

/** Update status */
interface UpdateStatus {
  updateAvailable: boolean
  updateDownloaded: boolean
  downloadProgress: UpdaterDownloadProgress | null
}

/**
 * Minimal logger interface expected by `electron-updater`.
 * We use our own `pino`-based logger to avoid relying on `electron-log` at runtime.
 */
interface UpdaterLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

/**
 * Keeps update progress values finite before they reach UI surfaces.
 * @param value - Raw numeric value from electron-updater.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns Finite number clamped between min and max.
 * @example
 * clampFiniteProgressValue(Number.NaN, 0, 100) // => 0
 */
function clampFiniteProgressValue(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Keeps byte metrics non-negative before renderer IPC receives them.
 * @param value - Raw byte or speed metric from electron-updater.
 * @returns Finite non-negative metric, or 0 when the source is invalid.
 * @example
 * normalizeProgressMetric(-1) // => 0
 */
function normalizeProgressMetric(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

/**
 * Converts electron-updater progress into the stable renderer/native shape.
 * @param progress - Raw electron-updater ProgressInfo payload.
 * @returns Clamped progress where percent is always in the inclusive 0-100 range.
 * @example
 * normalizeDownloadProgress({ percent: 140, bytesPerSecond: 1, transferred: 2, total: 3, delta: 0 })
 */
export function normalizeDownloadProgress(
  progress: ProgressInfo,
): UpdaterDownloadProgress {
  return {
    percent: clampFiniteProgressValue(
      progress.percent,
      UPDATE_PROGRESS_PERCENT_MIN,
      UPDATE_PROGRESS_PERCENT_MAX,
    ),
    bytesPerSecond: normalizeProgressMetric(progress.bytesPerSecond),
    transferred: normalizeProgressMetric(progress.transferred),
    total: normalizeProgressMetric(progress.total),
  }
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

  /** Latest download progress, or null when no download is active */
  private downloadProgress: UpdaterDownloadProgress | null

  /** Native passive window that shows update download progress */
  private updateProgressWindow: BrowserWindow | null

  /** Initial check timeout reference for cleanup */
  private initialCheckTimeout: ReturnType<typeof setTimeout> | null = null

  /** Periodic check interval reference for cleanup */
  private periodicCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.mainWindow = null
    this.updateAvailable = false
    this.updateDownloaded = false
    this.downloadProgress = null
    this.updateProgressWindow = null

    // Type for pino logger methods that accept rest parameters
    type LogMethod = (...args: unknown[]) => void

    const updaterLogger: UpdaterLogger = {
      info: (...args) => (log.info as LogMethod)(...args),
      warn: (...args) => (log.warn as LogMethod)(...args),
      error: (...args) => (log.error as LogMethod)(...args),
      debug: (...args) => (log.debug as LogMethod)(...args),
    }
    autoUpdater.logger = updaterLogger as typeof autoUpdater.logger

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
      // Reset state flags at the start of each check to ensure consistency
      this.updateAvailable = false
      this.updateDownloaded = false
      this.clearDownloadProgress()
      this.sendStatusToWindow('Checking for update...')
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info('Update available', info)
      this.updateAvailable = true
      this.sendStatusToWindow('Update available')
      this.showUpdateAvailableDialog(info).catch((err) => {
        log.error('Failed to show update available dialog:', err)
      })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      log.info('Update not available', info)
      // Reset status flags when no update is available
      this.updateAvailable = false
      this.updateDownloaded = false
      this.clearDownloadProgress()
      this.sendStatusToWindow('Update not available')
    })

    autoUpdater.on('error', (err: Error) => {
      log.error('Error in auto-updater:', err)
      // Reset status flags on error to allow retry
      this.updateAvailable = false
      this.updateDownloaded = false
      this.clearDownloadProgress()
      this.sendStatusToWindow('Error in auto-updater')
    })

    autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
      const progress = normalizeDownloadProgress(progressObj)
      let logMessage = `Download speed: ${progressObj.bytesPerSecond}`
      logMessage += ` - Downloaded ${progressObj.percent}%`
      logMessage += ` (${progressObj.transferred}/${progressObj.total})`
      log.info(logMessage)
      this.sendDownloadProgress(progress)
      this.sendStatusToWindow(
        `Downloading update: ${Math.round(progress.percent)}%`,
      )
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded', info)
      this.updateDownloaded = true
      this.sendDownloadProgress({
        percent: UPDATE_PROGRESS_PERCENT_MAX,
        bytesPerSecond: this.downloadProgress?.bytesPerSecond ?? 0,
        transferred: this.downloadProgress?.total ?? 0,
        total: this.downloadProgress?.total ?? 0,
      })
      this.closeUpdateProgressWindow()
      this.downloadProgress = null
      this.sendStatusToWindow('Update downloaded')
      this.showUpdateDownloadedDialog().catch((err) => {
        log.error('Failed to show update downloaded dialog:', err)
      })
    })

    // Initial check after startup
    this.initialCheckTimeout = setTimeout(() => {
      this.checkForUpdates()
    }, 3000)

    // Periodic checks every 4 hours
    this.periodicCheckInterval = setInterval(
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

    // Handle async rejection from electron-updater Promise
    void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      log.error('Failed to check for updates:', error)
      // Reset state flags on error to allow retry
      this.updateAvailable = false
      this.updateDownloaded = false
      this.clearDownloadProgress()
    })
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
      this.sendDownloadProgress({
        percent: UPDATE_PROGRESS_PERCENT_MIN,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
      })
      // Handle async rejection from downloadUpdate Promise
      void autoUpdater.downloadUpdate().catch((error) => {
        log.error('Failed to download update:', error)
        this.clearDownloadProgress()
        this.sendStatusToWindow('Failed to download update')
      })
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
      typedSend(this.mainWindow.webContents, 'updater-message', text)
    }
  }

  /**
   * Broadcasts and displays update download progress while a package downloads.
   * @param progress - Normalized progress payload to show in native + renderer UI.
   * @returns Nothing; lost renderer/window updates are logged and ignored.
   * @example
   * updater.sendDownloadProgress({ percent: 42, bytesPerSecond: 1, transferred: 2, total: 4 })
   */
  private sendDownloadProgress(progress: UpdaterDownloadProgress): void {
    this.downloadProgress = progress
    this.showUpdateProgressWindow(progress)

    if (this.mainWindow && this.mainWindow.webContents) {
      typedSend(
        this.mainWindow.webContents,
        'updater-download-progress',
        progress,
      )
    }
  }

  /**
   * Opens or updates the passive native progress window.
   * @param progress - Normalized progress payload to paint.
   * @returns Nothing; window creation is skipped only when Electron cannot build it.
   * @example
   * updater.showUpdateProgressWindow({ percent: 10, bytesPerSecond: 1, transferred: 1, total: 10 })
   */
  private showUpdateProgressWindow(progress: UpdaterDownloadProgress): void {
    if (!this.updateProgressWindow || this.updateProgressWindow.isDestroyed()) {
      const display =
        this.mainWindow && !this.mainWindow.isDestroyed()
          ? screen.getDisplayMatching(this.mainWindow.getBounds())
          : screen.getPrimaryDisplay()
      const { workArea } = display
      const x = Math.round(
        workArea.x + (workArea.width - UPDATE_PROGRESS_WINDOW_WIDTH_PX) / 2,
      )
      const y = Math.round(
        workArea.y +
          workArea.height -
          UPDATE_PROGRESS_WINDOW_HEIGHT_PX -
          UPDATE_PROGRESS_WINDOW_BOTTOM_OFFSET_PX,
      )

      this.updateProgressWindow = new BrowserWindow({
        width: UPDATE_PROGRESS_WINDOW_WIDTH_PX,
        height: UPDATE_PROGRESS_WINDOW_HEIGHT_PX,
        x,
        y,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        focusable: false,
        alwaysOnTop: true,
        acceptFirstMouse: false,
        backgroundColor: '#00000000',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          devTools: false,
        },
      })
      this.updateProgressWindow.setIgnoreMouseEvents(true)
      this.updateProgressWindow.on('closed', () => {
        this.updateProgressWindow = null
      })
      this.updateProgressWindow.once('ready-to-show', () => {
        if (
          this.updateProgressWindow &&
          !this.updateProgressWindow.isDestroyed()
        ) {
          this.updateProgressWindow.showInactive()
        }
      })
      void this.updateProgressWindow
        .loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            buildUpdateProgressWindowHtml(progress),
          )}`,
        )
        .catch((error: unknown) => {
          log.debug('Failed to load native update progress window:', error)
        })
      return
    }

    void this.updateProgressWindow.webContents
      .executeJavaScript(buildUpdateProgressWindowUpdateScript(progress))
      .catch((error: unknown) => {
        log.debug('Failed to update native update progress window:', error)
      })
  }

  /**
   * Destroys the passive native progress window if it exists.
   * @returns Nothing; safe to call repeatedly.
   * @example
   * updater.closeUpdateProgressWindow()
   */
  private closeUpdateProgressWindow(): void {
    if (!this.updateProgressWindow) return
    if (!this.updateProgressWindow.isDestroyed()) {
      this.updateProgressWindow.destroy()
    }
    this.updateProgressWindow = null
  }

  /**
   * Clears active download state and removes the passive native progress UI.
   * @returns Nothing; used by no-update, error, failed-download, and cleanup paths.
   * @example
   * updater.clearDownloadProgress()
   */
  private clearDownloadProgress(): void {
    this.downloadProgress = null
    this.closeUpdateProgressWindow()
  }

  /**
   * Manual update check (called from menu or UI).
   */
  manualCheckForUpdates(): void {
    // Handle async rejection from electron-updater Promise
    void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      log.error('Failed to manually check for updates:', error)
      // Reset state flags on error to allow retry
      this.updateAvailable = false
      this.updateDownloaded = false
      this.clearDownloadProgress()
    })
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
      downloadProgress: this.downloadProgress,
    }
  }

  /**
   * Cleans up timers, event listeners, and resources.
   *
   * Call this when disposing the AutoUpdater to prevent memory leaks.
   */
  cleanup(): void {
    // Clear timers
    if (this.initialCheckTimeout) {
      clearTimeout(this.initialCheckTimeout)
      this.initialCheckTimeout = null
    }
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval)
      this.periodicCheckInterval = null
    }

    // Remove all event listeners registered on autoUpdater
    autoUpdater.removeAllListeners('checking-for-update')
    autoUpdater.removeAllListeners('update-available')
    autoUpdater.removeAllListeners('update-not-available')
    autoUpdater.removeAllListeners('error')
    autoUpdater.removeAllListeners('download-progress')
    autoUpdater.removeAllListeners('update-downloaded')

    // Clear window reference
    this.mainWindow = null
    this.closeUpdateProgressWindow()

    // Reset status flags
    this.updateAvailable = false
    this.updateDownloaded = false
    this.downloadProgress = null
  }
}

export default AutoUpdater

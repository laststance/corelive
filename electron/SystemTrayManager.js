const path = require('path')

const { Tray, Menu, nativeImage, Notification } = require('electron')

class SystemTrayManager {
  constructor(windowManager) {
    this.windowManager = windowManager
    this.tray = null
    this.isQuitting = false
  }

  /**
   * Create system tray with icon and context menu
   */
  createTray() {
    // Create tray icon
    const iconPath = this.getTrayIconPath()
    const trayIcon = nativeImage.createFromPath(iconPath)

    // Resize icon for tray (16x16 on most platforms)
    this.tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

    // Set tooltip
    this.tray.setToolTip('TODO Desktop App')

    // Create context menu
    this.updateTrayMenu()

    // Handle tray click events
    this.setupTrayEvents()

    return this.tray
  }

  /**
   * Get appropriate tray icon path based on platform
   */
  getTrayIconPath() {
    // For now, use a simple approach - create a basic icon
    // TODO: Create proper tray icons (16x16 PNG files)
    const fs = require('fs')
    const faviconPath = path.join(__dirname, '../public/favicon.ico')

    // Check if favicon exists, otherwise create a fallback
    if (fs.existsSync(faviconPath)) {
      return faviconPath
    }

    // Return empty path for now - Electron will use default
    return ''
  }

  /**
   * Update tray context menu
   */
  updateTrayMenu(tasks = []) {
    if (!this.tray) return

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show TODO App',
        click: () => {
          this.windowManager.restoreFromTray()
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Toggle Floating Navigator',
        click: () => {
          this.windowManager.toggleFloatingNavigator()
        },
      },
      {
        type: 'separator',
      },
      ...this.buildTaskMenuItems(tasks),
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: () => {
          this.isQuitting = true
          require('electron').app.quit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)
  }
  /**
   * Build menu items for recent tasks
   */
  buildTaskMenuItems(tasks) {
    if (!tasks || tasks.length === 0) {
      return [
        {
          label: 'No recent tasks',
          enabled: false,
        },
      ]
    }

    // Show up to 5 most recent tasks
    const recentTasks = tasks.slice(0, 5)

    return recentTasks.map((task) => ({
      label: `${task.completed ? '✓' : '○'} ${task.title.substring(0, 30)}${task.title.length > 30 ? '...' : ''}`,
      click: () => {
        // Focus main window and navigate to task
        this.windowManager.restoreFromTray()
        // TODO: Send IPC to focus specific task
      },
    }))
  }

  /**
   * Setup tray event handlers
   */
  setupTrayEvents() {
    if (!this.tray) return

    // Handle single click (Windows/Linux) and double click (macOS)
    if (process.platform === 'darwin') {
      // macOS: double-click to restore
      this.tray.on('double-click', () => {
        this.windowManager.restoreFromTray()
      })
    } else {
      // Windows/Linux: single click to restore
      this.tray.on('click', () => {
        this.windowManager.restoreFromTray()
      })
    }

    // Right-click shows context menu (handled automatically by Electron)
  }

  /**
   * Show native notification
   */
  showNotification(title, body, options = {}) {
    if (!Notification.isSupported()) {
      console.warn('Notifications are not supported on this system')
      return
    }

    const notification = new Notification({
      title,
      body,
      icon: this.getTrayIconPath(),
      silent: options.silent || false,
      ...options,
    })

    // Handle notification click
    notification.on('click', () => {
      this.windowManager.restoreFromTray()
      if (options.onClick) {
        options.onClick()
      }
    })

    notification.show()
    return notification
  }

  /**
   * Update tray tooltip
   */
  setTrayTooltip(text) {
    if (this.tray) {
      this.tray.setToolTip(text)
    }
  }

  /**
   * Handle window close event - minimize to tray instead of closing
   */
  handleWindowClose(event) {
    if (!this.isQuitting) {
      event.preventDefault()
      this.windowManager.minimizeToTray()

      // Show notification on first minimize to tray
      if (!this.hasShownTrayNotification) {
        this.showNotification(
          'TODO App',
          'App was minimized to tray. Click the tray icon to restore.',
          { silent: true },
        )
        this.hasShownTrayNotification = true
      }
    }
  }

  /**
   * Set quitting flag to allow actual app quit
   */
  setQuitting(quitting = true) {
    this.isQuitting = quitting
  }

  /**
   * Check if app is quitting
   */
  isAppQuitting() {
    return this.isQuitting
  }

  /**
   * Destroy tray
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  /**
   * Get tray instance
   */
  getTray() {
    return this.tray
  }

  /**
   * Check if tray exists
   */
  hasTray() {
    return this.tray && !this.tray.isDestroyed()
  }
}

module.exports = SystemTrayManager

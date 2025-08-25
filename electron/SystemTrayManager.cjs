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
    try {
      // Check if system tray is supported on this platform
      if (!this.isSystemTraySupported()) {
        console.warn('System tray is not supported on this platform')
        this.tray = null
        this.enableFallbackMode()
        return null
      }

      // Create tray icon with comprehensive error handling
      const trayIcon = this.createTrayIcon()
      if (!trayIcon) {
        console.warn('Failed to create tray icon, enabling fallback mode')
        this.enableFallbackMode()
        return null
      }

      // Attempt to create tray with retry logic
      this.tray = this.createTrayWithRetry(trayIcon)
      if (!this.tray) {
        console.warn(
          'Failed to create system tray after retries, enabling fallback mode',
        )
        this.enableFallbackMode()
        return null
      }

      // Set tooltip with error handling
      this.setTrayTooltipSafely('TODO Desktop App')

      // Create context menu with error handling
      if (!this.setupTrayMenuSafely()) {
        console.warn('Failed to setup tray menu, using minimal functionality')
      }

      // Handle tray click events with error handling
      if (!this.setupTrayEventsSafely()) {
        console.warn(
          'Failed to setup tray events, tray will have limited functionality',
        )
      }

      console.log('✅ System tray created successfully')
      return this.tray
    } catch (error) {
      console.error('❌ Failed to create system tray:', error)
      this.handleTrayCreationFailure(error)
      return null
    }
  }

  /**
   * Check if system tray is supported on current platform
   */
  isSystemTraySupported() {
    try {
      // System tray is generally supported on all major platforms
      // but may fail in some environments (like headless servers, some Linux distros)
      return (
        process.platform === 'win32' ||
        process.platform === 'darwin' ||
        process.platform === 'linux'
      )
    } catch (error) {
      console.warn('Error checking system tray support:', error)
      return false
    }
  }

  /**
   * Create tray icon with fallback options
   */
  createTrayIcon() {
    try {
      const iconPath = this.getTrayIconPath()
      let trayIcon

      if (iconPath) {
        try {
          trayIcon = nativeImage.createFromPath(iconPath)
          if (!trayIcon.isEmpty()) {
            // Resize icon for tray (16x16 on most platforms)
            trayIcon = trayIcon.resize({ width: 16, height: 16 })
            return trayIcon
          }
        } catch (iconError) {
          console.warn('Failed to load tray icon from path:', iconError)
        }
      }

      // Try to create a simple colored icon as fallback
      try {
        trayIcon = this.createFallbackIcon()
        if (trayIcon && !trayIcon.isEmpty()) {
          return trayIcon
        }
      } catch (fallbackError) {
        console.warn('Failed to create fallback icon:', fallbackError)
      }

      // Last resort: create empty image
      try {
        return nativeImage.createEmpty()
      } catch (emptyError) {
        console.error('Failed to create empty icon:', emptyError)
        return null
      }
    } catch (error) {
      console.error('Error creating tray icon:', error)
      return null
    }
  }

  /**
   * Create a simple fallback icon
   */
  createFallbackIcon() {
    try {
      // Try to create a simple icon programmatically without external dependencies
      // Create a minimal 16x16 bitmap
      const width = 16
      const height = 16
      const buffer = Buffer.alloc(width * height * 4) // RGBA

      // Fill with blue color (#007ACC)
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 0 // R
        buffer[i + 1] = 122 // G
        buffer[i + 2] = 204 // B
        buffer[i + 3] = 255 // A
      }

      return nativeImage.createFromBuffer(buffer, { width, height })
    } catch (bitmapError) {
      console.warn('Failed to create bitmap fallback icon:', bitmapError)
      return null
    }
  }

  /**
   * Create tray with retry logic
   */
  createTrayWithRetry(trayIcon, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tray = new Tray(trayIcon)

        // Test if tray was created successfully
        if (tray && !tray.isDestroyed()) {
          return tray
        }
      } catch (error) {
        console.warn(`Tray creation attempt ${attempt} failed:`, error)

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.pow(2, attempt - 1) * 100
          // Use a simple busy wait instead of shell command for cross-platform compatibility
          const start = Date.now()
          while (Date.now() - start < delay) {
            // Busy wait
          }
        }
      }
    }

    return null
  }

  /**
   * Set tray tooltip safely
   */
  setTrayTooltipSafely(text) {
    if (!this.tray || this.tray.isDestroyed()) return false

    try {
      this.tray.setToolTip(text)
      return true
    } catch (error) {
      console.warn('Failed to set tray tooltip:', error)
      return false
    }
  }

  /**
   * Setup tray menu safely
   */
  setupTrayMenuSafely() {
    try {
      this.updateTrayMenu()
      return true
    } catch (error) {
      console.warn('Failed to create tray menu:', error)

      try {
        this.createFallbackMenu()
        return true
      } catch (fallbackError) {
        console.error('Failed to create fallback menu:', fallbackError)
        return false
      }
    }
  }

  /**
   * Setup tray events safely
   */
  setupTrayEventsSafely() {
    try {
      this.setupTrayEvents()
      return true
    } catch (error) {
      console.warn('Failed to setup tray events:', error)
      return false
    }
  }

  /**
   * Handle tray creation failure and enable fallback mode
   */
  handleTrayCreationFailure(error) {
    console.error('System tray creation failed completely:', error)
    this.tray = null
    this.enableFallbackMode()

    // Notify user about tray unavailability
    if (this.windowManager) {
      try {
        // Show a notification if possible
        const { Notification } = require('electron')
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: 'System Tray Unavailable',
            body: 'System tray could not be created. The app will continue without tray functionality.',
            silent: true,
          })
          notification.show()
        }
      } catch (notificationError) {
        console.warn(
          'Could not show tray failure notification:',
          notificationError,
        )
      }
    }
  }

  /**
   * Enable fallback mode when tray is not available
   */
  enableFallbackMode() {
    this.fallbackMode = true
    console.log('📱 Enabled fallback mode - app will not minimize to tray')

    // Modify window behavior to not minimize to tray
    if (this.windowManager) {
      this.windowManager.setTrayFallbackMode(true)
    }
  }

  /**
   * Check if running in fallback mode
   */
  isFallbackMode() {
    return this.fallbackMode || false
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
    if (!this.tray || this.tray.isDestroyed()) {
      console.warn('Cannot update tray menu: tray not available')
      return false
    }

    try {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show TODO App',
          click: () => {
            try {
              this.windowManager.restoreFromTray()
            } catch (error) {
              console.error('Failed to restore window from tray:', error)
            }
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Toggle Floating Navigator',
          click: () => {
            try {
              this.windowManager.toggleFloatingNavigator()
            } catch (error) {
              console.error('Failed to toggle floating navigator:', error)
            }
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
            try {
              this.isQuitting = true
              require('electron').app.quit()
            } catch (error) {
              console.error('Failed to quit application:', error)
            }
          },
        },
      ])

      this.tray.setContextMenu(contextMenu)
      return true
    } catch (error) {
      console.error('Failed to update tray menu:', error)

      // Try to create a fallback menu
      try {
        this.createFallbackMenu()
      } catch (fallbackError) {
        console.error('Failed to create fallback menu:', fallbackError)
      }

      return false
    }
  }

  /**
   * Create a minimal fallback menu when normal menu creation fails
   */
  createFallbackMenu() {
    if (!this.tray || this.tray.isDestroyed()) return

    try {
      const fallbackMenu = Menu.buildFromTemplate([
        {
          label: 'Show App',
          click: () => {
            try {
              this.windowManager.restoreFromTray()
            } catch (error) {
              console.error('Failed to restore window:', error)
            }
          },
        },
        {
          label: 'Quit',
          click: () => {
            this.isQuitting = true
            require('electron').app.quit()
          },
        },
      ])

      this.tray.setContextMenu(fallbackMenu)
      console.log('✅ Fallback tray menu created')
    } catch (error) {
      console.error('❌ Failed to create fallback tray menu:', error)
    }
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
   * Show native notification with error handling
   */
  showNotification(title, body, options = {}) {
    try {
      if (!Notification.isSupported()) {
        console.warn('Notifications are not supported on this system')
        return null
      }

      const notification = new Notification({
        title,
        body,
        icon: this.getTrayIconPath(),
        silent: options.silent || false,
        ...options,
      })

      // Handle notification click with error handling
      notification.on('click', () => {
        try {
          this.windowManager.restoreFromTray()
          if (options.onClick) {
            options.onClick()
          }
        } catch (error) {
          console.error('Failed to handle notification click:', error)
        }
      })

      // Handle notification errors
      notification.on('failed', (event, error) => {
        console.error('Notification failed:', error)
      })

      notification.show()
      return notification
    } catch (error) {
      console.error('Failed to show notification:', error)
      return null
    }
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

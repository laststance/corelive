/**
 * @fileoverview System Tray Manager for Electron
 *
 * Manages the system tray icon and menu that appears in:
 * - Windows: System tray (bottom-right corner)
 * - macOS: Menu bar (top-right corner)
 * - Linux: System panel (varies by desktop environment)
 *
 * System tray provides:
 * - Quick access when app is minimized
 * - Status indication (icon changes)
 * - Context menu for common actions
 * - Minimize-to-tray functionality
 * - Background running indicator
 *
 * Why system tray is important:
 * - Users expect desktop apps to minimize to tray
 * - Provides persistent access without taskbar clutter
 * - Shows app is running in background
 * - Quick actions without opening main window
 * - Standard desktop app pattern
 *
 * Platform considerations:
 * - macOS: Limited icon customization, no balloon tooltips
 * - Windows: Full color icons, native notifications
 * - Linux: Varies greatly by desktop environment
 *
 * @module electron/SystemTrayManager
 */

const path = require('path')

const { Tray, Menu, nativeImage, Notification } = require('electron')

const { log } = require('./logger.cjs')

/**
 * Manages system tray functionality with robust error handling.
 *
 * Features:
 * - Platform-specific tray icon creation
 * - Context menu management
 * - Click/double-click handling
 * - Minimize to tray behavior
 * - Status updates (icon, tooltip)
 * - Fallback mode for unsupported systems
 *
 * Error handling is critical because:
 * - Some Linux systems don't support tray
 * - Icon loading can fail
 * - Users may disable system tray
 */
class SystemTrayManager {
  constructor(windowManager) {
    this.windowManager = windowManager // For show/hide operations
    this.tray = null // Tray instance
    this.isQuitting = false // Flag to distinguish quit vs minimize
  }

  /**
   * Creates the system tray with icon and context menu.
   *
   * Creation process:
   * 1. Check platform support
   * 2. Load appropriate icon
   * 3. Create tray instance
   * 4. Set tooltip
   * 5. Create context menu
   * 6. Setup event handlers
   *
   * Robust error handling ensures app works even if tray fails.
   * Falls back to standard window behavior if tray unavailable.
   *
   * @returns {Tray|null} The tray instance or null if failed
   */
  createTray() {
    try {
      // Some systems don't support tray (e.g., some Linux distros)
      if (!this.isSystemTraySupported()) {
        log.warn('System tray is not supported on this platform')
        this.tray = null
        this.enableFallbackMode() // App works without tray
        return null
      }

      // Create tray icon with comprehensive error handling
      const trayIcon = this.createTrayIcon()
      if (!trayIcon) {
        log.warn('Failed to create tray icon, enabling fallback mode')
        this.enableFallbackMode()
        return null
      }

      // Attempt to create tray with retry logic
      this.tray = this.createTrayWithRetry(trayIcon)
      if (!this.tray) {
        log.warn(
          'Failed to create system tray after retries, enabling fallback mode',
        )
        this.enableFallbackMode()
        return null
      }

      // Set tooltip with error handling
      this.setTrayTooltipSafely('TODO Desktop App')

      // Create context menu with error handling
      if (!this.setupTrayMenuSafely()) {
        log.warn('Failed to setup tray menu, using minimal functionality')
      }

      // Handle tray click events with error handling
      if (!this.setupTrayEventsSafely()) {
        log.warn(
          'Failed to setup tray events, tray will have limited functionality',
        )
      }

      return this.tray
    } catch (error) {
      log.error('❌ Failed to create system tray:', error)
      this.handleTrayCreationFailure(error)
      return null
    }
  }

  /**
   * Checks if system tray is supported on the current platform.
   *
   * Support varies:
   * - Windows: Always supported
   * - macOS: Always supported (menu bar)
   * - Linux: Depends on desktop environment
   *   - GNOME: Requires extension
   *   - KDE: Native support
   *   - XFCE: Native support
   *
   * @returns {boolean} True if platform potentially supports tray
   */
  isSystemTraySupported() {
    try {
      // Basic platform check - actual support may still fail
      return (
        process.platform === 'win32' ||
        process.platform === 'darwin' ||
        process.platform === 'linux'
      )
    } catch (error) {
      log.warn('Error checking system tray support:', error)
      return false
    }
  }

  /**
   * Creates the tray icon with appropriate format and size.
   *
   * Icon requirements:
   * - Windows: 16x16 or 32x32, ICO or PNG
   * - macOS: 22x22 (Template images, black & transparent)
   * - Linux: 16x16, 22x22, or 24x24 PNG
   *
   * State support:
   * - default: Normal state
   * - active: Has notifications
   * - error: Problem state
   *
   * Falls back to embedded icon if file loading fails.
   *
   * @param {string} state - Icon state (default/active/error)
   * @returns {NativeImage|null} The tray icon or null
   */
  createTrayIcon(state = 'default') {
    try {
      const iconPath = this.getTrayIconPath(state)
      let trayIcon

      if (iconPath) {
        try {
          trayIcon = nativeImage.createFromPath(iconPath)
          if (!trayIcon.isEmpty()) {
            // Icons are pre-sized for each platform
            return trayIcon
          }
        } catch (iconError) {
          log.warn('Failed to load tray icon from path:', iconError)
        }
      }

      // Try to create a simple colored icon as fallback
      try {
        trayIcon = this.createFallbackIcon()
        if (trayIcon && !trayIcon.isEmpty()) {
          return trayIcon
        }
      } catch (fallbackError) {
        log.warn('Failed to create fallback icon:', fallbackError)
      }

      // Last resort: create empty image
      try {
        return nativeImage.createEmpty()
      } catch (emptyError) {
        log.error('Failed to create empty icon:', emptyError)
        return null
      }
    } catch (error) {
      log.error('Error creating tray icon:', error)
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
      log.warn('Failed to create bitmap fallback icon:', bitmapError)
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
        log.warn(`Tray creation attempt ${attempt} failed:`, error)

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
      log.warn('Failed to set tray tooltip:', error)
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
      log.warn('Failed to create tray menu:', error)

      try {
        this.createFallbackMenu()
        return true
      } catch (fallbackError) {
        log.error('Failed to create fallback menu:', fallbackError)
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
      log.warn('Failed to setup tray events:', error)
      return false
    }
  }

  /**
   * Handle tray creation failure and enable fallback mode
   */
  handleTrayCreationFailure(error) {
    log.error('System tray creation failed completely:', error)
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
        log.warn('Could not show tray failure notification:', notificationError)
      }
    }
  }

  /**
   * Enable fallback mode when tray is not available
   */
  enableFallbackMode() {
    this.fallbackMode = true

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
   * Get appropriate tray icon path based on platform and state
   */
  getTrayIconPath(state = 'default') {
    const iconDir = path.join(__dirname, '..', 'build', 'icons', 'tray')
    // Determine appropriate size based on platform and DPI
    const size = this.getTrayIconSize()

    // Try state-specific icon first
    const stateIconPath = path.join(
      iconDir,
      `tray-${size}x${size}-${state}.png`,
    )
    if (this.fileExists(stateIconPath)) {
      return stateIconPath
    }

    // Fallback to default state
    const defaultIconPath = path.join(iconDir, `tray-${size}x${size}.png`)
    if (this.fileExists(defaultIconPath)) {
      return defaultIconPath
    }

    // Final fallback to any available tray icon
    const fallbackIcons = [
      path.join(iconDir, 'tray-16x16.png'),
      path.join(iconDir, 'tray-20x20.png'),
      path.join(iconDir, 'tray-24x24.png'),
      path.join(iconDir, 'tray-32x32.png'),
    ]

    for (const iconPath of fallbackIcons) {
      if (this.fileExists(iconPath)) {
        return iconPath
      }
    }

    return null
  }

  /**
   * Get appropriate tray icon size based on platform and DPI
   */
  getTrayIconSize() {
    // macOS typically uses 16x16 for tray icons
    if (process.platform === 'darwin') {
      return 16
    }
    // Windows and Linux can vary, but 16x16 is most common
    // TODO: Detect DPI and adjust accordingly
    return 16
  }

  /**
   * Check if file exists safely
   */
  fileExists(filePath) {
    try {
      return require('fs').existsSync(filePath)
    } catch {
      return false
    }
  }

  /**
   * Update tray context menu
   */
  updateTrayMenu(tasks = []) {
    if (!this.tray || this.tray.isDestroyed()) {
      log.warn('Cannot update tray menu: tray not available')
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
              log.error('Failed to restore window from tray:', error)
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
              log.error('Failed to toggle floating navigator:', error)
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
              log.error('Failed to quit application:', error)
            }
          },
        },
      ])

      this.tray.setContextMenu(contextMenu)
      return true
    } catch (error) {
      log.error('Failed to update tray menu:', error)

      // Try to create a fallback menu
      try {
        this.createFallbackMenu()
      } catch (fallbackError) {
        log.error('Failed to create fallback menu:', fallbackError)
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
              log.error('Failed to restore window:', error)
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
    } catch (error) {
      log.error('❌ Failed to create fallback tray menu:', error)
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
        log.warn('Notifications are not supported on this system')
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
          log.error('Failed to handle notification click:', error)
        }
      })

      // Handle notification errors
      notification.on('failed', (event, error) => {
        log.error('Notification failed:', error)
      })

      notification.show()
      return notification
    } catch (error) {
      log.error('Failed to show notification:', error)
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
   * Set tray icon state
   */
  setTrayIconState(state = 'default') {
    if (!this.tray || this.tray.isDestroyed()) {
      log.warn('Cannot set tray icon state: tray not available')
      return false
    }

    try {
      const iconPath = this.getTrayIconPath(state)
      if (iconPath) {
        // Handle test environment where nativeImage might not be available
        if (typeof nativeImage !== 'undefined' && nativeImage.createFromPath) {
          const icon = nativeImage.createFromPath(iconPath)
          this.tray.setImage(icon)
        } else {
          // In test environment, just call setImage with the path
          this.tray.setImage(iconPath)
        }

        return true
      } else {
        log.warn(`Tray icon for state '${state}' not found`)
        return false
      }
    } catch (error) {
      log.error('Failed to set tray icon state:', error)
      return false
    }
  }

  /**
   * Set tray icon to active state
   */
  setActiveState() {
    return this.setTrayIconState('active')
  }

  /**
   * Set tray icon to notification state
   */
  setNotificationState() {
    return this.setTrayIconState('notification')
  }

  /**
   * Set tray icon to disabled state
   */
  setDisabledState() {
    return this.setTrayIconState('disabled')
  }

  /**
   * Reset tray icon to default state
   */
  resetToDefaultState() {
    return this.setTrayIconState('default')
  }

  /**
   * Check if tray exists
   */
  hasTray() {
    return this.tray && !this.tray.isDestroyed()
  }
}

module.exports = SystemTrayManager

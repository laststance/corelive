const { globalShortcut, BrowserWindow } = require('electron')

class ShortcutManager {
  constructor(windowManager, notificationManager) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager
    this.registeredShortcuts = new Map()
    this.isEnabled = true

    // Default shortcuts - OS-specific
    this.defaultShortcuts = this.getDefaultShortcuts()
  }

  /**
   * Get default shortcuts based on platform
   */
  getDefaultShortcuts() {
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Cmd' : 'Ctrl'

    return {
      newTask: `${modifier}+N`,
      search: `${modifier}+F`,
      toggleFloatingNavigator: `${modifier}+Shift+F`,
      showMainWindow: `${modifier}+Shift+T`,
      quit: isMac ? 'Cmd+Q' : 'Ctrl+Q',
      minimize: `${modifier}+M`,
      toggleAlwaysOnTop: `${modifier}+Shift+A`,
      focusFloatingNavigator: `${modifier}+Shift+N`,
    }
  }

  /**
   * Initialize and register all default shortcuts
   */
  initialize() {
    try {
      this.registerDefaultShortcuts()
      console.log('✅ Keyboard shortcuts initialized')
      return true
    } catch (error) {
      console.error('❌ Failed to initialize keyboard shortcuts:', error)
      return false
    }
  }

  /**
   * Register all default shortcuts
   */
  registerDefaultShortcuts() {
    const shortcuts = this.defaultShortcuts

    // New task shortcut
    this.registerShortcut(shortcuts.newTask, 'newTask', () => {
      this.handleNewTaskShortcut()
    })

    // Search shortcut
    this.registerShortcut(shortcuts.search, 'search', () => {
      this.handleSearchShortcut()
    })

    // Toggle floating navigator
    this.registerShortcut(
      shortcuts.toggleFloatingNavigator,
      'toggleFloatingNavigator',
      () => {
        this.handleToggleFloatingNavigator()
      },
    )

    // Show main window
    this.registerShortcut(shortcuts.showMainWindow, 'showMainWindow', () => {
      this.handleShowMainWindow()
    })

    // Minimize window
    this.registerShortcut(shortcuts.minimize, 'minimize', () => {
      this.handleMinimizeWindow()
    })

    // Toggle always on top (for floating navigator)
    this.registerShortcut(
      shortcuts.toggleAlwaysOnTop,
      'toggleAlwaysOnTop',
      () => {
        this.handleToggleAlwaysOnTop()
      },
    )

    // Focus floating navigator
    this.registerShortcut(
      shortcuts.focusFloatingNavigator,
      'focusFloatingNavigator',
      () => {
        this.handleFocusFloatingNavigator()
      },
    )
  }

  /**
   * Register a single keyboard shortcut
   */
  registerShortcut(accelerator, id, callback) {
    if (!this.isEnabled) return false

    try {
      // Unregister existing shortcut if it exists
      if (this.registeredShortcuts.has(id)) {
        this.unregisterShortcut(id)
      }

      const success = globalShortcut.register(accelerator, callback)

      if (success) {
        this.registeredShortcuts.set(id, {
          accelerator,
          callback,
          registeredAt: new Date(),
        })
        console.log(`✅ Registered shortcut: ${accelerator} (${id})`)
        return true
      } else {
        console.warn(
          `⚠️ Failed to register shortcut: ${accelerator} (${id}) - may be in use`,
        )
        return false
      }
    } catch (error) {
      console.error(`❌ Error registering shortcut ${accelerator}:`, error)
      return false
    }
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregisterShortcut(id) {
    const shortcut = this.registeredShortcuts.get(id)
    if (!shortcut) return false

    try {
      globalShortcut.unregister(shortcut.accelerator)
      this.registeredShortcuts.delete(id)
      console.log(`✅ Unregistered shortcut: ${shortcut.accelerator} (${id})`)
      return true
    } catch (error) {
      console.error(`❌ Error unregistering shortcut ${id}:`, error)
      return false
    }
  }

  /**
   * Handle new task shortcut
   */
  handleNewTaskShortcut() {
    try {
      // Focus main window and trigger new task
      this.windowManager.restoreFromTray()

      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('shortcut-new-task')
      }

      // Show notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'New Task',
          'Create a new task shortcut activated',
          { silent: true },
        )
      }
    } catch (error) {
      console.error('Error handling new task shortcut:', error)
    }
  }

  /**
   * Handle search shortcut
   */
  handleSearchShortcut() {
    try {
      // Focus main window and trigger search
      this.windowManager.restoreFromTray()

      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('shortcut-search')
      }
    } catch (error) {
      console.error('Error handling search shortcut:', error)
    }
  }

  /**
   * Handle toggle floating navigator shortcut
   */
  handleToggleFloatingNavigator() {
    try {
      this.windowManager.toggleFloatingNavigator()

      // Show notification
      if (this.notificationManager) {
        const isVisible =
          this.windowManager.hasFloatingNavigator() &&
          this.windowManager.getFloatingNavigator().isVisible()

        this.notificationManager.showNotification(
          'Floating Navigator',
          isVisible ? 'Floating navigator shown' : 'Floating navigator hidden',
          { silent: true },
        )
      }
    } catch (error) {
      console.error('Error handling toggle floating navigator shortcut:', error)
    }
  }

  /**
   * Handle show main window shortcut
   */
  handleShowMainWindow() {
    try {
      this.windowManager.restoreFromTray()
    } catch (error) {
      console.error('Error handling show main window shortcut:', error)
    }
  }

  /**
   * Handle minimize window shortcut
   */
  handleMinimizeWindow() {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow()

      if (focusedWindow) {
        if (focusedWindow === this.windowManager.getMainWindow()) {
          this.windowManager.minimizeToTray()
        } else if (
          focusedWindow === this.windowManager.getFloatingNavigator()
        ) {
          focusedWindow.minimize()
        }
      }
    } catch (error) {
      console.error('Error handling minimize window shortcut:', error)
    }
  }

  /**
   * Handle toggle always on top shortcut (for floating navigator)
   */
  handleToggleAlwaysOnTop() {
    try {
      if (this.windowManager.hasFloatingNavigator()) {
        const floatingWindow = this.windowManager.getFloatingNavigator()
        const isAlwaysOnTop = floatingWindow.isAlwaysOnTop()
        floatingWindow.setAlwaysOnTop(!isAlwaysOnTop)

        // Show notification
        if (this.notificationManager) {
          this.notificationManager.showNotification(
            'Always On Top',
            !isAlwaysOnTop
              ? 'Floating navigator always on top'
              : 'Always on top disabled',
            { silent: true },
          )
        }
      }
    } catch (error) {
      console.error('Error handling toggle always on top shortcut:', error)
    }
  }

  /**
   * Handle focus floating navigator shortcut
   */
  handleFocusFloatingNavigator() {
    try {
      if (this.windowManager.hasFloatingNavigator()) {
        const floatingWindow = this.windowManager.getFloatingNavigator()
        floatingWindow.show()
        floatingWindow.focus()
      } else {
        // Create and show floating navigator if it doesn't exist
        this.windowManager.showFloatingNavigator()
      }
    } catch (error) {
      console.error('Error handling focus floating navigator shortcut:', error)
    }
  }

  /**
   * Update shortcuts with new configuration
   */
  updateShortcuts(newShortcuts) {
    try {
      // Unregister all current shortcuts
      this.unregisterAllShortcuts()

      // Register new shortcuts
      for (const [id, accelerator] of Object.entries(newShortcuts)) {
        const handler = this.getHandlerForShortcut(id)
        if (handler) {
          this.registerShortcut(accelerator, id, handler)
        }
      }

      return true
    } catch (error) {
      console.error('Error updating shortcuts:', error)
      return false
    }
  }

  /**
   * Get handler function for shortcut ID
   */
  getHandlerForShortcut(id) {
    const handlers = {
      newTask: () => this.handleNewTaskShortcut(),
      search: () => this.handleSearchShortcut(),
      toggleFloatingNavigator: () => this.handleToggleFloatingNavigator(),
      showMainWindow: () => this.handleShowMainWindow(),
      minimize: () => this.handleMinimizeWindow(),
      toggleAlwaysOnTop: () => this.handleToggleAlwaysOnTop(),
      focusFloatingNavigator: () => this.handleFocusFloatingNavigator(),
    }

    return handlers[id]
  }

  /**
   * Get currently registered shortcuts
   */
  getRegisteredShortcuts() {
    const shortcuts = {}
    for (const [id, shortcut] of this.registeredShortcuts) {
      shortcuts[id] = shortcut.accelerator
    }
    return shortcuts
  }

  /**
   * Get default shortcuts
   */
  getDefaultShortcutsConfig() {
    return { ...this.defaultShortcuts }
  }

  /**
   * Check if shortcut is registered
   */
  isShortcutRegistered(accelerator) {
    return globalShortcut.isRegistered(accelerator)
  }

  /**
   * Enable shortcuts
   */
  enable() {
    this.isEnabled = true
    this.registerDefaultShortcuts()
  }

  /**
   * Disable shortcuts
   */
  disable() {
    this.isEnabled = false
    this.unregisterAllShortcuts()
  }

  /**
   * Unregister all shortcuts
   */
  unregisterAllShortcuts() {
    try {
      globalShortcut.unregisterAll()
      this.registeredShortcuts.clear()
      console.log('✅ All shortcuts unregistered')
    } catch (error) {
      console.error('❌ Error unregistering all shortcuts:', error)
    }
  }

  /**
   * Get shortcut statistics
   */
  getStats() {
    return {
      totalRegistered: this.registeredShortcuts.size,
      isEnabled: this.isEnabled,
      platform: process.platform,
      shortcuts: this.getRegisteredShortcuts(),
    }
  }

  /**
   * Cleanup - unregister all shortcuts
   */
  cleanup() {
    this.unregisterAllShortcuts()
  }
}

module.exports = ShortcutManager

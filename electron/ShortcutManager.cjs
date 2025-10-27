const { globalShortcut, BrowserWindow } = require('electron')

const { log } = require('../src/lib/logger.cjs')

class ShortcutManager {
  constructor(windowManager, notificationManager, configManager = null) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager
    this.configManager = configManager
    this.registeredShortcuts = new Map()

    // Load settings from configuration
    this.loadSettings()
  }

  /**
   * Load shortcut settings from configuration
   */
  loadSettings() {
    if (this.configManager) {
      const shortcutConfig = this.configManager.getSection('shortcuts')
      this.isEnabled = shortcutConfig.enabled
      this.shortcuts = { ...shortcutConfig }
      delete this.shortcuts.enabled // Remove the enabled flag from shortcuts list
    } else {
      this.isEnabled = true
      this.shortcuts = this.getDefaultShortcuts()
    }
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
   * Initialize and register all default shortcuts with conflict handling
   */
  initialize() {
    try {
      log.info('⌨️  [ShortcutManager] Starting initialization...')
      log.debug('⌨️  [ShortcutManager] isEnabled:', this.isEnabled)
      log.debug('⌨️  [ShortcutManager] shortcuts:', this.shortcuts)

      const results = this.registerDefaultShortcuts()

      const successCount = results.filter((r) => r.success).length
      const totalCount = results.length

      log.info(
        `⌨️  [ShortcutManager] Registered ${successCount}/${totalCount} shortcuts`,
      )

      // Log each shortcut registration result
      results.forEach((result) => {
        const status = result.success ? '✅' : '❌'
        log.debug(`⌨️  [ShortcutManager] ${status} ${result.id}`)
      })

      if (successCount === totalCount) {
        log.info('✅ [ShortcutManager] All shortcuts initialized successfully')
        return true
      } else if (successCount > 0) {
        log.warn(
          `⚠️  [ShortcutManager] Partial success: ${successCount}/${totalCount}`,
        )
        // Show summary notification
        if (this.notificationManager) {
          this.notificationManager.showNotification(
            'Shortcuts Initialized',
            `${successCount}/${totalCount} shortcuts registered successfully`,
            { silent: true },
          )
        }

        return true
      } else {
        console.error(
          '❌ [ShortcutManager] Failed to initialize any keyboard shortcuts',
        )
        log.error('❌ Failed to initialize any keyboard shortcuts')
        return false
      }
    } catch (error) {
      console.error('❌ [ShortcutManager] Failed to initialize:', error)
      log.error('❌ Failed to initialize keyboard shortcuts:', error)
      return false
    }
  }

  /**
   * Register all shortcuts from configuration with result tracking
   */
  registerDefaultShortcuts() {
    const shortcuts = this.shortcuts
    const results = []

    // New task shortcut
    results.push({
      id: 'newTask',
      success: this.registerShortcut(shortcuts.newTask, 'newTask', () => {
        this.handleNewTaskShortcut()
      }),
    })

    // Search shortcut
    results.push({
      id: 'search',
      success: this.registerShortcut(shortcuts.search, 'search', () => {
        this.handleSearchShortcut()
      }),
    })

    // Toggle floating navigator
    results.push({
      id: 'toggleFloatingNavigator',
      success: this.registerShortcut(
        shortcuts.toggleFloatingNavigator,
        'toggleFloatingNavigator',
        () => {
          this.handleToggleFloatingNavigator()
        },
      ),
    })

    // Show main window
    results.push({
      id: 'showMainWindow',
      success: this.registerShortcut(
        shortcuts.showMainWindow,
        'showMainWindow',
        () => {
          this.handleShowMainWindow()
        },
      ),
    })

    // Minimize window
    results.push({
      id: 'minimize',
      success: this.registerShortcut(shortcuts.minimize, 'minimize', () => {
        this.handleMinimizeWindow()
      }),
    })

    // Toggle always on top (for floating navigator)
    results.push({
      id: 'toggleAlwaysOnTop',
      success: this.registerShortcut(
        shortcuts.toggleAlwaysOnTop,
        'toggleAlwaysOnTop',
        () => {
          this.handleToggleAlwaysOnTop()
        },
      ),
    })

    // Focus floating navigator
    results.push({
      id: 'focusFloatingNavigator',
      success: this.registerShortcut(
        shortcuts.focusFloatingNavigator,
        'focusFloatingNavigator',
        () => {
          this.handleFocusFloatingNavigator()
        },
      ),
    })

    return results
  }

  /**
   * Register a single keyboard shortcut with conflict resolution
   */
  registerShortcut(accelerator, id, callback) {
    log.debug(
      `⌨️  [registerShortcut] Attempting to register: ${id} = ${accelerator}`,
    )

    if (!this.isEnabled) {
      log.debug(`⚠️  [registerShortcut] Shortcuts disabled, skipping ${id}`)
      return false
    }

    try {
      // Unregister existing shortcut if it exists
      if (this.registeredShortcuts.has(id)) {
        log.debug(
          `⌨️  [registerShortcut] Unregistering existing shortcut: ${id}`,
        )
        this.unregisterShortcut(id)
      }

      // Check if shortcut is already registered by another application
      if (globalShortcut.isRegistered(accelerator)) {
        log.warn(
          `⚠️  [registerShortcut] ${accelerator} already registered by another app`,
        )
        log.warn(
          `⚠️ Shortcut ${accelerator} is already registered by another application`,
        )
        return this.handleShortcutConflict(accelerator, id, callback)
      }

      log.debug(
        `⌨️  [registerShortcut] Calling globalShortcut.register for ${id}...`,
      )
      const success = globalShortcut.register(accelerator, callback)
      log.debug(
        `⌨️  [registerShortcut] globalShortcut.register result: ${success}`,
      )

      if (success) {
        this.registeredShortcuts.set(id, {
          accelerator,
          callback,
          registeredAt: new Date(),
          isAlternative: false,
        })
        log.debug(
          `✅ [registerShortcut] Successfully registered: ${id} = ${accelerator}`,
        )

        return true
      } else {
        log.warn(
          `❌ [registerShortcut] Failed to register: ${id} = ${accelerator}`,
        )
        log.warn(`⚠️ Failed to register shortcut: ${accelerator} (${id})`)
        return this.handleShortcutConflict(accelerator, id, callback)
      }
    } catch (error) {
      log.error(`❌ Error registering shortcut ${accelerator}:`, error)
      return this.handleShortcutConflict(accelerator, id, callback)
    }
  }

  /**
   * Handle shortcut registration conflicts by trying alternatives
   */
  handleShortcutConflict(originalAccelerator, id, callback) {
    const alternatives = this.generateAlternativeShortcuts(
      originalAccelerator,
      id,
    )

    for (const alternative of alternatives) {
      try {
        if (!globalShortcut.isRegistered(alternative)) {
          const success = globalShortcut.register(alternative, callback)

          if (success) {
            this.registeredShortcuts.set(id, {
              accelerator: alternative,
              originalAccelerator,
              callback,
              registeredAt: new Date(),
              isAlternative: true,
            })

            // Notify user about the change
            this.notifyShortcutChange(id, originalAccelerator, alternative)

            return true
          }
        }
      } catch (error) {
        log.warn(`Failed to register alternative ${alternative}:`, error)
      }
    }

    // If no alternatives work, disable this shortcut
    log.warn(
      `❌ Could not register any alternative for ${originalAccelerator} (${id})`,
    )
    this.handleShortcutRegistrationFailure(id, originalAccelerator)

    return false
  }

  /**
   * Generate alternative shortcuts when conflicts occur
   */
  generateAlternativeShortcuts(originalAccelerator, id) {
    const alternatives = []
    const isMac = process.platform === 'darwin'

    // Parse the original accelerator
    const parts = originalAccelerator.split('+')
    const key = parts[parts.length - 1]
    const modifiers = parts.slice(0, -1)

    // Try different modifier combinations
    const alternativeModifiers = [
      // Add Alt/Option
      [...modifiers, isMac ? 'Option' : 'Alt'],
      // Replace Ctrl with Alt (or vice versa)
      modifiers.map((m) => {
        if (m === 'Ctrl' || m === 'Control') return isMac ? 'Option' : 'Alt'
        if (m === 'Alt') return isMac ? 'Cmd' : 'Ctrl'
        return m
      }),
      // Add Shift
      [...modifiers, 'Shift'],
      // Try with different base modifier
      [isMac ? 'Cmd' : 'Ctrl', 'Alt', 'Shift'],
    ]

    // Generate alternatives
    for (const altModifiers of alternativeModifiers) {
      const uniqueModifiers = [...new Set(altModifiers)] // Remove duplicates
      if (uniqueModifiers.length > 0) {
        alternatives.push(`${uniqueModifiers.join('+')}+${key}`)
      }
    }

    // Try different keys for some shortcuts
    const alternativeKeys = this.getAlternativeKeysForShortcut(id, key)
    for (const altKey of alternativeKeys) {
      alternatives.push(`${modifiers.join('+')}+${altKey}`)
    }

    // Remove duplicates and the original
    return [...new Set(alternatives)].filter(
      (alt) => alt !== originalAccelerator,
    )
  }

  /**
   * Get alternative keys for specific shortcut types
   */
  getAlternativeKeysForShortcut(id, _originalKey) {
    const alternatives = {
      newTask: ['Insert', 'Plus', 'T'],
      search: ['S', 'L', 'Find'],
      toggleFloatingNavigator: ['W', 'Space', 'Tab'],
      showMainWindow: ['Home', 'Return', 'Enter'],
      minimize: ['H', 'Down', 'Minus'],
      toggleAlwaysOnTop: ['T', 'Up', 'P'],
      focusFloatingNavigator: ['W', 'Space', 'F'],
    }

    return alternatives[id] || []
  }

  /**
   * Notify user about shortcut changes
   */
  notifyShortcutChange(id, original, alternative) {
    if (this.notificationManager) {
      this.notificationManager.showNotification(
        'Shortcut Changed',
        `${this.getShortcutDisplayName(id)}: ${original} → ${alternative}`,
        { silent: true },
      )
    }

    // Also log to console for debugging
  }

  /**
   * Handle complete shortcut registration failure
   */
  handleShortcutRegistrationFailure(id, accelerator) {
    // Store the failed shortcut for user reference
    this.failedShortcuts = this.failedShortcuts || new Map()
    this.failedShortcuts.set(id, {
      accelerator,
      failedAt: new Date(),
      reason: 'conflict_unresolved',
    })

    // Notify user
    if (this.notificationManager) {
      this.notificationManager.showNotification(
        'Shortcut Unavailable',
        `Could not register ${this.getShortcutDisplayName(id)} (${accelerator}) - conflicts with system`,
        { silent: true },
      )
    }

    log.warn(`📋 Shortcut ${id} (${accelerator}) disabled due to conflicts`)
  }

  /**
   * Get display name for shortcut ID
   */
  getShortcutDisplayName(id) {
    const displayNames = {
      newTask: 'New Task',
      search: 'Search',
      toggleFloatingNavigator: 'Toggle Floating Navigator',
      showMainWindow: 'Show Main Window',
      minimize: 'Minimize',
      toggleAlwaysOnTop: 'Toggle Always On Top',
      focusFloatingNavigator: 'Focus Floating Navigator',
    }

    return displayNames[id] || id
  }

  /**
   * Get failed shortcuts for user reference
   */
  getFailedShortcuts() {
    return this.failedShortcuts ? Object.fromEntries(this.failedShortcuts) : {}
  }

  /**
   * Retry registering failed shortcuts
   */
  retryFailedShortcuts() {
    if (!this.failedShortcuts || this.failedShortcuts.size === 0) {
      return { success: true, message: 'No failed shortcuts to retry' }
    }

    const retryResults = []

    for (const [id, failedShortcut] of this.failedShortcuts) {
      const handler = this.getHandlerForShortcut(id)
      if (handler) {
        const success = this.registerShortcut(
          failedShortcut.accelerator,
          id,
          handler,
        )

        if (success) {
          this.failedShortcuts.delete(id)
          retryResults.push({ id, success: true })
        } else {
          retryResults.push({ id, success: false })
        }
      }
    }

    return {
      success: retryResults.some((r) => r.success),
      results: retryResults,
      message: `Retried ${retryResults.length} shortcuts, ${retryResults.filter((r) => r.success).length} successful`,
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

      return true
    } catch (error) {
      log.error(`❌ Error unregistering shortcut ${id}:`, error)
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
      log.error('Error handling new task shortcut:', error)
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
      log.error('Error handling search shortcut:', error)
    }
  }

  /**
   * Handle toggle floating navigator shortcut
   */
  handleToggleFloatingNavigator() {
    try {
      log.debug('🎯 handleToggleFloatingNavigator called')
      this.windowManager.toggleFloatingNavigator()

      // Show notification
      if (this.notificationManager) {
        const isVisible =
          this.windowManager.hasFloatingNavigator() &&
          this.windowManager.getFloatingNavigator().isVisible()

        log.debug('🎯 Floating navigator visibility:', isVisible)
        this.notificationManager.showNotification(
          'Floating Navigator',
          isVisible ? 'Floating navigator shown' : 'Floating navigator hidden',
          { silent: true },
        )
      }
    } catch (error) {
      console.error(
        '🔴 Error handling toggle floating navigator shortcut:',
        error,
      )
      log.error('Error handling toggle floating navigator shortcut:', error)
    }
  }

  /**
   * Handle show main window shortcut
   */
  handleShowMainWindow() {
    try {
      this.windowManager.restoreFromTray()
    } catch (error) {
      log.error('Error handling show main window shortcut:', error)
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
      log.error('Error handling minimize window shortcut:', error)
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
      log.error('Error handling toggle always on top shortcut:', error)
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
      log.error('Error handling focus floating navigator shortcut:', error)
    }
  }

  /**
   * Update shortcuts with new configuration
   */
  updateShortcuts(newShortcuts) {
    try {
      // Unregister all current shortcuts
      this.unregisterAllShortcuts()

      // Update internal shortcuts
      this.shortcuts = { ...this.shortcuts, ...newShortcuts }

      // Save to configuration if available
      if (this.configManager) {
        for (const [key, value] of Object.entries(newShortcuts)) {
          this.configManager.set(`shortcuts.${key}`, value)
        }
      }

      // Register new shortcuts
      for (const [id, accelerator] of Object.entries(this.shortcuts)) {
        if (id !== 'enabled') {
          // Skip the enabled flag
          const handler = this.getHandlerForShortcut(id)
          if (handler) {
            this.registerShortcut(accelerator, id, handler)
          }
        }
      }

      return true
    } catch (error) {
      log.error('Error updating shortcuts:', error)
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
    return { ...this.getDefaultShortcuts() }
  }

  /**
   * Get current shortcuts configuration
   */
  getCurrentShortcuts() {
    return { ...this.shortcuts }
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

    // Save to configuration if available
    if (this.configManager) {
      this.configManager.set('shortcuts.enabled', true)
    }

    this.registerDefaultShortcuts()
  }

  /**
   * Disable shortcuts
   */
  disable() {
    this.isEnabled = false

    // Save to configuration if available
    if (this.configManager) {
      this.configManager.set('shortcuts.enabled', false)
    }

    this.unregisterAllShortcuts()
  }

  /**
   * Unregister all shortcuts
   */
  unregisterAllShortcuts() {
    try {
      globalShortcut.unregisterAll()
      this.registeredShortcuts.clear()
    } catch (error) {
      log.error('❌ Error unregistering all shortcuts:', error)
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

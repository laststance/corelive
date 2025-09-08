const path = require('path')

const { Notification, nativeImage } = require('electron')

const { log } = require('../src/lib/logger.cjs')

class NotificationManager {
  constructor(windowManager, systemTrayManager, configManager = null) {
    this.windowManager = windowManager
    this.systemTrayManager = systemTrayManager
    this.configManager = configManager
    this.activeNotifications = new Map()

    // Load preferences from config or use defaults
    this.loadPreferences()
  }

  /**
   * Load notification preferences from configuration
   */
  loadPreferences() {
    if (this.configManager) {
      this.preferences = this.configManager.getSection('notifications')
    } else {
      // Fallback to default preferences
      this.preferences = {
        enabled: true,
        taskCreated: true,
        taskCompleted: true,
        taskUpdated: true,
        taskDeleted: false,
        sound: true,
        showInTray: true,
        autoHide: true,
        autoHideDelay: 5000,
        position: 'topRight',
      }
    }
  }

  /**
   * Initialize notification manager and check permissions
   */
  async initialize() {
    try {
      // Check if notifications are supported
      if (!Notification.isSupported()) {
        log.warn('Notifications are not supported on this system')
        this.handleNotificationUnavailable('not_supported')
        return false
      }

      // Check platform-specific permission requirements
      const permissionResult = await this.checkNotificationPermissions()
      if (!permissionResult.granted) {
        log.warn('Notification permissions denied:', permissionResult.reason)
        this.handleNotificationPermissionDenied(permissionResult.reason)
        return false
      }

      // Test notification capability with comprehensive error handling
      const testResult = await this.testNotificationCapability()
      if (!testResult.success) {
        log.warn('Notification test failed:', testResult.error)
        this.handleNotificationTestFailure(testResult.error)
        return false
      }

      return true
    } catch (error) {
      log.error('❌ Failed to initialize notification manager:', error)
      this.handleNotificationInitializationFailure(error)
      return false
    }
  }

  /**
   * Check notification permissions across platforms
   */
  async checkNotificationPermissions() {
    try {
      // On Windows and Linux, notifications are generally available
      if (process.platform === 'win32' || process.platform === 'linux') {
        return { granted: true, reason: 'platform_default' }
      }

      // On macOS, check if we can create notifications
      if (process.platform === 'darwin') {
        try {
          // Try to create a silent test notification
          const testNotification = new Notification({
            title: 'Permission Test',
            body: 'Testing notification permissions',
            silent: true,
          })

          // If we get here, permissions are likely granted
          testNotification.close()
          return { granted: true, reason: 'test_successful' }
        } catch (permissionError) {
          // Check specific error types
          if (
            permissionError.message.includes('permission') ||
            permissionError.message.includes('denied')
          ) {
            return { granted: false, reason: 'permission_denied' }
          }

          return {
            granted: false,
            reason: 'unknown_error',
            error: permissionError,
          }
        }
      }

      return { granted: true, reason: 'unknown_platform' }
    } catch (error) {
      return { granted: false, reason: 'check_failed', error }
    }
  }

  /**
   * Test notification capability with error handling
   */
  async testNotificationCapability() {
    return new Promise((resolve) => {
      try {
        const testNotification = new Notification({
          title: 'Test',
          body: 'Testing notification support',
          silent: true,
        })

        let resolved = false

        // Handle successful show
        testNotification.on('show', () => {
          if (!resolved) {
            resolved = true
            testNotification.close()
            resolve({ success: true })
          }
        })

        // Handle failures
        testNotification.on('failed', (event, error) => {
          if (!resolved) {
            resolved = true
            resolve({ success: false, error: error || 'notification_failed' })
          }
        })

        // Handle click (means it worked)
        testNotification.on('click', () => {
          if (!resolved) {
            resolved = true
            testNotification.close()
            resolve({ success: true })
          }
        })

        // Timeout fallback
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            try {
              testNotification.close()
            } catch {
              // Ignore close errors
            }
            resolve({ success: true }) // Assume success if no explicit failure
          }
        }, 1000)

        // Show the test notification
        testNotification.show()
      } catch (error) {
        resolve({ success: false, error })
      }
    })
  }

  /**
   * Handle notification unavailable scenario
   */
  handleNotificationUnavailable(_reason) {
    this.preferences.enabled = false
    this.fallbackMode = 'unavailable'

    // Could implement alternative notification methods here
    // e.g., system tray tooltip updates, window title changes, etc.
  }

  /**
   * Handle notification permission denied
   */
  handleNotificationPermissionDenied(reason) {
    this.preferences.enabled = false
    this.fallbackMode = 'permission_denied'

    // Show user-friendly message about enabling notifications
    this.showPermissionDeniedGuidance(reason)
  }

  /**
   * Handle notification test failure
   */
  handleNotificationTestFailure(_error) {
    this.preferences.enabled = false
    this.fallbackMode = 'test_failed'

    // Implement graceful degradation
    this.enableFallbackNotificationMethods()
  }

  /**
   * Handle notification initialization failure
   */
  handleNotificationInitializationFailure(error) {
    this.preferences.enabled = false
    this.fallbackMode = 'init_failed'

    // Log detailed error for debugging
    log.error('Notification initialization error details:', error)
  }

  /**
   * Show guidance for enabling notifications
   */
  showPermissionDeniedGuidance(reason) {
    // Use system tray or window title to inform user
    if (this.systemTrayManager && this.systemTrayManager.hasTray()) {
      this.systemTrayManager.setTrayTooltip(
        'TODO App - Notifications disabled (check system settings)',
      )
    }

    // Could also show an in-app message when main window is focused
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow.webContents.send('notification-permission-denied', {
        reason,
        guidance: this.getPermissionGuidanceForPlatform(),
      })
    }
  }

  /**
   * Get platform-specific guidance for enabling notifications
   */
  getPermissionGuidanceForPlatform() {
    switch (process.platform) {
      case 'darwin':
        return 'Enable notifications in System Preferences > Notifications > TODO App'
      case 'win32':
        return 'Enable notifications in Windows Settings > System > Notifications & actions'
      case 'linux':
        return 'Check your desktop environment notification settings'
      default:
        return 'Check your system notification settings'
    }
  }

  /**
   * Enable fallback notification methods
   */
  enableFallbackNotificationMethods() {
    this.fallbackMethods = {
      trayTooltip: true,
      windowTitle: true,
      inAppBanner: true,
    }
  }

  /**
   * Show fallback notification when normal notifications fail
   */
  showFallbackNotification(title, body, options = {}) {
    if (!this.fallbackMethods) return

    try {
      // Update system tray tooltip
      if (
        this.fallbackMethods.trayTooltip &&
        this.systemTrayManager &&
        this.systemTrayManager.hasTray()
      ) {
        this.systemTrayManager.setTrayTooltip(`${title}: ${body}`)
      }

      // Update window title
      if (
        this.fallbackMethods.windowTitle &&
        this.windowManager &&
        this.windowManager.hasMainWindow()
      ) {
        const mainWindow = this.windowManager.getMainWindow()
        const originalTitle = mainWindow.getTitle()
        mainWindow.setTitle(`${title} - ${originalTitle}`)

        // Restore original title after delay
        setTimeout(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.setTitle(originalTitle)
          }
        }, 3000)
      }

      // Send in-app notification
      if (
        this.fallbackMethods.inAppBanner &&
        this.windowManager &&
        this.windowManager.hasMainWindow()
      ) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('show-fallback-notification', {
          title,
          body,
          options,
        })
      }
    } catch (error) {
      log.warn('Fallback notification methods failed:', error)
    }
  }

  /**
   * Show notification for task creation
   */
  showTaskCreatedNotification(task) {
    if (!this.shouldShowNotification('taskCreated')) {
      return null
    }

    const title = 'Task Created'
    const body = `"${task.title}" has been added to your TODO list`
    const options = {
      silent: !this.preferences.sound,
      tag: `task-created-${task.id}`,
      actions: [
        {
          type: 'button',
          text: 'View Task',
        },
        {
          type: 'button',
          text: 'Mark Complete',
        },
      ],
    }

    return this.showNotification(title, body, {
      ...options,
      onClick: async () => this.handleTaskNotificationClick(task.id),
      onAction: async (actionIndex) =>
        this.handleTaskCreatedAction(task, actionIndex),
    })
  }

  /**
   * Show notification for task completion
   */
  showTaskCompletedNotification(task) {
    if (!this.shouldShowNotification('taskCompleted')) {
      return null
    }

    const title = task.completed ? 'Task Completed' : 'Task Reopened'
    const body = task.completed
      ? `"${task.title}" has been marked as complete`
      : `"${task.title}" has been reopened`
    const options = {
      silent: !this.preferences.sound,
      tag: `task-completed-${task.id}`,
      actions: task.completed
        ? [
            {
              type: 'button',
              text: 'View Task',
            },
          ]
        : [
            {
              type: 'button',
              text: 'View Task',
            },
            {
              type: 'button',
              text: 'Mark Complete',
            },
          ],
    }

    return this.showNotification(title, body, {
      ...options,
      onClick: async () => this.handleTaskNotificationClick(task.id),
      onAction: async (actionIndex) =>
        this.handleTaskCompletedAction(task, actionIndex),
    })
  }

  /**
   * Show notification for task updates
   */
  showTaskUpdatedNotification(task, changes) {
    if (!this.shouldShowNotification('taskUpdated')) {
      return null
    }

    const title = 'Task Updated'
    let body = `"${task.title}" has been updated`

    // Provide more specific information about what changed
    if (changes.title) {
      body = `Task renamed to "${task.title}"`
    } else if (changes.description) {
      body = `"${task.title}" description updated`
    } else if (changes.dueDate) {
      body = `"${task.title}" due date updated`
    }

    const options = {
      silent: !this.preferences.sound,
      tag: `task-updated-${task.id}`,
      actions: [
        {
          type: 'button',
          text: 'View Task',
        },
      ],
    }

    return this.showNotification(title, body, {
      ...options,
      onClick: async () => this.handleTaskNotificationClick(task.id),
      onAction: async () => this.handleTaskNotificationClick(task.id),
    })
  }

  /**
   * Show notification for task deletion
   */
  showTaskDeletedNotification(task) {
    if (!this.shouldShowNotification('taskDeleted')) {
      return null
    }

    const title = 'Task Deleted'
    const body = `"${task.title}" has been removed from your TODO list`
    const options = {
      silent: !this.preferences.sound,
      tag: `task-deleted-${task.id}`,
    }

    return this.showNotification(title, body, options)
  }

  /**
   * Show custom notification with fallback support
   */
  showNotification(title, body, options = {}) {
    // If notifications are disabled or not supported, use fallback methods
    if (!this.preferences.enabled || !Notification.isSupported()) {
      this.showFallbackNotification(title, body, options)
      return null
    }

    try {
      const notification = new Notification({
        title,
        body,
        icon: this.getNotificationIcon(),
        silent: options.silent || false,
        tag: options.tag,
        actions: options.actions || [],
        ...options,
      })

      // Store active notification
      if (options.tag) {
        this.activeNotifications.set(options.tag, notification)
      }

      // Handle notification click
      notification.on('click', () => {
        this.windowManager.restoreFromTray()
        if (options.onClick) {
          options.onClick()
        }
      })

      // Handle notification actions
      notification.on('action', (event, index) => {
        if (options.onAction) {
          options.onAction(index)
        }
      })

      // Handle notification close
      notification.on('close', () => {
        if (options.tag) {
          this.activeNotifications.delete(options.tag)
        }
      })

      // Handle notification show
      notification.on('show', () => {})

      // Handle notification failed - use fallback methods
      notification.on('failed', (event, error) => {
        log.error('Notification failed, using fallback methods:', error)
        if (options.tag) {
          this.activeNotifications.delete(options.tag)
        }

        // Use fallback notification methods
        this.showFallbackNotification(title, body, options)
      })

      notification.show()
      return notification
    } catch (error) {
      log.error('Failed to show notification, using fallback methods:', error)

      // Use fallback notification methods
      this.showFallbackNotification(title, body, options)
      return null
    }
  }

  /**
   * Handle task notification click - focus task in main window
   */
  async handleTaskNotificationClick(taskId) {
    try {
      // Restore main window
      this.windowManager.restoreFromTray()

      // Send IPC to main window to focus specific task
      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('focus-task', taskId)
      }
    } catch (error) {
      log.error('Failed to handle task notification click:', error)
    }
  }

  /**
   * Handle task created notification actions
   */
  async handleTaskCreatedAction(task, actionIndex) {
    try {
      switch (actionIndex) {
        case 0: // View Task
          await this.handleTaskNotificationClick(task.id)
          break
        case 1: // Mark Complete
          await this.markTaskComplete(task.id)
          break
        default:
          log.warn('Unknown action index:', actionIndex)
      }
    } catch (error) {
      log.error('Failed to handle task created action:', error)
    }
  }

  /**
   * Handle task completed notification actions
   */
  async handleTaskCompletedAction(task, actionIndex) {
    try {
      switch (actionIndex) {
        case 0: // View Task
          await this.handleTaskNotificationClick(task.id)
          break
        case 1: // Mark Complete (for reopened tasks)
          if (!task.completed) {
            await this.markTaskComplete(task.id)
          }
          break
        default:
          log.warn('Unknown action index:', actionIndex)
      }
    } catch (error) {
      log.error('Failed to handle task completed action:', error)
    }
  }

  /**
   * Mark task as complete via IPC
   */
  async markTaskComplete(taskId) {
    try {
      // Send IPC to main process to update task
      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('mark-task-complete', taskId)
      }
    } catch (error) {
      log.error('Failed to mark task complete:', error)
    }
  }

  /**
   * Get notification icon path
   */
  getNotificationIcon() {
    // Try to use the same icon as system tray
    if (this.systemTrayManager) {
      return this.systemTrayManager.getTrayIconPath()
    }

    // Fallback to app icon
    const iconPath = path.join(__dirname, '../public/favicon.ico')
    try {
      return nativeImage.createFromPath(iconPath)
    } catch (error) {
      log.warn('Could not load notification icon:', error)
      return null
    }
  }

  /**
   * Check if notification should be shown based on preferences
   */
  shouldShowNotification(type) {
    return this.preferences.enabled && this.preferences[type]
  }

  /**
   * Update notification preferences
   */
  updatePreferences(newPreferences) {
    this.preferences = {
      ...this.preferences,
      ...newPreferences,
    }

    // Save to configuration if available
    if (this.configManager) {
      for (const [key, value] of Object.entries(newPreferences)) {
        this.configManager.set(`notifications.${key}`, value)
      }
    }
  }

  /**
   * Get current notification preferences
   */
  getPreferences() {
    return { ...this.preferences }
  }

  /**
   * Clear all active notifications
   */
  clearAllNotifications() {
    for (const [tag, notification] of this.activeNotifications) {
      try {
        notification.close()
      } catch (error) {
        log.warn(`Failed to close notification ${tag}:`, error)
      }
    }
    this.activeNotifications.clear()
  }

  /**
   * Clear specific notification by tag
   */
  clearNotification(tag) {
    const notification = this.activeNotifications.get(tag)
    if (notification) {
      try {
        notification.close()
        this.activeNotifications.delete(tag)
      } catch (error) {
        log.warn(`Failed to close notification ${tag}:`, error)
      }
    }
  }

  /**
   * Get count of active notifications
   */
  getActiveNotificationCount() {
    return this.activeNotifications.size
  }

  /**
   * Check if notifications are supported and enabled
   */
  isEnabled() {
    return this.preferences.enabled && Notification.isSupported()
  }

  /**
   * Cleanup notification manager
   */
  cleanup() {
    this.clearAllNotifications()
  }
}

module.exports = NotificationManager

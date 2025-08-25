const path = require('path')

const { Notification, nativeImage } = require('electron')

class NotificationManager {
  constructor(windowManager, systemTrayManager) {
    this.windowManager = windowManager
    this.systemTrayManager = systemTrayManager
    this.preferences = {
      enabled: true,
      taskCreated: true,
      taskCompleted: true,
      taskUpdated: true,
      taskDeleted: false, // Usually less important
      sound: true,
    }
    this.activeNotifications = new Map()
  }

  /**
   * Initialize notification manager and check permissions
   */
  async initialize() {
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.warn('Notifications are not supported on this system')
      this.preferences.enabled = false
      return false
    }

    // On macOS, we might need to request permission
    if (process.platform === 'darwin') {
      try {
        // Electron automatically handles notification permissions on macOS
        console.log('Notification permissions handled by Electron on macOS')
      } catch (error) {
        console.error('Failed to check notification permissions:', error)
      }
    }

    return true
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
   * Show custom notification
   */
  showNotification(title, body, options = {}) {
    if (!this.preferences.enabled || !Notification.isSupported()) {
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
      notification.on('show', () => {
        console.log(`Notification shown: ${title}`)
      })

      // Handle notification failed
      notification.on('failed', (event, error) => {
        console.error('Notification failed:', error)
        if (options.tag) {
          this.activeNotifications.delete(options.tag)
        }
      })

      notification.show()
      return notification
    } catch (error) {
      console.error('Failed to show notification:', error)
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
      console.error('Failed to handle task notification click:', error)
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
          console.warn('Unknown action index:', actionIndex)
      }
    } catch (error) {
      console.error('Failed to handle task created action:', error)
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
          console.warn('Unknown action index:', actionIndex)
      }
    } catch (error) {
      console.error('Failed to handle task completed action:', error)
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
      console.error('Failed to mark task complete:', error)
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
      console.warn('Could not load notification icon:', error)
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
        console.warn(`Failed to close notification ${tag}:`, error)
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
        console.warn(`Failed to close notification ${tag}:`, error)
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

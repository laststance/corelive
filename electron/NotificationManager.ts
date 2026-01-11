/**
 * @fileoverview Native Notification Manager for Electron
 *
 * Manages OS-level notifications for the application.
 *
 * @module electron/NotificationManager
 */

import path from 'path'

import { Notification, nativeImage, type NativeImage } from 'electron'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'

// ============================================================================
// Type Definitions
// ============================================================================

/** Window manager interface (minimal) */
interface WindowManager {
  restoreFromTray(): void
  hasMainWindow(): boolean
  getMainWindow(): Electron.BrowserWindow
}

/** System tray manager interface (minimal) */
interface SystemTrayManager {
  hasTray(): boolean
  setTrayTooltip(text: string): void
  getTrayIconPath(): string | undefined
}

/** Task structure */
interface Task {
  id: string
  title: string
  completed?: boolean
  description?: string
  dueDate?: Date
}

/** Task changes */
interface TaskChanges {
  title?: boolean
  description?: boolean
  dueDate?: boolean
}

/** Notification preferences */
export interface NotificationPreferences {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
  showInTray: boolean
  autoHide: boolean
  autoHideDelay: number
  position: 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft'
}

/** Notification options */
interface NotificationOptions {
  type?: 'info' | 'warning' | 'error' | 'success'
  silent?: boolean
  tag?: string
  urgency?: 'low' | 'normal' | 'critical'
  timeoutMs?: number
  icon?: string
  actions?: Array<{ type: 'button'; text: string }>
  onClick?: () => Promise<void>
  onAction?: (actionIndex: number) => Promise<void>
}

/** Permission result */
interface PermissionResult {
  granted: boolean
  reason: string
  error?: Error
}

/** Test result */
interface TestResult {
  success: boolean
  error?: string | Error
}

/** Fallback methods config */
interface FallbackMethods {
  trayTooltip: boolean
  windowTitle: boolean
  inAppBanner: boolean
}

// ============================================================================
// Notification Manager Class
// ============================================================================

/**
 * Manages native OS notifications with robust error handling.
 */
export class NotificationManager {
  /** Window manager instance */
  private windowManager: WindowManager

  /** System tray manager instance */
  private systemTrayManager: SystemTrayManager | null

  /** Config manager instance */
  private configManager: ConfigManager | null

  /** Active notifications */
  private activeNotifications: Map<string, Notification>

  /** Notification preferences */
  private preferences: NotificationPreferences

  /** Fallback mode - stored for debugging/future use */
  // @ts-ignore - Intentionally unused, stored for debugging
  private _fallbackMode: string | null = null

  /** Fallback methods */
  private fallbackMethods: FallbackMethods | null = null

  constructor(
    windowManager: WindowManager,
    systemTrayManager: SystemTrayManager | null,
    configManager: ConfigManager | null = null,
  ) {
    this.windowManager = windowManager
    this.systemTrayManager = systemTrayManager
    this.configManager = configManager
    this.activeNotifications = new Map()

    this.preferences = this.getDefaultPreferences()
    this.loadPreferences()
  }

  /**
   * Get fallback methods configuration.
   *
   * @returns Fallback methods or null if not configured
   */
  getFallbackMethods(): FallbackMethods | null {
    return this.fallbackMethods
  }

  /**
   * Get default notification preferences.
   */
  private getDefaultPreferences(): NotificationPreferences {
    return {
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

  /**
   * Loads notification preferences from user configuration.
   */
  loadPreferences(): void {
    if (this.configManager) {
      const savedPrefs = this.configManager.getSection('notifications')
      if (savedPrefs && typeof savedPrefs === 'object') {
        this.preferences = {
          ...this.preferences,
          ...savedPrefs,
        } as NotificationPreferences
      }
    }
  }

  /**
   * Initializes the notification system with permission checks.
   */
  async initialize(): Promise<boolean> {
    try {
      if (!Notification.isSupported()) {
        log.warn('Notifications are not supported on this system')
        this.handleNotificationUnavailable('not_supported')
        return false
      }

      const permissionResult = await this.checkNotificationPermissions()
      if (!permissionResult.granted) {
        log.warn('Notification permissions denied:', permissionResult.reason)
        this.handleNotificationPermissionDenied(permissionResult.reason)
        return false
      }

      const testResult = await this.testNotificationCapability()
      if (!testResult.success) {
        log.warn('Notification test failed:', testResult.error)
        this.handleNotificationTestFailure(testResult.error)
        return false
      }

      log.info('✅ Notifications initialized successfully')
      return true
    } catch (error) {
      log.error('❌ Failed to initialize notification manager:', error)
      this.handleNotificationInitializationFailure(error as Error)
      return false
    }
  }

  /**
   * Checks notification permissions.
   */
  async checkNotificationPermissions(): Promise<PermissionResult> {
    try {
      const testNotification = new Notification({
        title: 'Permission Test',
        body: 'Testing notification permissions',
        silent: true,
      })

      testNotification.close()
      return { granted: true, reason: 'test_successful' }
    } catch (permissionError) {
      const error = permissionError as Error
      if (
        error.message.includes('permission') ||
        error.message.includes('denied')
      ) {
        return { granted: false, reason: 'permission_denied' }
      }
      return { granted: false, reason: 'unknown_error', error }
    }
  }

  /**
   * Test notification capability.
   */
  async testNotificationCapability(): Promise<TestResult> {
    return new Promise((resolve) => {
      try {
        const testNotification = new Notification({
          title: 'Test',
          body: 'Testing notification support',
          silent: true,
        })

        let resolved = false

        testNotification.on('show', () => {
          if (!resolved) {
            resolved = true
            testNotification.close()
            resolve({ success: true })
          }
        })

        testNotification.on('failed', (_event, error) => {
          if (!resolved) {
            resolved = true
            resolve({ success: false, error: error ?? 'notification_failed' })
          }
        })

        testNotification.on('click', () => {
          if (!resolved) {
            resolved = true
            testNotification.close()
            resolve({ success: true })
          }
        })

        setTimeout(() => {
          if (!resolved) {
            resolved = true
            try {
              testNotification.close()
            } catch {
              // Ignore close errors
            }
            resolve({ success: true })
          }
        }, 1000)

        testNotification.show()
      } catch (error) {
        resolve({ success: false, error: error as Error })
      }
    })
  }

  /**
   * Handle notification unavailable.
   */
  private handleNotificationUnavailable(_reason: string): void {
    this.preferences.enabled = false
    this._fallbackMode = 'unavailable'
  }

  /**
   * Handle notification permission denied.
   */
  private handleNotificationPermissionDenied(reason: string): void {
    this.preferences.enabled = false
    this._fallbackMode = 'permission_denied'
    this.showPermissionDeniedGuidance(reason)
  }

  /**
   * Handle notification test failure.
   */
  private handleNotificationTestFailure(
    _error: string | Error | undefined,
  ): void {
    this.preferences.enabled = false
    this._fallbackMode = 'test_failed'
    this.enableFallbackNotificationMethods()
  }

  /**
   * Handle notification initialization failure.
   */
  private handleNotificationInitializationFailure(error: Error): void {
    this.preferences.enabled = false
    this._fallbackMode = 'init_failed'
    log.error('Notification initialization error details:', error)
  }

  /**
   * Show guidance for enabling notifications.
   */
  private showPermissionDeniedGuidance(_reason: string): void {
    if (this.systemTrayManager?.hasTray()) {
      this.systemTrayManager.setTrayTooltip(
        'TODO App - Notifications disabled (check system settings)',
      )
    }

    if (this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow.webContents.send('notification-permission-denied', {
        reason: _reason,
        guidance: this.getPermissionGuidanceForPlatform(),
      })
    }
  }

  /**
   * Get platform-specific guidance.
   */
  private getPermissionGuidanceForPlatform(): string {
    return 'Enable notifications in System Preferences > Notifications > TODO App'
  }

  /**
   * Enable fallback notification methods.
   */
  private enableFallbackNotificationMethods(): void {
    this.fallbackMethods = {
      trayTooltip: true,
      windowTitle: true,
      inAppBanner: true,
    }
  }

  /**
   * Show fallback notification.
   */
  private showFallbackNotification(
    title: string,
    body: string,
    options: NotificationOptions = {},
  ): void {
    if (!this.fallbackMethods) return

    try {
      if (
        this.fallbackMethods.trayTooltip &&
        this.systemTrayManager?.hasTray()
      ) {
        this.systemTrayManager.setTrayTooltip(`${title}: ${body}`)
      }

      if (
        this.fallbackMethods.windowTitle &&
        this.windowManager.hasMainWindow()
      ) {
        const mainWindow = this.windowManager.getMainWindow()
        const originalTitle = mainWindow.getTitle()
        mainWindow.setTitle(`${title} - ${originalTitle}`)

        setTimeout(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.setTitle(originalTitle)
          }
        }, 3000)
      }

      if (
        this.fallbackMethods.inAppBanner &&
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
   * Show notification for task creation.
   */
  showTaskCreatedNotification(task: Task): Notification | null {
    if (!this.shouldShowNotification('taskCreated')) {
      return null
    }

    const title = 'Task Created'
    const body = `"${task.title}" has been added to your TODO list`

    return this.showNotification(title, body, {
      silent: !this.preferences.sound,
      tag: `task-created-${task.id}`,
      onClick: async () => this.handleTaskNotificationClick(task.id),
      onAction: async (actionIndex) =>
        this.handleTaskCreatedAction(task, actionIndex),
    })
  }

  /**
   * Show notification for task completion.
   */
  showTaskCompletedNotification(task: Task): Notification | null {
    if (!this.shouldShowNotification('taskCompleted')) {
      return null
    }

    const title = task.completed ? 'Task Completed' : 'Task Reopened'
    const body = task.completed
      ? `"${task.title}" has been marked as complete`
      : `"${task.title}" has been reopened`

    return this.showNotification(title, body, {
      silent: !this.preferences.sound,
      tag: `task-completed-${task.id}`,
      onClick: async () => this.handleTaskNotificationClick(task.id),
      onAction: async (actionIndex) =>
        this.handleTaskCompletedAction(task, actionIndex),
    })
  }

  /**
   * Show notification for task updates.
   */
  showTaskUpdatedNotification(
    task: Task,
    changes: TaskChanges,
  ): Notification | null {
    if (!this.shouldShowNotification('taskUpdated')) {
      return null
    }

    const title = 'Task Updated'
    let body = `"${task.title}" has been updated`

    if (changes.title) {
      body = `Task renamed to "${task.title}"`
    } else if (changes.description) {
      body = `"${task.title}" description updated`
    } else if (changes.dueDate) {
      body = `"${task.title}" due date updated`
    }

    return this.showNotification(title, body, {
      silent: !this.preferences.sound,
      tag: `task-updated-${task.id}`,
      onClick: async () => this.handleTaskNotificationClick(task.id),
      onAction: async () => this.handleTaskNotificationClick(task.id),
    })
  }

  /**
   * Show notification for task deletion.
   */
  showTaskDeletedNotification(task: Task): Notification | null {
    if (!this.shouldShowNotification('taskDeleted')) {
      return null
    }

    const title = 'Task Deleted'
    const body = `"${task.title}" has been removed from your TODO list`

    return this.showNotification(title, body, {
      silent: !this.preferences.sound,
      tag: `task-deleted-${task.id}`,
    })
  }

  /**
   * Show custom notification.
   */
  showNotification(
    title: string,
    body: string,
    options: NotificationOptions = {},
  ): Notification | null {
    if (!this.preferences.enabled || !Notification.isSupported()) {
      this.showFallbackNotification(title, body, options)
      return null
    }

    try {
      const notification = new Notification({
        title,
        body,
        icon: this.getNotificationIcon() ?? undefined,
        silent: options.silent ?? false,
        actions: options.actions ?? [],
      })

      if (options.tag) {
        this.activeNotifications.set(options.tag, notification)
      }

      notification.on('click', () => {
        this.windowManager.restoreFromTray()
        if (options.onClick) {
          options.onClick()
        }
      })

      notification.on('action', (_event, index) => {
        if (options.onAction) {
          options.onAction(index)
        }
      })

      notification.on('close', () => {
        if (options.tag) {
          this.activeNotifications.delete(options.tag)
        }
      })

      notification.on('failed', (_event, error) => {
        log.error('Notification failed, using fallback methods:', error)
        if (options.tag) {
          this.activeNotifications.delete(options.tag)
        }
        this.showFallbackNotification(title, body, options)
      })

      notification.show()
      return notification
    } catch (error) {
      log.error('Failed to show notification, using fallback methods:', error)
      this.showFallbackNotification(title, body, options)
      return null
    }
  }

  /**
   * Handle task notification click.
   */
  private async handleTaskNotificationClick(taskId: string): Promise<void> {
    try {
      this.windowManager.restoreFromTray()

      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('focus-task', taskId)
      }
    } catch (error) {
      log.error('Failed to handle task notification click:', error)
    }
  }

  /**
   * Handle task created notification actions.
   */
  private async handleTaskCreatedAction(
    task: Task,
    actionIndex: number,
  ): Promise<void> {
    try {
      switch (actionIndex) {
        case 0:
          await this.handleTaskNotificationClick(task.id)
          break
        case 1:
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
   * Handle task completed notification actions.
   */
  private async handleTaskCompletedAction(
    task: Task,
    actionIndex: number,
  ): Promise<void> {
    try {
      switch (actionIndex) {
        case 0:
          await this.handleTaskNotificationClick(task.id)
          break
        case 1:
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
   * Mark task as complete via IPC.
   */
  private async markTaskComplete(taskId: string): Promise<void> {
    try {
      if (this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.webContents.send('mark-task-complete', taskId)
      }
    } catch (error) {
      log.error('Failed to mark task complete:', error)
    }
  }

  /**
   * Get notification icon.
   */
  private getNotificationIcon(): NativeImage | null {
    if (this.systemTrayManager) {
      const iconPath = this.systemTrayManager.getTrayIconPath()
      if (iconPath) {
        return nativeImage.createFromPath(iconPath)
      }
    }

    const iconPath = path.join(__dirname, '../public/favicon.ico')
    try {
      return nativeImage.createFromPath(iconPath)
    } catch (error) {
      log.warn('Could not load notification icon:', error)
      return null
    }
  }

  /**
   * Check if notification should be shown.
   */
  private shouldShowNotification(type: keyof NotificationPreferences): boolean {
    return this.preferences.enabled && !!this.preferences[type]
  }

  /**
   * Update notification preferences.
   */
  updatePreferences(newPreferences: Partial<NotificationPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ...newPreferences,
    }

    if (this.configManager) {
      for (const [key, value] of Object.entries(newPreferences)) {
        this.configManager.set(`notifications.${key}`, value)
      }
    }
  }

  /**
   * Get current notification preferences.
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences }
  }

  /**
   * Clear all active notifications.
   */
  clearAllNotifications(): void {
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
   * Clear specific notification by tag.
   */
  clearNotification(tag: string): void {
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
   * Get count of active notifications.
   */
  getActiveNotificationCount(): number {
    return this.activeNotifications.size
  }

  /**
   * Check if notifications are enabled.
   */
  isEnabled(): boolean {
    return this.preferences.enabled && Notification.isSupported()
  }

  /**
   * Cleanup notification manager.
   */
  cleanup(): void {
    this.clearAllNotifications()
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default NotificationManager

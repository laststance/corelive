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
import type {
  NotificationOptions,
  NotificationSettingsState,
} from './types/ipc'
import { openWebAppInBrowser } from './utils/openWebAppInBrowser'
// NotificationSettingsState and NotificationOptions are the canonical contract
// types from ./types/ipc.ts — imported here so the manager stays aligned with
// the IPC boundary contract (single source of truth).

// ============================================================================
// Type Definitions
// ============================================================================

/** Window manager interface (minimal) */
interface WindowManager {
  restoreFromTray(): void
  // Origin of the full web app (dev localhost / prod corelive.app) for routing
  // notification click-through to the browser task view.
  getWebAppOrigin(): string
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

export type { NotificationSettingsState, NotificationOptions }

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

  /** Notification settings */
  private settings: NotificationSettingsState

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

    this.settings = this.getDefaultSettings()
    this.loadSettings()
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
   * Get default notification settings.
   */
  private getDefaultSettings(): NotificationSettingsState {
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
   * Loads notification settings from user configuration.
   */
  loadSettings(): void {
    if (this.configManager) {
      const savedSettings = this.configManager.getSection('notifications')
      if (savedSettings && typeof savedSettings === 'object') {
        this.settings = {
          ...this.settings,
          ...savedSettings,
        } as NotificationSettingsState
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
    this.settings.enabled = false
    this._fallbackMode = 'unavailable'
  }

  /**
   * Handle notification permission denied.
   */
  private handleNotificationPermissionDenied(reason: string): void {
    this.settings.enabled = false
    this._fallbackMode = 'permission_denied'
    this.showPermissionDeniedGuidance(reason)
  }

  /**
   * Handle notification test failure.
   */
  private handleNotificationTestFailure(
    _error: string | Error | undefined,
  ): void {
    this.settings.enabled = false
    this._fallbackMode = 'test_failed'
    this.enableFallbackNotificationMethods()
  }

  /**
   * Handle notification initialization failure.
   */
  private handleNotificationInitializationFailure(error: Error): void {
    this.settings.enabled = false
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

    // Main window retired (T18): the tray tooltip above is the only surface for
    // this guidance — don't escalate a permissions nag to the browser.
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
    _options: NotificationOptions = {},
  ): void {
    if (!this.fallbackMethods) return

    try {
      if (
        this.fallbackMethods.trayTooltip &&
        this.systemTrayManager?.hasTray()
      ) {
        this.systemTrayManager.setTrayTooltip(`${title}: ${body}`)
      }

      // The window-title flash and in-app banner both needed a live main window;
      // with it retired (T18) the tray tooltip above is the surviving fallback.
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
      silent: !this.settings.sound,
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
      silent: !this.settings.sound,
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
      silent: !this.settings.sound,
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
      silent: !this.settings.sound,
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
    if (!this.settings.enabled || !Notification.isSupported()) {
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
  private async handleTaskNotificationClick(_taskId: string): Promise<void> {
    try {
      // Surface the Floating quick-navigator, then route to the full task view in
      // the browser — the task UI lives at corelive.app now, not an Electron
      // window. The old `focus-task` IPC had no renderer listener even before the
      // cut; its type def (types/ipc.ts) + preload allowlist are orphaned, slated
      // for T18/T19 removal. No per-task web route exists, so we open `/home`.
      this.windowManager.restoreFromTray()
      openWebAppInBrowser(this.windowManager.getWebAppOrigin(), '/home')
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
  private async markTaskComplete(_taskId: string): Promise<void> {
    // Inert by design: the `mark-task-complete` channel never had a renderer
    // listener, and with the main window retired (T18) there is no surface to
    // route it to. Completing a task from a notification has no web contract, so
    // this stays a deliberate no-op rather than a re-implemented mutation. The
    // notification action is kept so its UX is unchanged.
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
  private shouldShowNotification(
    type: keyof NotificationSettingsState,
  ): boolean {
    return this.settings.enabled && !!this.settings[type]
  }

  /**
   * Update notification settings.
   */
  updateSettings(newSettings: Partial<NotificationSettingsState>): void {
    this.settings = {
      ...this.settings,
      ...newSettings,
    }

    if (this.configManager) {
      for (const [key, value] of Object.entries(newSettings)) {
        this.configManager.set(`notifications.${key}`, value)
      }
    }
  }

  /**
   * Get current notification settings.
   */
  getSettings(): NotificationSettingsState {
    return { ...this.settings }
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
    return this.settings.enabled && Notification.isSupported()
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

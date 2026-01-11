/**
 * @fileoverview System Integration Error Handler for Electron
 *
 * Manages failures in OS-level integrations and provides fallback strategies.
 *
 * @module electron/SystemIntegrationErrorHandler
 */

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
import type { NotificationManager } from './NotificationManager'
import type { ShortcutManager } from './ShortcutManager'
import type { SystemTrayManager } from './SystemTrayManager'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Integration status for a single component */
interface ComponentIntegrationStatus {
  available: boolean
  fallbackMode: boolean
  error: string | null
}

/** Shortcut integration status */
interface ShortcutIntegrationStatus {
  available: boolean
  partiallyAvailable: boolean
  failedCount: number
  error: string | null
}

/** All integration statuses */
interface IntegrationStatuses {
  tray: ComponentIntegrationStatus
  notifications: ComponentIntegrationStatus
  shortcuts: ShortcutIntegrationStatus
}

/** User notification tracking */
interface UserNotified {
  tray: boolean
  notifications: boolean
  shortcuts: boolean
}

/** Initialization result for a component */
interface InitializationResult {
  success: boolean
  component: string
  fallback?: boolean
  partial?: boolean
  error?: string
  failedCount?: number
  failedShortcuts?: Record<string, unknown>
}

/** All initialization results */
interface InitializationResults {
  tray: InitializationResult
  notifications: InitializationResult
  shortcuts: InitializationResult
}

/** Status report for a component */
interface ComponentStatusReport {
  status: 'working' | 'fallback' | 'failed' | 'partial'
  message: string
}

/** Full status report */
interface StatusReport {
  overall: string
  summary: string
  components: {
    tray: ComponentStatusReport
    notifications: ComponentStatusReport
    shortcuts: ComponentStatusReport
  }
  recommendations: string[]
}

/** Overall status type */
type OverallStatus = 'full' | 'partial' | 'minimal' | 'failed' | undefined

// ============================================================================
// System Integration Error Handler Class
// ============================================================================

/**
 * Coordinates error handling and fallback strategies for OS integrations.
 */
export class SystemIntegrationErrorHandler {
  /** Window manager reference */
  private windowManager: WindowManager

  /** Config manager reference */
  private configManager: ConfigManager | null

  /** System tray manager reference */
  private systemTrayManager: SystemTrayManager | null

  /** Notification manager reference */
  private notificationManager: NotificationManager | null

  /** Shortcut manager reference */
  private shortcutManager: ShortcutManager | null

  /** Integration status for each feature */
  private integrationStatus: IntegrationStatuses

  /** Track user notifications about failures - stored for future use */
  // @ts-ignore - Intentionally unused, stored for future features
  private _userNotified: UserNotified

  /** Overall status */
  private overallStatus: OverallStatus

  /** List of issues */
  private issues: string[]

  constructor(
    windowManager: WindowManager,
    configManager: ConfigManager | null = null,
  ) {
    this.windowManager = windowManager
    this.configManager = configManager

    this.systemTrayManager = null
    this.notificationManager = null
    this.shortcutManager = null

    this.integrationStatus = {
      tray: { available: false, fallbackMode: false, error: null },
      notifications: { available: false, fallbackMode: false, error: null },
      shortcuts: {
        available: false,
        partiallyAvailable: false,
        failedCount: 0,
        error: null,
      },
    }

    this._userNotified = {
      tray: false,
      notifications: false,
      shortcuts: false,
    }

    this.overallStatus = undefined
    this.issues = []
  }

  /**
   * Set system integration managers.
   */
  setManagers(
    systemTrayManager: SystemTrayManager | null,
    notificationManager: NotificationManager | null,
    shortcutManager: ShortcutManager | null,
  ): void {
    this.systemTrayManager = systemTrayManager
    this.notificationManager = notificationManager
    this.shortcutManager = shortcutManager
  }

  /**
   * Initializes all system integrations with error handling.
   *
   * @returns Status of each integration
   */
  async initializeSystemIntegration(): Promise<InitializationResults> {
    const results: InitializationResults = {
      tray: await this.initializeTrayWithErrorHandling(),
      notifications: await this.initializeNotificationsWithErrorHandling(),
      shortcuts: await this.initializeShortcutsWithErrorHandling(),
    }

    this.analyzeIntegrationStatus(results)
    this.showIntegrationSummary(results)

    return results
  }

  /**
   * Initializes system tray with fallback handling.
   */
  async initializeTrayWithErrorHandling(): Promise<InitializationResult> {
    try {
      if (!this.systemTrayManager) {
        throw new Error('SystemTrayManager not available')
      }

      const tray = await this.systemTrayManager.createTray()

      if (tray) {
        this.integrationStatus.tray = {
          available: true,
          fallbackMode: false,
          error: null,
        }

        return { success: true, component: 'tray' }
      } else {
        const isFallbackMode = this.systemTrayManager.isFallbackMode()

        this.integrationStatus.tray = {
          available: false,
          fallbackMode: isFallbackMode,
          error: 'Tray creation failed',
        }

        log.warn('System tray unavailable, fallback mode enabled')
        return {
          success: false,
          fallback: true,
          component: 'tray',
          error: 'Tray creation failed',
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.integrationStatus.tray = {
        available: false,
        fallbackMode: true,
        error: errorMessage,
      }

      log.error('System tray initialization failed:', error)

      if (this.windowManager) {
        this.windowManager.setTrayFallbackMode(true)
      }

      return {
        success: false,
        fallback: true,
        component: 'tray',
        error: errorMessage,
      }
    }
  }

  /**
   * Initialize notifications with error handling.
   */
  async initializeNotificationsWithErrorHandling(): Promise<InitializationResult> {
    try {
      if (!this.notificationManager) {
        throw new Error('NotificationManager not available')
      }

      const success = await this.notificationManager.initialize()

      if (success) {
        this.integrationStatus.notifications = {
          available: true,
          fallbackMode: false,
          error: null,
        }

        return { success: true, component: 'notifications' }
      } else {
        const hasFallbackMethods = this.notificationManager.getFallbackMethods()

        this.integrationStatus.notifications = {
          available: false,
          fallbackMode: !!hasFallbackMethods,
          error: 'Notification initialization failed',
        }

        log.warn('Notifications unavailable, fallback methods enabled')
        return {
          success: false,
          fallback: !!hasFallbackMethods,
          component: 'notifications',
          error: 'Notification initialization failed',
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.integrationStatus.notifications = {
        available: false,
        fallbackMode: false,
        error: errorMessage,
      }

      log.error('Notification initialization failed:', error)
      return {
        success: false,
        fallback: false,
        component: 'notifications',
        error: errorMessage,
      }
    }
  }

  /**
   * Initialize shortcuts with error handling.
   */
  async initializeShortcutsWithErrorHandling(): Promise<InitializationResult> {
    try {
      if (!this.shortcutManager) {
        throw new Error('ShortcutManager not available')
      }

      const success = this.shortcutManager.initialize()

      this.shortcutManager.setupFocusListeners()

      if (success) {
        const failedShortcuts = this.shortcutManager.getFailedShortcuts()
        const failedCount = Object.keys(failedShortcuts).length

        if (failedCount === 0) {
          this.integrationStatus.shortcuts = {
            available: true,
            partiallyAvailable: false,
            failedCount: 0,
            error: null,
          }

          return { success: true, component: 'shortcuts' }
        } else {
          this.integrationStatus.shortcuts = {
            available: false,
            partiallyAvailable: true,
            failedCount,
            error: `${failedCount} shortcuts failed to register`,
          }
          log.warn(`Shortcuts partially available: ${failedCount} failed`)
          return {
            success: true,
            partial: true,
            component: 'shortcuts',
            failedCount,
            failedShortcuts,
          }
        }
      } else {
        this.integrationStatus.shortcuts = {
          available: false,
          partiallyAvailable: false,
          failedCount: 0,
          error: 'Shortcut initialization failed',
        }

        log.error('Shortcut initialization failed completely')
        return {
          success: false,
          component: 'shortcuts',
          error: 'Shortcut initialization failed',
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.integrationStatus.shortcuts = {
        available: false,
        partiallyAvailable: false,
        failedCount: 0,
        error: errorMessage,
      }

      log.error('Shortcut initialization failed:', error)
      return { success: false, component: 'shortcuts', error: errorMessage }
    }
  }

  /**
   * Analyze overall integration status.
   */
  analyzeIntegrationStatus(results: InitializationResults): void {
    const { tray, notifications, shortcuts } = results

    let overallStatus: OverallStatus = 'full'
    const issues: string[] = []

    if (!tray.success) {
      if (tray.fallback) {
        issues.push('System tray unavailable (using fallback)')
        overallStatus = 'partial'
      } else {
        issues.push('System tray failed')
        overallStatus = 'minimal'
      }
    }

    if (!notifications.success) {
      if (notifications.fallback) {
        issues.push('Notifications unavailable (using fallback)')
        if (overallStatus === 'full') overallStatus = 'partial'
      } else {
        issues.push('Notifications failed')
        if (overallStatus !== 'minimal') overallStatus = 'minimal'
      }
    }

    if (!shortcuts.success) {
      issues.push('Shortcuts failed')
      overallStatus = 'failed'
    } else if (shortcuts.partial) {
      issues.push(`${shortcuts.failedCount} shortcuts unavailable`)
      if (overallStatus === 'full') overallStatus = 'partial'
    }

    this.overallStatus = overallStatus
    this.issues = issues
  }

  /**
   * Show integration summary to user.
   */
  showIntegrationSummary(_results: InitializationResults): void {
    if (this.overallStatus === 'full') {
      return
    }

    let title = 'Desktop Integration'
    let message = ''

    switch (this.overallStatus) {
      case 'partial':
        title = 'Desktop Integration Partially Available'
        message =
          'Some desktop features are unavailable but the app will work normally.'
        break
      case 'minimal':
        title = 'Limited Desktop Integration'
        message =
          'Desktop features are limited. The app will work with basic functionality.'
        break
      case 'failed':
        title = 'Desktop Integration Unavailable'
        message =
          'Desktop integration features are not available on this system.'
        break
    }

    if (this.issues.length > 0) {
      message += `\n\nIssues: ${this.issues.join(', ')}`
    }

    this.showIntegrationNotification(title, message)
    this.saveIntegrationStatus()
  }

  /**
   * Show integration notification using available methods.
   */
  showIntegrationNotification(title: string, message: string): void {
    if (this.notificationManager && this.notificationManager.isEnabled()) {
      this.notificationManager.showNotification(title, message, {
        silent: true,
      })
      return
    }

    if (this.systemTrayManager && this.systemTrayManager.hasTray()) {
      this.systemTrayManager.setTrayTooltip(`${title}: ${message}`)
    }

    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow) {
        const originalTitle = mainWindow.getTitle()
        mainWindow.setTitle(`${title} - ${originalTitle}`)

        setTimeout(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.setTitle(originalTitle)
          }
        }, 5000)
      }
    }

    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow?.webContents.send('system-integration-status', {
        status: this.overallStatus,
        title,
        message,
        issues: this.issues,
        integrationStatus: this.integrationStatus,
      })
    }
  }

  /**
   * Save integration status to configuration.
   */
  saveIntegrationStatus(): void {
    if (this.configManager) {
      try {
        this.configManager.set('systemIntegration.lastStatus', {
          status: this.overallStatus,
          issues: this.issues,
          timestamp: new Date().toISOString(),
          integrationStatus: this.integrationStatus,
        })
      } catch (error) {
        log.warn('Failed to save integration status:', error)
      }
    }
  }

  /**
   * Get current integration status.
   */
  getIntegrationStatus(): {
    overall: OverallStatus
    issues: string[]
    components: IntegrationStatuses
  } {
    return {
      overall: this.overallStatus,
      issues: this.issues,
      components: this.integrationStatus,
    }
  }

  /**
   * Retry failed integrations.
   */
  async retryFailedIntegrations(): Promise<Partial<InitializationResults>> {
    const retryResults: Partial<InitializationResults> = {}

    if (!this.integrationStatus.tray.available) {
      retryResults.tray = await this.initializeTrayWithErrorHandling()
    }

    if (!this.integrationStatus.notifications.available) {
      retryResults.notifications =
        await this.initializeNotificationsWithErrorHandling()
    }

    if (
      !this.integrationStatus.shortcuts.available ||
      this.integrationStatus.shortcuts.partiallyAvailable
    ) {
      if (this.shortcutManager) {
        const shortcutRetry = this.shortcutManager.retryFailedShortcuts()
        retryResults.shortcuts = {
          success: shortcutRetry.success,
          component: 'shortcuts',
          error: shortcutRetry.message,
        }
      }
    }

    if (Object.keys(retryResults).length > 0) {
      this.analyzeIntegrationStatus({
        tray: retryResults.tray || {
          success: this.integrationStatus.tray.available,
          component: 'tray',
        },
        notifications: retryResults.notifications || {
          success: this.integrationStatus.notifications.available,
          component: 'notifications',
        },
        shortcuts: retryResults.shortcuts || {
          success: this.integrationStatus.shortcuts.available,
          component: 'shortcuts',
        },
      })
    }

    return retryResults
  }

  /**
   * Handle app quit - cleanup integration components.
   */
  handleAppQuit(): void {
    try {
      if (this.shortcutManager) {
        this.shortcutManager.cleanup()
      }
    } catch (error) {
      log.warn('Error cleaning up shortcuts:', error)
    }

    try {
      if (this.notificationManager) {
        this.notificationManager.cleanup()
      }
    } catch (error) {
      log.warn('Error cleaning up notifications:', error)
    }

    try {
      if (this.systemTrayManager) {
        this.systemTrayManager.destroy()
      }
    } catch (error) {
      log.warn('Error cleaning up system tray:', error)
    }
  }

  /**
   * Get user-friendly status report.
   */
  getStatusReport(): StatusReport {
    return {
      overall: this.overallStatus || 'unknown',
      summary: this.getStatusSummary(),
      components: {
        tray: this.getTrayStatusReport(),
        notifications: this.getNotificationStatusReport(),
        shortcuts: this.getShortcutStatusReport(),
      },
      recommendations: this.getRecommendations(),
    }
  }

  /**
   * Get overall status summary.
   */
  getStatusSummary(): string {
    switch (this.overallStatus) {
      case 'full':
        return 'All desktop integration features are working properly.'
      case 'partial':
        return 'Most desktop features are working. Some features may use alternative methods.'
      case 'minimal':
        return 'Basic desktop functionality is available. Some features are unavailable.'
      case 'failed':
        return 'Desktop integration features are not available on this system.'
      default:
        return 'Desktop integration status unknown.'
    }
  }

  /**
   * Get tray status report.
   */
  getTrayStatusReport(): ComponentStatusReport {
    const status = this.integrationStatus.tray

    if (status.available) {
      return {
        status: 'working',
        message: 'System tray is available and working.',
      }
    } else if (status.fallbackMode) {
      return {
        status: 'fallback',
        message:
          'System tray unavailable. App will minimize normally instead of to tray.',
      }
    } else {
      return {
        status: 'failed',
        message: `System tray failed: ${status.error}`,
      }
    }
  }

  /**
   * Get notification status report.
   */
  getNotificationStatusReport(): ComponentStatusReport {
    const status = this.integrationStatus.notifications

    if (status.available) {
      return { status: 'working', message: 'Native notifications are working.' }
    } else if (status.fallbackMode) {
      return {
        status: 'fallback',
        message:
          'Native notifications unavailable. Using alternative notification methods.',
      }
    } else {
      return {
        status: 'failed',
        message: `Notifications failed: ${status.error}`,
      }
    }
  }

  /**
   * Get shortcut status report.
   */
  getShortcutStatusReport(): ComponentStatusReport {
    const status = this.integrationStatus.shortcuts

    if (status.available && !status.partiallyAvailable) {
      return {
        status: 'working',
        message: 'All keyboard shortcuts are working.',
      }
    } else if (status.partiallyAvailable) {
      return {
        status: 'partial',
        message: `Most shortcuts working. ${status.failedCount} shortcuts unavailable due to conflicts.`,
      }
    } else {
      return {
        status: 'failed',
        message: `Shortcuts failed: ${status.error}`,
      }
    }
  }

  /**
   * Get recommendations for improving integration.
   */
  getRecommendations(): string[] {
    const recommendations: string[] = []

    if (!this.integrationStatus.tray.available) {
      recommendations.push(
        'Check if your desktop environment supports system tray icons.',
      )
    }

    if (!this.integrationStatus.notifications.available) {
      recommendations.push(
        'Enable notifications in your system settings for better task alerts.',
      )
    }

    if (this.integrationStatus.shortcuts.partiallyAvailable) {
      recommendations.push(
        'Some keyboard shortcuts conflict with system shortcuts. Check shortcut settings to see alternatives.',
      )
    }

    return recommendations
  }
}

export default SystemIntegrationErrorHandler

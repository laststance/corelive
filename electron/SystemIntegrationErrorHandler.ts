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

/** Overall status type */
type OverallStatus = 'full' | 'partial' | 'minimal' | 'failed' | undefined

// ============================================================================
// System Integration Error Handler Class
// ============================================================================

/**
 * Coordinates error handling and fallback strategies for OS integrations.
 */
export class SystemIntegrationErrorHandler {
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

  /** Overall status */
  private overallStatus: OverallStatus

  /** List of issues */
  private issues: string[]

  constructor(configManager: ConfigManager | null = null) {
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

    // The retired main window was the last fallback surface here (a title flash
    // + a `system-integration-status` IPC). The title flash is gone with the
    // window, and that status channel had no renderer listener anywhere — dead
    // even pre-cut — so it's dropped rather than re-pointed at the login window
    // (a sign-in shell, not a diagnostics host). The tray tooltip above is the
    // surviving non-notification surface.
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
}

export default SystemIntegrationErrorHandler

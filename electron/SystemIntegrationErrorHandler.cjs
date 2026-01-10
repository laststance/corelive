/**
 * @fileoverview System Integration Error Handler for Electron
 *
 * Manages failures in OS-level integrations and provides fallback strategies.
 *
 * Why system integration error handling matters:
 * - OS features can fail for many reasons (permissions, conflicts, bugs)
 * - Users expect apps to work even with partial feature failures
 * - Different platforms have different failure modes
 * - Graceful degradation is better than crashing
 *
 * System integrations that can fail:
 * - System tray (missing on some Linux desktops)
 * - Notifications (permissions, DND mode)
 * - Global shortcuts (conflicts with other apps)
 * - Protocol handlers (security restrictions)
 * - Auto-start (permissions)
 *
 * This handler provides:
 * - Centralized error management
 * - Fallback strategies for each feature
 * - User notification of degraded functionality
 * - Recovery attempts where possible
 * - Detailed logging for support
 *
 * @module electron/SystemIntegrationErrorHandler
 */

const { log } = require('./logger.cjs')

/**
 * Coordinates error handling and fallback strategies for OS integrations.
 *
 * Key responsibilities:
 * - Initialize system features with error handling
 * - Track what's working and what's not
 * - Implement fallback behaviors
 * - Notify users of limitations
 * - Attempt recovery when appropriate
 *
 * Design philosophy:
 * - Fail gracefully, not catastrophically
 * - Always provide core functionality
 * - Be transparent about limitations
 * - Log everything for debugging
 */
class SystemIntegrationErrorHandler {
  constructor(windowManager, configManager = null) {
    this.windowManager = windowManager
    this.configManager = configManager

    // References to system integration managers
    this.systemTrayManager = null
    this.notificationManager = null
    this.shortcutManager = null

    /**
     * Track integration status for each feature.
     * This helps us:
     * - Know what's working
     * - Implement appropriate fallbacks
     * - Show accurate status to users
     * - Debug issues in production
     */
    this.integrationStatus = {
      tray: { available: false, fallbackMode: false, error: null },
      notifications: { available: false, fallbackMode: false, error: null },
      shortcuts: {
        available: false,
        partiallyAvailable: false, // Some shortcuts might work
        failedCount: 0,
        error: null,
      },
    }

    // Track user notifications about failures
    this.userNotified = {
      tray: false,
      notifications: false,
      shortcuts: false,
    }
  }

  /**
   * Set system integration managers
   */
  setManagers(systemTrayManager, notificationManager, shortcutManager) {
    this.systemTrayManager = systemTrayManager
    this.notificationManager = notificationManager
    this.shortcutManager = shortcutManager
  }

  /**
   * Initializes all system integrations with error handling.
   *
   * Process:
   * 1. Try to initialize each integration
   * 2. Catch and handle failures
   * 3. Activate fallback modes
   * 4. Notify user of any limitations
   *
   * Why initialize all at once?
   * - Better user experience (one notification vs many)
   * - Can make intelligent fallback decisions
   * - Easier to show overall status
   *
   * @returns {Promise<Object>} Status of each integration
   */
  async initializeSystemIntegration() {
    const results = {
      tray: await this.initializeTrayWithErrorHandling(),
      notifications: await this.initializeNotificationsWithErrorHandling(),
      shortcuts: await this.initializeShortcutsWithErrorHandling(),
    }

    // Determine overall health and fallback strategies
    this.analyzeIntegrationStatus(results)

    // Inform user once about all issues (better UX)
    this.showIntegrationSummary(results)

    return results
  }

  /**
   * Initializes system tray with fallback handling.
   *
   * Common failure scenarios:
   * - Linux without system tray support
   * - macOS with hidden menu bar
   * - Windows with disabled notification area
   * - Missing tray icon file
   *
   * Fallback behavior:
   * - Window stays in taskbar when closed
   * - No minimize-to-tray functionality
   * - Window controls work normally
   *
   * @returns {Promise<Object>} Initialization result
   */
  async initializeTrayWithErrorHandling() {
    try {
      if (!this.systemTrayManager) {
        throw new Error('SystemTrayManager not available')
      }

      const tray = this.systemTrayManager.createTray()

      if (tray) {
        // Success! Tray is working
        this.integrationStatus.tray = {
          available: true,
          fallbackMode: false,
          error: null,
        }

        return { success: true, component: 'tray' }
      } else {
        // Tray creation failed, check if fallback mode was enabled
        const isFallbackMode = this.systemTrayManager.isFallbackMode()

        this.integrationStatus.tray = {
          available: false,
          fallbackMode: isFallbackMode,
          error: 'Tray creation failed',
        }

        log.warn('⚠️ System tray unavailable, fallback mode enabled')
        return {
          success: false,
          fallback: true,
          component: 'tray',
          error: 'Tray creation failed',
        }
      }
    } catch (error) {
      this.integrationStatus.tray = {
        available: false,
        fallbackMode: true,
        error: error.message,
      }

      log.error('❌ System tray initialization failed:', error)

      // Enable fallback mode in window manager
      if (this.windowManager) {
        this.windowManager.setTrayFallbackMode(true)
      }

      return {
        success: false,
        fallback: true,
        component: 'tray',
        error: error.message,
      }
    }
  }

  /**
   * Initialize notifications with error handling
   */
  async initializeNotificationsWithErrorHandling() {
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
        // Check if fallback methods are available
        const hasFallbackMethods = this.notificationManager.fallbackMethods

        this.integrationStatus.notifications = {
          available: false,
          fallbackMode: !!hasFallbackMethods,
          error: 'Notification initialization failed',
        }

        log.warn('⚠️ Notifications unavailable, fallback methods enabled')
        return {
          success: false,
          fallback: !!hasFallbackMethods,
          component: 'notifications',
          error: 'Notification initialization failed',
        }
      }
    } catch (error) {
      this.integrationStatus.notifications = {
        available: false,
        fallbackMode: false,
        error: error.message,
      }

      log.error('❌ Notification initialization failed:', error)
      return {
        success: false,
        fallback: false,
        component: 'notifications',
        error: error.message,
      }
    }
  }

  /**
   * Initialize shortcuts with error handling
   */
  async initializeShortcutsWithErrorHandling() {
    try {
      if (!this.shortcutManager) {
        throw new Error('ShortcutManager not available')
      }

      const success = this.shortcutManager.initialize()

      // Setup focus listeners for dynamic shortcut management
      // This prevents Corelive shortcuts from interfering with other apps
      this.shortcutManager.setupFocusListeners()

      if (success) {
        // Check if any shortcuts failed
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
          log.warn(`⚠️ Shortcuts partially available: ${failedCount} failed`)
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

        log.error('❌ Shortcut initialization failed completely')
        return {
          success: false,
          component: 'shortcuts',
          error: 'Shortcut initialization failed',
        }
      }
    } catch (error) {
      this.integrationStatus.shortcuts = {
        available: false,
        partiallyAvailable: false,
        failedCount: 0,
        error: error.message,
      }

      log.error('❌ Shortcut initialization failed:', error)
      return { success: false, component: 'shortcuts', error: error.message }
    }
  }

  /**
   * Analyze overall integration status
   */
  analyzeIntegrationStatus(results) {
    const { tray, notifications, shortcuts } = results

    let overallStatus = 'full' // full, partial, minimal, failed
    const issues = []

    // Check tray status
    if (!tray.success) {
      if (tray.fallback) {
        issues.push('System tray unavailable (using fallback)')
        overallStatus = 'partial'
      } else {
        issues.push('System tray failed')
        overallStatus = 'minimal'
      }
    }

    // Check notification status
    if (!notifications.success) {
      if (notifications.fallback) {
        issues.push('Notifications unavailable (using fallback)')
        if (overallStatus === 'full') overallStatus = 'partial'
      } else {
        issues.push('Notifications failed')
        if (overallStatus !== 'minimal') overallStatus = 'minimal'
      }
    }

    // Check shortcut status
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
   * Show integration summary to user
   */
  showIntegrationSummary(_results) {
    if (this.overallStatus === 'full') {
      // Everything working, no need to notify user
      return
    }

    // Prepare user-friendly message
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

    // Add specific issues to message
    if (this.issues.length > 0) {
      message += `\n\nIssues: ${this.issues.join(', ')}`
    }

    // Show notification using available methods
    this.showIntegrationNotification(title, message)

    // Save status to config for future reference
    this.saveIntegrationStatus()
  }

  /**
   * Show integration notification using available methods
   */
  showIntegrationNotification(title, message) {
    // Try native notification first
    if (this.notificationManager && this.notificationManager.isEnabled()) {
      this.notificationManager.showNotification(title, message, {
        silent: true,
      })
      return
    }

    // Try system tray tooltip
    if (this.systemTrayManager && this.systemTrayManager.hasTray()) {
      this.systemTrayManager.setTrayTooltip(`${title}: ${message}`)
    }

    // Try window title update
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      const originalTitle = mainWindow.getTitle()
      mainWindow.setTitle(`${title} - ${originalTitle}`)

      // Restore original title after delay
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.setTitle(originalTitle)
        }
      }, 5000)
    }

    // Send to renderer for in-app display
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow.webContents.send('system-integration-status', {
        status: this.overallStatus,
        title,
        message,
        issues: this.issues,
        integrationStatus: this.integrationStatus,
      })
    }
  }

  /**
   * Save integration status to configuration
   */
  saveIntegrationStatus() {
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
   * Get current integration status
   */
  getIntegrationStatus() {
    return {
      overall: this.overallStatus,
      issues: this.issues,
      components: this.integrationStatus,
    }
  }

  /**
   * Retry failed integrations
   */
  async retryFailedIntegrations() {
    const retryResults = {}

    // Retry tray if it failed
    if (!this.integrationStatus.tray.available) {
      retryResults.tray = await this.initializeTrayWithErrorHandling()
    }

    // Retry notifications if they failed
    if (!this.integrationStatus.notifications.available) {
      retryResults.notifications =
        await this.initializeNotificationsWithErrorHandling()
    }

    // Retry shortcuts if they failed
    if (
      !this.integrationStatus.shortcuts.available ||
      this.integrationStatus.shortcuts.partiallyAvailable
    ) {
      if (this.shortcutManager) {
        const shortcutRetry = this.shortcutManager.retryFailedShortcuts()
        retryResults.shortcuts = {
          success: shortcutRetry.success,
          component: 'shortcuts',
          message: shortcutRetry.message,
        }
      }
    }

    // Re-analyze status if any retries were performed
    if (Object.keys(retryResults).length > 0) {
      this.analyzeIntegrationStatus({
        tray: retryResults.tray || {
          success: this.integrationStatus.tray.available,
        },
        notifications: retryResults.notifications || {
          success: this.integrationStatus.notifications.available,
        },
        shortcuts: retryResults.shortcuts || {
          success: this.integrationStatus.shortcuts.available,
        },
      })
    }

    return retryResults
  }

  /**
   * Handle app quit - cleanup integration components
   */
  handleAppQuit() {
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
   * Get user-friendly status report
   */
  getStatusReport() {
    const report = {
      overall: this.overallStatus,
      summary: this.getStatusSummary(),
      components: {
        tray: this.getTrayStatusReport(),
        notifications: this.getNotificationStatusReport(),
        shortcuts: this.getShortcutStatusReport(),
      },
      recommendations: this.getRecommendations(),
    }

    return report
  }

  /**
   * Get overall status summary
   */
  getStatusSummary() {
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
   * Get tray status report
   */
  getTrayStatusReport() {
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
   * Get notification status report
   */
  getNotificationStatusReport() {
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
   * Get shortcut status report
   */
  getShortcutStatusReport() {
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
   * Get recommendations for improving integration
   */
  getRecommendations() {
    const recommendations = []

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

module.exports = SystemIntegrationErrorHandler

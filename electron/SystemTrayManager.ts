/**
 * @fileoverview System Tray Manager for Electron (macOS only)
 *
 * Manages the menu bar icon and menu that appears in the top-right corner of macOS.
 *
 * @module electron/SystemTrayManager
 */

import fs from 'fs'
import path from 'path'

import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import type { MenuItemConstructorOptions, NativeImage } from 'electron'

import { log } from './logger'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Task item for tray menu */
export interface TaskItem {
  title: string
  completed: boolean
}

/** Notification options */
interface TrayNotificationOptions {
  silent?: boolean
  onClick?: () => void
}

// ============================================================================
// System Tray Manager Class
// ============================================================================

/**
 * Manages macOS menu bar (system tray) functionality with robust error handling.
 */
export class SystemTrayManager {
  /** Window manager for show/hide operations */
  private windowManager: WindowManager

  /** Tray instance */
  private tray: Tray | null

  /**
   * In-flight createTray() promise, memoized so concurrent callers share one
   * native Tray instead of each constructing their own during the async window
   * between the hasTray() guard and the this.tray assignment.
   */
  private trayCreationPromise: Promise<Tray | null> | null

  /** Flag to distinguish quit vs minimize */
  private isQuitting: boolean

  /** Fallback mode flag */
  private fallbackMode: boolean

  /** Whether tray notification has been shown */
  private hasShownTrayNotification: boolean

  /**
   * Live accelerator provider, injected after ShortcutManager loads (it is
   * constructed AFTER this manager, so it cannot arrive via the constructor).
   * Returns the current `{ shortcutId: accelerator }` map so the tray menu can
   * DISPLAY each hotkey live — tray accelerators are display-only, they register
   * no key binding.
   */
  private getShortcutAccelerators?: () => Record<string, string>

  /**
   * Last task list passed to updateTrayMenu, cached so a shortcut-triggered
   * refreshTrayMenu() re-renders with current accelerators without wiping the
   * recent-tasks section.
   */
  private lastTasks: TaskItem[]

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager
    this.tray = null
    this.trayCreationPromise = null
    this.isQuitting = false
    this.fallbackMode = false
    this.hasShownTrayNotification = false
    this.lastTasks = []
  }

  /**
   * Creates the system tray, idempotent under both sequential and concurrent
   * calls. Reached from two paths that can interleave — boot
   * (SystemIntegrationErrorHandler.initializeTrayWithErrorHandling) and the live
   * "Show in Menu Bar" toggle / ElectronStartupSync re-push (via
   * setMenuBarVisible). The synchronous hasTray() guard alone does not cover the
   * await inside createTrayInternal(), so a second caller could slip in before
   * this.tray is assigned and build a duplicate native Tray (orphaning a menu-bar
   * icon); memoizing the in-flight promise makes concurrent callers share one.
   *
   * @returns The tray instance or null if creation failed.
   */
  async createTray(): Promise<Tray | null> {
    // A creation is already running: share its promise so concurrent callers
    // receive the same tray instead of racing to build a second one.
    if (this.trayCreationPromise) {
      return this.trayCreationPromise
    }
    this.trayCreationPromise = this.createTrayInternal()
    try {
      return await this.trayCreationPromise
    } finally {
      // Clear so a later call (re-show after a hide/destroy, or retry after a
      // failed attempt that returned null) can create the tray again.
      this.trayCreationPromise = null
    }
  }

  /**
   * Actual tray creation logic, serialized by createTray()'s in-flight guard.
   * Returns null (never throws) on any failure so createTray()'s finally always
   * clears the memoized promise and a subsequent call may retry.
   *
   * @returns The tray instance or null if creation failed.
   */
  private async createTrayInternal(): Promise<Tray | null> {
    try {
      // Sequential idempotency: a tray already exists (e.g. boot created it
      // before a toggle re-push), so return it rather than overwriting and
      // orphaning the previous native Tray.
      if (this.hasTray()) {
        return this.tray
      }

      if (!this.isSystemTraySupported()) {
        log.warn('System tray is not supported on this platform')
        this.tray = null
        this.enableFallbackMode()
        return null
      }

      const trayIcon = this.createTrayIcon()
      if (!trayIcon) {
        log.warn('Failed to create tray icon, enabling fallback mode')
        this.enableFallbackMode()
        return null
      }

      this.tray = await this.createTrayWithRetry(trayIcon)
      if (!this.tray) {
        log.warn(
          'Failed to create system tray after retries, enabling fallback mode',
        )
        this.enableFallbackMode()
        return null
      }

      this.setTrayTooltipSafely('TODO Desktop App')

      if (!this.setupTrayMenuSafely()) {
        log.warn('Failed to setup tray menu, using minimal functionality')
      }

      if (!this.setupTrayEventsSafely()) {
        log.warn(
          'Failed to setup tray events, tray will have limited functionality',
        )
      }

      return this.tray
    } catch (error) {
      log.error('Failed to create system tray:', error)
      this.handleTrayCreationFailure(error)
      return null
    }
  }

  /**
   * Checks if system tray is supported on the current platform.
   */
  isSystemTraySupported(): boolean {
    try {
      return process.platform === 'darwin'
    } catch (error) {
      log.warn('Error checking system tray support:', error)
      return false
    }
  }

  /**
   * Creates the tray icon with appropriate format and size for macOS.
   */
  createTrayIcon(state: string = 'default'): NativeImage | null {
    try {
      const iconPath = this.getTrayIconPath(state)
      let trayIcon: NativeImage | null | undefined

      if (iconPath) {
        try {
          trayIcon = nativeImage.createFromPath(iconPath)
          if (!trayIcon.isEmpty()) {
            if (
              process.platform === 'darwin' &&
              iconPath.includes('Template')
            ) {
              trayIcon.setTemplateImage(true)
              log.warn('Set tray icon as Template image for macOS')
            }

            if (process.platform === 'darwin') {
              trayIcon = trayIcon.resize({ width: 16, height: 16 })
            }

            return trayIcon
          }
        } catch (iconError) {
          log.warn('Failed to load tray icon from path:', iconError)
        }
      }

      try {
        trayIcon = this.createFallbackIcon()
        if (trayIcon && !trayIcon.isEmpty()) {
          return trayIcon
        }
      } catch (fallbackError) {
        log.warn('Failed to create fallback icon:', fallbackError)
      }

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
   * Create a simple fallback icon.
   */
  createFallbackIcon(): NativeImage | null {
    try {
      const width = 16
      const height = 16
      const buffer = Buffer.alloc(width * height * 4)

      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 0
        buffer[i + 1] = 122
        buffer[i + 2] = 204
        buffer[i + 3] = 255
      }

      return nativeImage.createFromBuffer(buffer, { width, height })
    } catch (bitmapError) {
      log.warn('Failed to create bitmap fallback icon:', bitmapError)
      return null
    }
  }

  /**
   * Non-blocking delay helper.
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Create tray with retry logic (async to avoid blocking main thread).
   */
  async createTrayWithRetry(
    trayIcon: NativeImage,
    maxRetries: number = 3,
  ): Promise<Tray | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tray = new Tray(trayIcon)

        if (tray && !tray.isDestroyed()) {
          return tray
        }
      } catch (error) {
        log.warn(`Tray creation attempt ${attempt} failed:`, error)

        if (attempt < maxRetries) {
          // Use async delay instead of blocking busy-wait
          const delayMs = Math.pow(2, attempt - 1) * 100
          await this.delay(delayMs)
        }
      }
    }

    return null
  }

  /**
   * Set tray tooltip safely.
   */
  setTrayTooltipSafely(text: string): boolean {
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
   * Setup tray menu safely.
   */
  setupTrayMenuSafely(): boolean {
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
   * Setup tray events safely.
   */
  setupTrayEventsSafely(): boolean {
    try {
      this.setupTrayEvents()
      return true
    } catch (error) {
      log.warn('Failed to setup tray events:', error)
      return false
    }
  }

  /**
   * Handle tray creation failure and enable fallback mode.
   */
  handleTrayCreationFailure(error: unknown): void {
    log.error('System tray creation failed completely:', error)
    this.tray = null
    this.enableFallbackMode()

    if (this.windowManager) {
      try {
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
   * Single writer for fallback mode: keeps this manager's flag and the
   * WindowManager's close-routing flag in lockstep, so window-close never tries
   * to `.hide()` into a tray that no longer exists.
   * @param enabled - true routes window-close to minimize; false restores hide-to-tray.
   * @example
   * this.setFallbackMode(true) // tray gone → minimize on close instead of hide
   */
  private setFallbackMode(enabled: boolean): void {
    this.fallbackMode = enabled

    if (this.windowManager) {
      this.windowManager.setTrayFallbackMode(enabled)
    }
  }

  /**
   * Enable fallback mode when tray is not available.
   */
  enableFallbackMode(): void {
    this.setFallbackMode(true)
  }

  /**
   * Check if running in fallback mode.
   */
  isFallbackMode(): boolean {
    return this.fallbackMode || false
  }

  /**
   * Get appropriate tray icon path based on platform and state.
   */
  getTrayIconPath(state: string = 'default'): string | null {
    const isDev = !app.isPackaged

    let iconDir: string
    if (isDev) {
      // In development, __dirname is dist-electron/main/
      // We need to go up two levels to reach the project root, then into build/icons/tray
      iconDir = path.join(__dirname, '..', '..', 'build', 'icons', 'tray')
    } else {
      iconDir = path.join(process.resourcesPath, 'tray-icons')
    }

    log.warn(`Tray icon directory: ${iconDir} (isDev: ${isDev})`)

    if (process.platform === 'darwin') {
      const templatePaths = [
        path.join(iconDir, 'trayTemplate.png'),
        path.join(iconDir, 'checkTemplate.png'),
      ]

      for (const templatePath of templatePaths) {
        if (this.fileExists(templatePath)) {
          log.warn(`Using macOS Template icon: ${templatePath}`)
          return templatePath
        }
      }
    }

    const size = this.getTrayIconSize()

    const stateIconPath = path.join(
      iconDir,
      `tray-${size}x${size}-${state}.png`,
    )
    if (this.fileExists(stateIconPath)) {
      return stateIconPath
    }

    const defaultIconPath = path.join(iconDir, `tray-${size}x${size}.png`)
    if (this.fileExists(defaultIconPath)) {
      return defaultIconPath
    }

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

    log.warn('No tray icon found in:', iconDir)
    return null
  }

  /**
   * Get appropriate tray icon size for macOS menu bar.
   */
  getTrayIconSize(): number {
    return 16
  }

  /**
   * Check if file exists safely.
   */
  fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath)
    } catch {
      return false
    }
  }

  /**
   * Inject the live accelerator provider. Called from main.ts after
   * ShortcutManager loads (it is constructed after this manager), so the tray
   * menu can display each shortcut's current hotkey. Display-only — registers
   * no key binding.
   *
   * @param provider - Returns the current `{ shortcutId: accelerator }` map.
   */
  setShortcutAcceleratorProvider(provider: () => Record<string, string>): void {
    this.getShortcutAccelerators = provider
  }

  /**
   * Re-render the tray menu with the last tasks + current accelerators.
   * Triggered after a shortcut rebind so a displayed hotkey never goes stale.
   *
   * @returns True when the menu was rebuilt, false when no tray is available.
   */
  refreshTrayMenu(): boolean {
    return this.updateTrayMenu(this.lastTasks)
  }

  /**
   * Update tray context menu.
   */
  updateTrayMenu(tasks: TaskItem[] = []): boolean {
    if (!this.tray || this.tray.isDestroyed()) {
      log.warn('Cannot update tray menu: tray not available')
      return false
    }

    // Cache so refreshTrayMenu() can re-render with live accelerators without
    // losing the recent-tasks section.
    this.lastTasks = tasks

    try {
      // Live, display-only hotkeys; an empty/absent value omits the accelerator
      // so a rebound or unset shortcut never shows a stale or orphan glyph.
      const accelerators = this.getShortcutAccelerators?.() ?? {}
      const floatingNavigatorAccelerator = accelerators.toggleFloatingNavigator
      const brainDumpAccelerator = accelerators.toggleBrainDump

      const template: MenuItemConstructorOptions[] = [
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
        { type: 'separator' },
        {
          label: 'Toggle Floating Navigator',
          ...(floatingNavigatorAccelerator
            ? { accelerator: floatingNavigatorAccelerator }
            : {}),
          click: () => {
            try {
              this.windowManager.toggleFloatingNavigator()
            } catch (error) {
              log.error('Failed to toggle floating navigator:', error)
            }
          },
        },
        {
          label: 'Toggle BrainDump',
          ...(brainDumpAccelerator
            ? { accelerator: brainDumpAccelerator }
            : {}),
          click: () => {
            try {
              this.windowManager.toggleBrainDump()
            } catch (error) {
              log.error('Failed to toggle BrainDump:', error)
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          click: () => {
            try {
              this.windowManager.openSettings()
            } catch (error) {
              log.error('Failed to open settings:', error)
            }
          },
        },
        { type: 'separator' },
        ...this.buildTaskMenuItems(tasks),
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            try {
              this.isQuitting = true
              app.quit()
            } catch (error) {
              log.error('Failed to quit application:', error)
            }
          },
        },
      ]

      const contextMenu = Menu.buildFromTemplate(template)
      this.tray.setContextMenu(contextMenu)
      return true
    } catch (error) {
      log.error('Failed to update tray menu:', error)

      try {
        this.createFallbackMenu()
      } catch (fallbackError) {
        log.error('Failed to create fallback menu:', fallbackError)
      }

      return false
    }
  }

  /**
   * Create a minimal fallback menu when normal menu creation fails.
   */
  createFallbackMenu(): void {
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
            app.quit()
          },
        },
      ])

      this.tray.setContextMenu(fallbackMenu)
    } catch (error) {
      log.error('Failed to create fallback tray menu:', error)
    }
  }

  /**
   * Build menu items for recent tasks.
   */
  buildTaskMenuItems(tasks: TaskItem[]): MenuItemConstructorOptions[] {
    if (!tasks || tasks.length === 0) {
      return [
        {
          label: 'No recent tasks',
          enabled: false,
        },
      ]
    }

    const recentTasks = tasks.slice(0, 5)

    return recentTasks.map((task) => ({
      label: `${task.completed ? '✓' : '○'} ${task.title.substring(0, 30)}${task.title.length > 30 ? '...' : ''}`,
      click: () => {
        this.windowManager.restoreFromTray()
      },
    }))
  }

  /**
   * Setup tray event handlers for macOS.
   */
  setupTrayEvents(): void {
    if (!this.tray) return

    this.tray.on('double-click', () => {
      this.windowManager.restoreFromTray()
    })
  }

  /**
   * Show native notification with error handling.
   */
  showNotification(
    title: string,
    body: string,
    options: TrayNotificationOptions = {},
  ): Notification | null {
    try {
      if (!Notification.isSupported()) {
        log.warn('Notifications are not supported on this system')
        return null
      }

      const notification = new Notification({
        title,
        body,
        icon: this.getTrayIconPath() ?? undefined,
        silent: options.silent || false,
      })

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

      notification.on('failed', (_event, error) => {
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
   * Update tray tooltip.
   */
  setTrayTooltip(text: string): void {
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setToolTip(text)
    }
  }

  /**
   * Handle window close event - minimize to tray instead of closing.
   */
  handleWindowClose(event: Electron.Event): void {
    if (!this.isQuitting) {
      event.preventDefault()
      this.windowManager.minimizeToTray()

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
   * Set quitting flag to allow actual app quit.
   */
  setQuitting(quitting: boolean = true): void {
    this.isQuitting = quitting
  }

  /**
   * Check if app is quitting.
   */
  isAppQuitting(): boolean {
    return this.isQuitting
  }

  /**
   * Show or hide the menu-bar (tray) icon live, backing the "Show in Menu Bar"
   * setting toggle. Creating is idempotent (no second `Tray` if one already
   * exists); hiding tears the current tray down. On platforms without tray
   * support it is a successful no-op, matching `setHideAppIcon` semantics.
   *
   * @param visible - true creates/keeps the tray, false destroys it.
   * @returns
   * - `true` when the tray now matches `visible` (incl. unsupported-platform no-op)
   * - `false` only when `visible` was requested but tray creation failed
   * @example
   * await systemTrayManager.setMenuBarVisible(false) // tray icon disappears
   */
  async setMenuBarVisible(visible: boolean): Promise<boolean> {
    // Hiding always succeeds: destroy() is a guarded no-op when no tray exists.
    if (!visible) {
      this.destroy()
      // Hiding removes the only tray surface, so route window-close through
      // minimize — otherwise close would `.hide()` into a destroyed tray and
      // strand the app with no way back.
      this.setFallbackMode(true)
      return true
    }
    // Unsupported platform: treat as a successful no-op (mirrors setHideAppIcon).
    if (!this.isSystemTraySupported()) {
      return true
    }
    // Already visible: short-circuit to keep the existing tray. createTray() is
    // now idempotent on its own, but returning early also skips the redundant
    // icon/menu rebuild and just re-asserts the close-to-tray routing below.
    if (this.hasTray()) {
      // A live tray exists, so close should hide-to-tray, not minimize.
      this.setFallbackMode(false)
      return true
    }
    const tray = await this.createTray()
    if (tray !== null) {
      // Tray restored: leave fallback so window-close hides to the tray again.
      this.setFallbackMode(false)
      return true
    }
    // createTray failed; every null-return path already armed fallback. Report
    // failure so the UI does not persist a "shown" state that never appeared.
    return false
  }

  /**
   * Destroy tray.
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  /**
   * Get tray instance.
   */
  getTray(): Tray | null {
    return this.tray
  }

  /**
   * Returns the bounding rectangle of the tray icon for window positioning.
   *
   * @returns Tray icon bounds or null if tray is unavailable
   * @example
   * const bounds = trayManager.getTrayBounds()
   * // bounds = { x: 1200, y: 0, width: 22, height: 22 } or null
   */
  getTrayBounds(): Electron.Rectangle | null {
    if (!this.tray || this.tray.isDestroyed()) return null
    try {
      return this.tray.getBounds()
    } catch {
      return null
    }
  }

  /**
   * Set tray icon state.
   */
  setTrayIconState(state: string = 'default'): boolean {
    if (!this.tray || this.tray.isDestroyed()) {
      log.warn('Cannot set tray icon state: tray not available')
      return false
    }

    try {
      const iconPath = this.getTrayIconPath(state)
      if (iconPath) {
        const icon = nativeImage.createFromPath(iconPath)
        this.tray.setImage(icon)
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
   * Set tray icon to active state.
   */
  setActiveState(): boolean {
    return this.setTrayIconState('active')
  }

  /**
   * Set tray icon to notification state.
   */
  setNotificationState(): boolean {
    return this.setTrayIconState('notification')
  }

  /**
   * Set tray icon to disabled state.
   */
  setDisabledState(): boolean {
    return this.setTrayIconState('disabled')
  }

  /**
   * Reset tray icon to default state.
   */
  resetToDefaultState(): boolean {
    return this.setTrayIconState('default')
  }

  /**
   * Check if tray exists.
   */
  hasTray(): boolean {
    return this.tray !== null && !this.tray.isDestroyed()
  }
}

export default SystemTrayManager

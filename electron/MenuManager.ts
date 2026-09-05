/**
 * @fileoverview Application Menu Manager for Electron
 *
 * Manages the native application menu bar that appears at the top of the screen
 * (macOS) or window (Windows/Linux).
 *
 * @module electron/MenuManager
 */

import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
import { openWebAppInBrowser } from './utils/openWebAppInBrowser'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Menu Manager Class
// ============================================================================

/**
 * Manages application menu creation and updates.
 */
export class MenuManager {
  /** Window manager reference */
  private windowManager: WindowManager | null

  /** Config manager reference - stored for future use */
  // @ts-ignore - Intentionally unused, stored for future features
  private _configManager: ConfigManager | null

  /** Platform is macOS */
  private isMac: boolean

  constructor() {
    this.windowManager = null
    this._configManager = null
    this.isMac = process.platform === 'darwin'
  }

  /**
   * Initializes the menu manager with required dependencies. There is no main
   * window to pass — it was retired in T18; View & Window menu items are
   * Electron roles that target the focused window instead, and New Task opens
   * the browser, so the menu needs no main-window reference to build correctly.
   *
   * @param windowManager - For window-related menu actions
   * @param configManager - Provides configuration-backed menu actions
   */
  initialize(windowManager: WindowManager, configManager: ConfigManager): void {
    log.debug('[MenuManager] initialize() called with:', {
      hasWindowManager: !!windowManager,
      hasConfigManager: !!configManager,
    })

    this.windowManager = windowManager
    this._configManager = configManager

    log.info('[MenuManager] Creating application menu...')
    try {
      this.createApplicationMenu()
      log.info('[MenuManager] Application menu created successfully')
    } catch (error) {
      console.error('[MenuManager] Failed to create application menu:', error)
      throw error
    }
  }

  /**
   * Creates and sets the application menu.
   */
  createApplicationMenu(): void {
    log.debug('[MenuManager] Building menu template...')
    const template = this.buildMenuTemplate()
    log.debug(
      '[MenuManager] Menu template built, creating menu from template...',
    )
    const menu = Menu.buildFromTemplate(template)
    log.debug('[MenuManager] Setting application menu...')
    Menu.setApplicationMenu(menu)
    log.info('[MenuManager] Application menu set successfully')
  }

  /**
   * Builds the complete menu template based on platform.
   *
   * @returns Menu template array
   */
  buildMenuTemplate(): MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = []

    if (this.isMac) {
      template.push(this.createAppMenu())
    }

    template.push(this.createFileMenu())
    template.push(this.createEditMenu())
    template.push(this.createViewMenu())
    template.push(this.createWindowMenu())
    template.push(this.createHelpMenu())

    return template
  }

  /**
   * Creates macOS-specific app menu.
   */
  createAppMenu(): MenuItemConstructorOptions {
    return {
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => this.showAboutDialog(),
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          click: () => this.openSettings(),
        },
        {
          label: 'Check for Updates...',
          click: async () => this.checkForUpdates(),
        },
        { type: 'separator' },
        {
          label: 'Services',
          role: 'services',
          submenu: [],
        },
        { type: 'separator' },
        {
          label: `Hide ${app.getName()}`,
          accelerator: 'Command+H',
          role: 'hide',
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideOthers',
        },
        {
          label: 'Show All',
          role: 'unhide',
        },
        { type: 'separator' },
        {
          label: `Quit ${app.getName()}`,
          accelerator: 'Command+Q',
          click: () => app.quit(),
        },
      ],
    }
  }

  /**
   * Create File menu.
   */
  createFileMenu(): MenuItemConstructorOptions {
    return {
      label: 'File',
      submenu: [
        {
          label: 'New Task',
          click: () => this.createNewTask(),
        },
      ],
    }
  }

  /**
   * Create Edit menu.
   */
  createEditMenu(): MenuItemConstructorOptions {
    return {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    }
  }

  /**
   * Create View menu.
   */
  createViewMenu(): MenuItemConstructorOptions {
    // Standard view chrome uses Electron roles so each item targets whatever
    // window is focused (login, LiveEditor or Settings) — no main-window
    // reference needed, so these stay correct after main retirement. Explicit
    // accelerators are kept so the bindings don't shift from the previous build.
    const submenu: MenuItemConstructorOptions[] = [
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
      {
        label: 'Force Reload',
        accelerator: 'CmdOrCtrl+Shift+R',
        role: 'forceReload',
      },
      {
        label: 'Toggle Developer Tools',
        accelerator: this.isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        role: 'toggleDevTools',
      },
      { type: 'separator' },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { type: 'separator' },
      {
        label: 'Toggle Fullscreen',
        accelerator: this.isMac ? 'Ctrl+Command+F' : 'F11',
        role: 'togglefullscreen',
      },
    ]

    return {
      label: 'View',
      submenu,
    }
  }

  /**
   * Creates the Window menu for window management.
   *
   * Adds a "LiveEditor Note" entry that toggles the frameless panel via
   * WindowManager; the global accelerator is owned by ShortcutManager.
   */
  createWindowMenu(): MenuItemConstructorOptions {
    // Minimize/Close are Electron roles so they act on the focused window — they
    // work for login/LiveEditor/Settings, not just a main window that may not exist.
    const submenu: MenuItemConstructorOptions[] = [
      { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
      { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
      { type: 'separator' },
      {
        label: 'LiveEditor Note',
        click: () => this.toggleLiveEditor(),
      },
    ]

    if (this.isMac) {
      submenu.push(
        { type: 'separator' },
        {
          label: 'Bring All to Front',
          role: 'front',
        },
      )
    }

    return {
      label: 'Window',
      submenu,
    }
  }

  /**
   * Creates the Help menu for user assistance.
   */
  createHelpMenu(): MenuItemConstructorOptions {
    const submenu: MenuItemConstructorOptions[] = [
      {
        label: 'Learn More',
        click: () => {
          shell.openExternal('https://github.com/corelive/corelive')
        },
      },
      {
        label: 'Documentation',
        click: () => {
          shell.openExternal('https://github.com/corelive/corelive/wiki')
        },
      },
      {
        label: 'Report Issue',
        click: () => {
          shell.openExternal('https://github.com/corelive/corelive/issues')
        },
      },
      { type: 'separator' },
      {
        label: 'Keyboard Shortcuts',
        accelerator: 'CmdOrCtrl+/',
        click: () => this.showKeyboardShortcuts(),
      },
    ]

    return {
      label: 'Help',
      submenu,
    }
  }

  // Menu action handlers

  /**
   * Opens LiveEditor in the browser — the File ▸ New Task item. Targets
   * `/live-editor` because it is the only surface that creates tasks now; Home
   * became a read-only completion dashboard when the Todo write vertical was
   * retired. No `restoreFromTray` (unlike the global new-task shortcut in
   * ShortcutManager): a menu click already comes from a focused window, so
   * there's no tray-resident state to surface.
   * @returns Nothing; logs and no-ops if the WindowManager (origin source) is absent.
   * @example
   * this.createNewTask() // opens https://corelive.app/live-editor
   */
  createNewTask(): void {
    if (!this.windowManager) {
      log.warn('[MenuManager] windowManager unavailable; cannot open New Task')
      return
    }
    openWebAppInBrowser(this.windowManager.getWebAppOrigin(), '/live-editor')
  }

  /** Toggle the LiveEditor Note window via WindowManager. */
  toggleLiveEditor(): void {
    log.debug('[MenuManager] toggleLiveEditor() called')

    if (this.windowManager) {
      this.windowManager.toggleLiveEditor()
    } else {
      console.error('[MenuManager] windowManager is not available!')
    }
  }

  /** Opens the native Settings popover when the app menu or legacy menu bridge requests it.
   * @returns Nothing; the WindowManager owns the popover lifecycle.
   * @example
   * menuManager.openSettings()
   */
  openSettings(): void {
    log.debug('📋 [MenuManager] openSettings() called')

    // Open the dedicated Settings window
    if (this.windowManager) {
      log.debug('📋 [MenuManager] Opening Settings window via windowManager')
      this.windowManager.openSettings()
    } else {
      log.warn(
        '📋 [MenuManager] windowManager not available; cannot open Settings',
      )
    }
  }

  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdatesAndNotify()
    } catch (error) {
      log.error('Failed to check for updates:', error)

      const errorMessage =
        error instanceof Error ? error.message : 'Please try again later.'
      this.showMenuMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Failed to check for updates.',
        detail: errorMessage,
        buttons: ['OK'],
      })
    }
  }

  /**
   * Shows a menu-triggered message box anchored to the focused window, or
   * parentless when none is up — companion-mode menu dialogs (About, Keyboard
   * Shortcuts, update-check failure) must surface even with no main window.
   * @param options - Electron message-box options (type/title/message/detail/buttons).
   * @returns Nothing; fire-and-forget — the dismissed-button result is unused.
   * @example
   * this.showMenuMessageBox({ type: 'info', message: 'About', buttons: ['OK'] })
   */
  private showMenuMessageBox(options: MessageBoxOptions): void {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      dialog.showMessageBox(focusedWindow, options)
    } else {
      dialog.showMessageBox(options)
    }
  }

  showAboutDialog(): void {
    const version = app.getVersion()
    const electronVersion = process.versions.electron
    const nodeVersion = process.versions.node

    this.showMenuMessageBox({
      type: 'info',
      title: `About ${app.getName()}`,
      message: `${app.getName()} ${version}`,
      detail: `A modern TODO application with desktop integration.

Built with:
• Electron ${electronVersion}
• Node.js ${nodeVersion}
• Next.js & React

Copyright © 2025 CoreLive`,
      buttons: ['OK'],
      defaultId: 0,
    })
  }

  showKeyboardShortcuts(): void {
    const shortcuts = [
      'Ctrl/Cmd + N: New Task',
      'Ctrl/Cmd + M: Minimize Window',
      'Alt/Option + Space: Toggle LiveEditor',
      'Ctrl/Cmd + Q: Quit Application',
      'Ctrl/Cmd + ,: Settings',
      'Ctrl/Cmd + R: Reload',
      'Ctrl/Cmd + Shift + R: Force Reload',
      'Ctrl/Cmd + 0: Reset Zoom',
      'Ctrl/Cmd + Plus: Zoom In',
      'Ctrl/Cmd + Minus: Zoom Out',
      'Ctrl/Cmd + W: Close Window',
      'F11 (Ctrl+Cmd+F on Mac): Toggle Fullscreen',
      '',
      '* Shortcut defaults can be changed from Settings > Keyboard Shortcuts',
    ]

    this.showMenuMessageBox({
      type: 'info',
      title: 'Keyboard Shortcuts',
      message: 'Available Keyboard Shortcuts',
      detail: shortcuts.join('\n'),
      buttons: ['OK'],
      defaultId: 0,
    })
  }

  destroy(): void {
    this.windowManager = null
    this._configManager = null
  }
}

export default MenuManager

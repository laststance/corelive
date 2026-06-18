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
import { typedSend } from './ipc/typedSend'
import { log } from './logger'
import { openWebAppInBrowser } from './utils/openWebAppInBrowser'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Menu action payload */
interface MenuAction {
  action: string
  filePath?: string
}

/** Menu state for enabling/disabling items */
interface MenuState {
  [key: string]: boolean
}

// ============================================================================
// Menu Manager Class
// ============================================================================

/**
 * Manages application menu creation and updates.
 */
export class MenuManager {
  /** Main window reference */
  private mainWindow: BrowserWindow | null

  /** Window manager reference */
  private windowManager: WindowManager | null

  /** Config manager reference - stored for future use */
  // @ts-ignore - Intentionally unused, stored for future features
  private _configManager: ConfigManager | null

  /** Platform is macOS */
  private isMac: boolean

  constructor() {
    this.mainWindow = null
    this.windowManager = null
    this._configManager = null
    this.isMac = process.platform === 'darwin'
  }

  /**
   * Initializes the menu manager with required dependencies.
   *
   * @param mainWindow - The main application window, or `null` when none exists
   *   (post-main-retirement / signed-out launch). The menu still builds: View &
   *   Window items are Electron roles that target the focused window, and New Task
   *   opens the browser, so a `null` main window leaves no dead menu items.
   * @param windowManager - For window-related menu actions
   * @param configManager - For preference-related actions
   */
  initialize(
    mainWindow: BrowserWindow | null,
    windowManager: WindowManager,
    configManager: ConfigManager,
  ): void {
    log.debug('[MenuManager] initialize() called with:', {
      hasMainWindow: !!mainWindow,
      hasWindowManager: !!windowManager,
      hasConfigManager: !!configManager,
    })

    this.mainWindow = mainWindow
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
          label: 'Preferences...',
          click: () => this.openPreferences(),
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
    const submenu: MenuItemConstructorOptions[] = [
      {
        label: 'New Task',
        click: () => this.createNewTask(),
      },
      { type: 'separator' },
      {
        label: 'Import Tasks...',
        click: async () => this.importTasks(),
      },
      {
        label: 'Export Tasks...',
        click: async () => this.exportTasks(),
      },
    ]

    return {
      label: 'File',
      submenu,
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
        { type: 'separator' },
        {
          label: 'Find',
          click: () => this.focusSearch(),
        },
      ],
    }
  }

  /**
   * Create View menu.
   */
  createViewMenu(): MenuItemConstructorOptions {
    // Standard view chrome uses Electron roles so each item targets whatever
    // window is focused (main, Floating, BrainDump or Settings) — no main-window
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
        label: 'Floating Navigator',
        submenu: [
          {
            label: 'Toggle Floating Navigator',
            click: () => this.toggleFloatingNavigator(),
          },
          { type: 'separator' },
          {
            label: 'Focus New Task Input',
            click: () => this.sendFloatingNavigatorAction('focus-new-task'),
          },
        ],
      },
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
   * Adds a "BrainDump Note" entry that toggles the frameless panel via
   * WindowManager; the global accelerator is owned by ShortcutManager.
   */
  createWindowMenu(): MenuItemConstructorOptions {
    // Minimize/Close are Electron roles so they act on the focused window — they
    // work for Floating/BrainDump/Settings, not just a main window that may not exist.
    const submenu: MenuItemConstructorOptions[] = [
      { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
      { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
      { type: 'separator' },
      {
        label: 'BrainDump Note',
        click: () => this.toggleBrainDump(),
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
   * Opens the full web app's new-task flow in the browser — the File ▸ New Task
   * item, post-main-retirement. No `restoreFromTray` (unlike the global new-task
   * shortcut in ShortcutManager): a menu click already comes from a focused
   * window, so there's no tray-resident state to surface.
   *
   * The `menu-action` channel stays live — focus-search / import / export still
   * send it — so only its `'new-task'` variant is now unused (left in place, not
   * pruned, so the handler/types stay symmetric for the T18/T19 cleanup).
   * @returns Nothing; logs and no-ops if the WindowManager (origin source) is absent.
   * @example
   * this.createNewTask() // opens https://corelive.app/home?create=true
   */
  createNewTask(): void {
    if (!this.windowManager) {
      log.warn('[MenuManager] windowManager unavailable; cannot open New Task')
      return
    }
    openWebAppInBrowser(
      this.windowManager.getWebAppOrigin(),
      '/home?create=true',
    )
  }

  // FOLLOW-UP (T14/T18): Find / Import Tasks / Export Tasks still drive the main
  // renderer over `menu-action`, so they no-op when no main window exists. Their
  // delete-vs-reroute is unresolved — there's no companion URL for "focus the
  // search box" and the design names no browser target for menu-driven task
  // import/export (unlike T14's Floating Import → dashboard). Kept main-optional
  // for Phase 1 (main still exists for QA); revisit when main is retired.
  focusSearch(): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      typedSend(this.mainWindow.webContents, 'menu-action', {
        action: 'focus-search',
      })
    }
  }

  toggleFloatingNavigator(): void {
    log.debug('[MenuManager] toggleFloatingNavigator() called')
    log.debug('[MenuManager] windowManager exists:', !!this.windowManager)

    if (this.windowManager) {
      log.debug('[MenuManager] Calling windowManager.toggleFloatingNavigator()')
      this.windowManager.toggleFloatingNavigator()
    } else {
      console.error('[MenuManager] windowManager is not available!')
    }
  }

  /** Toggle the BrainDump Note window via WindowManager. */
  toggleBrainDump(): void {
    log.debug('[MenuManager] toggleBrainDump() called')

    if (this.windowManager) {
      this.windowManager.toggleBrainDump()
    } else {
      console.error('[MenuManager] windowManager is not available!')
    }
  }

  sendFloatingNavigatorAction(action: string): void {
    if (!this.windowManager) {
      log.warn('[MenuManager] windowManager not available')
      return
    }

    if (!this.windowManager.hasFloatingNavigator()) {
      log.warn('[MenuManager] Floating navigator window not available')
      return
    }

    try {
      const floatingWindow = this.windowManager.getFloatingNavigator()
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        typedSend(
          floatingWindow.webContents,
          'floating-navigator-menu-action',
          action,
        )
        log.debug('[MenuManager] Sent action to floating navigator:', action)
      }
    } catch (error) {
      log.error(
        '[MenuManager] Failed to send action to floating navigator:',
        error,
      )
    }
  }

  openPreferences(): void {
    log.debug('📋 [MenuManager] openPreferences() called')

    // Open the dedicated Settings window
    if (this.windowManager) {
      log.debug('📋 [MenuManager] Opening Settings window via windowManager')
      this.windowManager.openSettings()
    } else {
      log.warn(
        '📋 [MenuManager] windowManager not available, falling back to IPC',
      )
      // Fallback: send IPC message if windowManager is not available
      if (this.mainWindow && this.mainWindow.webContents) {
        typedSend(this.mainWindow.webContents, 'menu-action', {
          action: 'open-preferences',
        })
      }
    }
  }

  async checkForUpdates(): Promise<void> {
    try {
      if (this.mainWindow && this.mainWindow.webContents) {
        typedSend(
          this.mainWindow.webContents,
          'updater-message',
          'Checking for updates...',
        )
      }

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

  async importTasks(): Promise<void> {
    if (!this.mainWindow) return

    try {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: 'Import Tasks',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })

      if (!result.canceled && result.filePaths.length > 0) {
        typedSend(this.mainWindow.webContents, 'menu-action', {
          action: 'import-tasks',
          filePath: result.filePaths[0],
        })
      }
    } catch (error) {
      log.error('Failed to show import dialog:', error)
    }
  }

  async exportTasks(): Promise<void> {
    if (!this.mainWindow) return

    try {
      const result = await dialog.showSaveDialog(this.mainWindow, {
        title: 'Export Tasks',
        defaultPath: `tasks-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (!result.canceled && result.filePath) {
        typedSend(this.mainWindow.webContents, 'menu-action', {
          action: 'export-tasks',
          filePath: result.filePath,
        })
      }
    } catch (error) {
      log.error('Failed to show export dialog:', error)
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
      'Ctrl/Cmd + Shift + A: Toggle Always on Top',
      'Ctrl/Cmd + Shift + N: Focus Floating Navigator',
      'Ctrl/Cmd + 3: Toggle Floating Navigator',
      'Alt/Option + Space: Toggle BrainDump',
      'Ctrl/Cmd + Q: Quit Application',
      'Ctrl/Cmd + ,: Preferences',
      'Ctrl/Cmd + R: Reload',
      'Ctrl/Cmd + Shift + R: Force Reload',
      'Ctrl/Cmd + 0: Reset Zoom',
      'Ctrl/Cmd + Plus: Zoom In',
      'Ctrl/Cmd + Minus: Zoom Out',
      'Ctrl/Cmd + W: Close Window',
      'F11 (Ctrl+Cmd+F on Mac): Toggle Fullscreen',
      '',
      '* Shortcut defaults can be changed from Preferences > Keyboard Shortcuts',
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

  handleMenuAction(action: MenuAction): void {
    switch (action.action) {
      case 'new-task':
        this.createNewTask()
        break
      case 'focus-search':
        this.focusSearch()
        break
      case 'open-preferences':
        this.openPreferences()
        break
      case 'import-tasks':
        this.importTasks()
        break
      case 'export-tasks':
        this.exportTasks()
        break
      default:
        log.warn('Unknown menu action:', action.action)
    }
  }

  updateMenuState(_state: MenuState = {}): void {
    // Can be used to enable/disable menu items based on app state
  }

  destroy(): void {
    this.mainWindow = null
    this.windowManager = null
    this._configManager = null
  }
}

export default MenuManager

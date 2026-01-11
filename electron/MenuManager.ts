/**
 * @fileoverview Application Menu Manager for Electron
 *
 * Manages the native application menu bar that appears at the top of the screen
 * (macOS) or window (Windows/Linux).
 *
 * @module electron/MenuManager
 */

import { app, dialog, Menu, shell } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { autoUpdater } from 'electron-updater'

import type { ConfigManager } from './ConfigManager'
import { log } from './logger'
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

  /** Config manager reference */
  private configManager: ConfigManager | null

  /** Platform is macOS */
  private isMac: boolean

  constructor() {
    this.mainWindow = null
    this.windowManager = null
    this.configManager = null
    this.isMac = process.platform === 'darwin'
  }

  /**
   * Initializes the menu manager with required dependencies.
   *
   * @param mainWindow - The main application window
   * @param windowManager - For window-related menu actions
   * @param configManager - For preference-related actions
   */
  initialize(
    mainWindow: BrowserWindow,
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
    this.configManager = configManager

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
    const submenu: MenuItemConstructorOptions[] = [
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.reload()
          }
        },
      },
      {
        label: 'Force Reload',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.webContents.reloadIgnoringCache()
          }
        },
      },
      {
        label: 'Toggle Developer Tools',
        accelerator: this.isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.webContents.toggleDevTools()
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Actual Size',
        accelerator: 'CmdOrCtrl+0',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.webContents.zoomLevel = 0
          }
        },
      },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        click: () => {
          if (this.mainWindow) {
            const currentZoom = this.mainWindow.webContents.zoomLevel
            this.mainWindow.webContents.zoomLevel = Math.min(
              currentZoom + 0.5,
              3,
            )
          }
        },
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: () => {
          if (this.mainWindow) {
            const currentZoom = this.mainWindow.webContents.zoomLevel
            this.mainWindow.webContents.zoomLevel = Math.max(
              currentZoom - 0.5,
              -3,
            )
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Floating Navigator',
        submenu: [
          {
            label: 'Toggle Floating Navigator',
            click: () => this.toggleFloatingNavigator(),
          },
          {
            label: 'Search Tasks',
            click: () => this.handleSearchAction(),
          },
          { type: 'separator' },
          {
            label: 'Focus New Task Input',
            click: () => this.sendFloatingNavigatorAction('focus-new-task'),
          },
          { type: 'separator' },
          {
            label: 'Navigate to Next Task',
            accelerator: 'Down',
            click: () => this.sendFloatingNavigatorAction('navigate-next-task'),
          },
          {
            label: 'Navigate to Previous Task',
            accelerator: 'Up',
            click: () =>
              this.sendFloatingNavigatorAction('navigate-previous-task'),
          },
          { type: 'separator' },
          {
            label: 'Toggle Task Completion',
            accelerator: 'Space',
            click: () =>
              this.sendFloatingNavigatorAction('toggle-task-completion'),
          },
          {
            label: 'Edit Task',
            accelerator: 'Enter',
            click: () => this.sendFloatingNavigatorAction('edit-task'),
          },
          {
            label: 'Delete Task',
            accelerator: 'Delete',
            click: () => this.sendFloatingNavigatorAction('delete-task'),
          },
          { type: 'separator' },
          {
            label: 'Return to Input',
            accelerator: 'Escape',
            click: () => this.sendFloatingNavigatorAction('return-to-input'),
          },
          {
            label: 'Show Help',
            accelerator: 'CmdOrCtrl+/',
            click: () => this.sendFloatingNavigatorAction('show-help'),
          },
        ],
      },
      {
        label: 'Toggle Fullscreen',
        accelerator: this.isMac ? 'Ctrl+Command+F' : 'F11',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen())
          }
        },
      },
    ]

    return {
      label: 'View',
      submenu,
    }
  }

  /**
   * Creates the Window menu for window management.
   */
  createWindowMenu(): MenuItemConstructorOptions {
    const submenu: MenuItemConstructorOptions[] = [
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.minimize()
          }
        },
      },
      {
        label: 'Close',
        accelerator: 'CmdOrCtrl+W',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.close()
          }
        },
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

  createNewTask(): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('menu-action', { action: 'new-task' })
    }
  }

  focusSearch(): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('menu-action', {
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

  handleSearchAction(): void {
    log.debug('[MenuManager] handleSearchAction() called')

    try {
      if (this.windowManager) {
        this.windowManager.restoreFromTray()

        if (this.windowManager.hasMainWindow()) {
          const mainWindow = this.windowManager.getMainWindow()
          mainWindow?.webContents.send('shortcut-search')
        }
      }
    } catch (error) {
      log.error('[MenuManager] Error handling search action:', error)
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
        floatingWindow.webContents.send(
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
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('menu-action', {
        action: 'open-preferences',
      })
    }
  }

  async checkForUpdates(): Promise<void> {
    try {
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send(
          'updater-message',
          'Checking for updates...',
        )
      }

      await autoUpdater.checkForUpdatesAndNotify()
    } catch (error) {
      log.error('Failed to check for updates:', error)

      if (this.mainWindow) {
        const errorMessage =
          error instanceof Error ? error.message : 'Please try again later.'
        dialog.showMessageBox(this.mainWindow, {
          type: 'error',
          title: 'Update Check Failed',
          message: 'Failed to check for updates.',
          detail: errorMessage,
          buttons: ['OK'],
        })
      }
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
        this.mainWindow.webContents.send('menu-action', {
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
        this.mainWindow.webContents.send('menu-action', {
          action: 'export-tasks',
          filePath: result.filePath,
        })
      }
    } catch (error) {
      log.error('Failed to show export dialog:', error)
    }
  }

  showAboutDialog(): void {
    if (!this.mainWindow) return

    const version = app.getVersion()
    const electronVersion = process.versions.electron
    const nodeVersion = process.versions.node

    dialog.showMessageBox(this.mainWindow, {
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
    if (!this.mainWindow) return

    const shortcuts = [
      'Ctrl/Cmd + N: New Task',
      'Ctrl/Cmd + M: Minimize Window',
      'Ctrl/Cmd + Shift + A: Toggle Always on Top',
      'Ctrl/Cmd + Shift + T: Show Main Window',
      'Ctrl/Cmd + Shift + N: Focus Floating Navigator',
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
      '* Search Tasks and Toggle Floating Navigator are available in View > Floating Navigator menu',
    ]

    dialog.showMessageBox(this.mainWindow, {
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
    this.configManager = null
  }
}

export default MenuManager

const { Menu, shell, dialog, app } = require('electron')

const { log } = require('../src/lib/logger.cjs')

class MenuManager {
  constructor() {
    this.mainWindow = null
    this.windowManager = null
    this.configManager = null
    this.isMac = process.platform === 'darwin'
  }

  /**
   * Initialize menu manager with required dependencies
   */
  initialize(mainWindow, windowManager, configManager) {
    log.debug('📋 [MenuManager] initialize() called with:', {
      hasMainWindow: !!mainWindow,
      hasWindowManager: !!windowManager,
      hasConfigManager: !!configManager,
    })

    this.mainWindow = mainWindow
    this.windowManager = windowManager
    this.configManager = configManager

    log.info('📋 [MenuManager] Creating application menu...')
    try {
      this.createApplicationMenu()
      log.info('✅ [MenuManager] Application menu created successfully')
    } catch (error) {
      console.error(
        '❌ [MenuManager] Failed to create application menu:',
        error,
      )
      throw error
    }
  }

  /**
   * Create and set the application menu
   */
  createApplicationMenu() {
    log.debug('📋 [MenuManager] Building menu template...')
    const template = this.buildMenuTemplate()
    log.debug(
      '📋 [MenuManager] Menu template built, creating menu from template...',
    )
    const menu = Menu.buildFromTemplate(template)
    log.debug('📋 [MenuManager] Setting application menu...')
    Menu.setApplicationMenu(menu)
    log.info('✅ [MenuManager] Application menu set successfully')
  }

  /**
   * Build the complete menu template based on platform
   */
  buildMenuTemplate() {
    const template = []

    // macOS app menu (first menu)
    if (this.isMac) {
      template.push(this.createAppMenu())
    }

    // File menu
    template.push(this.createFileMenu())

    // Edit menu
    template.push(this.createEditMenu())

    // View menu
    template.push(this.createViewMenu())

    // Window menu
    template.push(this.createWindowMenu())

    // Help menu
    template.push(this.createHelpMenu())

    return template
  }

  /**
   * Create macOS-specific app menu
   */
  createAppMenu() {
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
          // accelerator: 'CmdOrCtrl+,',  // Disabled: conflicts with Cursor Editor
          click: () => this.openPreferences(),
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
          role: 'hideothers',
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
   * Create File menu
   */
  createFileMenu() {
    const submenu = [
      {
        label: 'New Task',
        // accelerator: 'CmdOrCtrl+N',  // Disabled: conflicts with Cursor Editor
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

    // Add Quit for non-macOS platforms
    if (!this.isMac) {
      submenu.push(
        { type: 'separator' },
        {
          label: 'Preferences...',
          // accelerator: 'CmdOrCtrl+,',  // Disabled: conflicts with Cursor Editor
          click: () => this.openPreferences(),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      )
    }

    return {
      label: 'File',
      submenu,
    }
  }

  /**
   * Create Edit menu
   */
  createEditMenu() {
    return {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo',
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo',
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut',
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy',
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste',
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectall',
        },
        { type: 'separator' },
        {
          label: 'Find',
          // accelerator: 'CmdOrCtrl+F',  // Disabled: conflicts with Cursor Editor
          click: () => this.focusSearch(),
        },
      ],
    }
  }

  /**
   * Create View menu
   */
  createViewMenu() {
    const submenu = [
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
            // accelerator: 'CmdOrCtrl+N',
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
   * Create Window menu
   */
  createWindowMenu() {
    const submenu = [
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

    // macOS-specific window menu items
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
   * Create Help menu
   */
  createHelpMenu() {
    const submenu = [
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

    // Add About for non-macOS platforms
    if (!this.isMac) {
      submenu.push(
        { type: 'separator' },
        {
          label: `About ${app.getName()}`,
          click: () => this.showAboutDialog(),
        },
      )
    }

    return {
      label: 'Help',
      submenu,
    }
  }

  /**
   * Menu action handlers
   */

  createNewTask() {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('menu-action', {
        action: 'new-task',
      })
    }
  }

  focusSearch() {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('menu-action', {
        action: 'focus-search',
      })
    }
  }

  toggleFloatingNavigator() {
    log.debug('📋 [MenuManager] toggleFloatingNavigator() called')
    log.debug('📋 [MenuManager] windowManager exists:', !!this.windowManager)

    if (this.windowManager) {
      log.debug(
        '📋 [MenuManager] Calling windowManager.toggleFloatingNavigator()',
      )
      this.windowManager.toggleFloatingNavigator()
    } else {
      console.error('❌ [MenuManager] windowManager is not available!')
    }
  }

  /**
   * Handle search action from menu
   */
  handleSearchAction() {
    log.debug('📋 [MenuManager] handleSearchAction() called')

    try {
      // Focus main window and trigger search
      if (this.windowManager) {
        this.windowManager.restoreFromTray()

        if (this.windowManager.hasMainWindow()) {
          const mainWindow = this.windowManager.getMainWindow()
          mainWindow.webContents.send('shortcut-search')
        }
      }
    } catch (error) {
      log.error('❌ [MenuManager] Error handling search action:', error)
    }
  }

  /**
   * Send action to floating navigator window via IPC
   */
  sendFloatingNavigatorAction(action) {
    if (!this.windowManager) {
      log.warn('📋 [MenuManager] windowManager not available')
      return
    }

    if (!this.windowManager.hasFloatingNavigator()) {
      log.warn('📋 [MenuManager] Floating navigator window not available')
      return
    }

    try {
      const floatingWindow = this.windowManager.getFloatingNavigator()
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send(
          'floating-navigator-menu-action',
          action,
        )
        log.debug('📋 [MenuManager] Sent action to floating navigator:', action)
      }
    } catch (error) {
      log.error(
        '📋 [MenuManager] Failed to send action to floating navigator:',
        error,
      )
    }
  }

  openPreferences() {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('menu-action', {
        action: 'open-preferences',
      })
    }
  }

  async importTasks() {
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

  async exportTasks() {
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

  showAboutDialog() {
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

  showKeyboardShortcuts() {
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

  /**
   * Handle menu actions from IPC
   */
  handleMenuAction(action) {
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

  /**
   * Update menu state based on application state
   */
  updateMenuState(_state = {}) {
    // This can be used to enable/disable menu items based on app state
    // For example, disable "Export Tasks" if no tasks exist
    // Implementation can be added as needed
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.mainWindow = null
    this.windowManager = null
    this.configManager = null
  }
}

module.exports = MenuManager

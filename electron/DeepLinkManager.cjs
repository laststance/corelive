const { URL } = require('url')

const { app } = require('electron')

/**
 * Deep Link Manager for handling custom URL scheme (corelive://)
 * Supports opening specific tasks, views, and creating tasks from external applications
 */
class DeepLinkManager {
  constructor(windowManager, apiBridge, notificationManager) {
    this.windowManager = windowManager
    this.apiBridge = apiBridge
    this.notificationManager = notificationManager
    this.protocol = 'corelive'
    this.isInitialized = false
    this.pendingUrl = null

    // Bind methods
    this.handleDeepLink = this.handleDeepLink.bind(this)
    this.handleSecondInstance = this.handleSecondInstance.bind(this)
  }

  /**
   * Initialize deep linking support
   */
  initialize() {
    if (this.isInitialized) {
      return
    }

    try {
      // Register the custom protocol
      this.registerProtocol()

      // Handle second instance (when app is already running)
      this.setupSecondInstanceHandler()

      // Handle initial URL if app was launched with one
      this.handleInitialUrl()

      this.isInitialized = true
      console.log(
        `✅ Deep linking initialized for protocol: ${this.protocol}://`,
      )
    } catch (error) {
      console.error('❌ Failed to initialize deep linking:', error)
    }
  }

  /**
   * Register the custom URL protocol
   */
  registerProtocol() {
    // Set as default protocol client
    if (!app.isDefaultProtocolClient(this.protocol)) {
      const success = app.setAsDefaultProtocolClient(this.protocol)
      if (!success) {
        console.warn('⚠️ Failed to register as default protocol client')
      }
    }

    // Handle protocol URLs on macOS
    app.on('open-url', (event, url) => {
      event.preventDefault()
      this.handleDeepLink(url)
    })
  }

  /**
   * Setup handler for second instance (Windows/Linux)
   */
  setupSecondInstanceHandler() {
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
      this.handleSecondInstance(commandLine, _workingDirectory)
    })
  }

  /**
   * Handle initial URL when app is launched
   */
  handleInitialUrl() {
    // On Windows/Linux, check command line arguments
    if (process.platform !== 'darwin') {
      const args = process.argv
      const urlArg = args.find((arg) => arg.startsWith(`${this.protocol}://`))
      if (urlArg) {
        // Store for later processing after window is ready
        this.pendingUrl = urlArg
      }
    }
  }

  /**
   * Handle second instance launch (focus existing window and process URL)
   */
  handleSecondInstance(commandLine, _workingDirectory) {
    // Focus the existing window
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    } else {
      // Restore from tray if minimized
      if (this.windowManager) {
        this.windowManager.restoreFromTray()
      }
    }

    // Process URL from command line
    const urlArg = commandLine.find((arg) =>
      arg.startsWith(`${this.protocol}://`),
    )
    if (urlArg) {
      this.handleDeepLink(urlArg)
    }
  }

  /**
   * Process pending URL after window is ready
   */
  processPendingUrl() {
    if (this.pendingUrl) {
      this.handleDeepLink(this.pendingUrl)
      this.pendingUrl = null
    }
  }

  /**
   * Handle deep link URL
   * @param {string} url - The deep link URL to process
   */
  async handleDeepLink(url) {
    try {
      console.log(`🔗 Processing deep link: ${url}`)

      // Parse the URL
      const parsedUrl = this.parseDeepLinkUrl(url)
      if (!parsedUrl) {
        console.warn('⚠️ Invalid deep link URL format')
        return
      }

      // Ensure main window is visible
      this.ensureWindowVisible()

      // Route to appropriate handler
      await this.routeDeepLink(parsedUrl)
    } catch (error) {
      console.error('❌ Failed to handle deep link:', error)

      // Show error notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Deep Link Error',
          'Failed to process the link. Please try again.',
          { type: 'error' },
        )
      }
    }
  }

  /**
   * Parse deep link URL into components
   * @param {string} url - The URL to parse
   * @returns {Object|null} Parsed URL components or null if invalid
   */
  parseDeepLinkUrl(url) {
    try {
      const parsedUrl = new URL(url)

      if (parsedUrl.protocol !== `${this.protocol}:`) {
        return null
      }

      const action = parsedUrl.hostname
      const path = parsedUrl.pathname
      const params = Object.fromEntries(parsedUrl.searchParams)

      return {
        action,
        path,
        params,
        hash: parsedUrl.hash,
      }
    } catch (error) {
      console.error('Failed to parse deep link URL:', error)
      return null
    }
  }

  /**
   * Route deep link to appropriate handler
   * @param {Object} parsedUrl - Parsed URL components
   */
  async routeDeepLink(parsedUrl) {
    const { action, path, params } = parsedUrl

    switch (action) {
      case 'task':
        await this.handleTaskAction(path, params)
        break

      case 'create':
        await this.handleCreateAction(params)
        break

      case 'view':
        await this.handleViewAction(path, params)
        break

      case 'search':
        await this.handleSearchAction(params)
        break

      default:
        console.warn(`⚠️ Unknown deep link action: ${action}`)
        // Default to opening main window
        this.ensureWindowVisible()
    }
  }

  /**
   * Handle task-related actions
   * @param {string} path - URL path
   * @param {Object} params - URL parameters
   */
  async handleTaskAction(path, params) {
    const taskId = path.replace('/', '') || params.id

    if (!taskId) {
      console.warn('⚠️ Task action requires task ID')
      return
    }

    try {
      // Get task details
      const task = await this.apiBridge.getTodoById(taskId)

      if (!task) {
        console.warn(`⚠️ Task not found: ${taskId}`)
        if (this.notificationManager) {
          this.notificationManager.showNotification(
            'Task Not Found',
            `Could not find task with ID: ${taskId}`,
            { type: 'warning' },
          )
        }
        return
      }

      // Send task focus event to renderer
      this.sendToRenderer('deep-link-focus-task', { task, params })

      // Show notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Task Opened',
          `Opened task: ${task.title}`,
          { type: 'info' },
        )
      }
    } catch (error) {
      console.error('Failed to handle task action:', error)
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Error',
          'Failed to open task. Please try again.',
          { type: 'error' },
        )
      }
    }
  }

  /**
   * Handle create task action
   * @param {Object} params - URL parameters
   */
  async handleCreateAction(params) {
    const { title, description, priority, dueDate } = params

    if (!title) {
      console.warn('⚠️ Create action requires title parameter')
      // Open create dialog without pre-filled data
      this.sendToRenderer('deep-link-create-task', {})
      return
    }

    try {
      // Create the task
      const taskData = {
        title: decodeURIComponent(title),
        ...(description && { description: decodeURIComponent(description) }),
        ...(priority && { priority }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
      }

      const newTask = await this.apiBridge.createTodo(taskData)

      // Send success event to renderer
      this.sendToRenderer('deep-link-task-created', { task: newTask })

      // Show notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Task Created',
          `Created task: ${newTask.title}`,
          { type: 'success' },
        )
      }
    } catch (error) {
      console.error('Failed to create task from deep link:', error)

      // Fallback: open create dialog with pre-filled data
      this.sendToRenderer('deep-link-create-task', {
        title: title ? decodeURIComponent(title) : '',
        description: description ? decodeURIComponent(description) : '',
        priority,
        dueDate,
      })

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Create Task',
          'Opening task creation dialog...',
          { type: 'info' },
        )
      }
    }
  }

  /**
   * Handle view action
   * @param {string} path - URL path
   * @param {Object} params - URL parameters
   */
  async handleViewAction(path, params) {
    const view = path.replace('/', '') || params.view || 'home'

    // Send view change event to renderer
    this.sendToRenderer('deep-link-navigate', { view, params })

    // Show notification
    if (this.notificationManager) {
      this.notificationManager.showNotification(
        'View Opened',
        `Navigated to: ${view}`,
        { type: 'info' },
      )
    }
  }

  /**
   * Handle search action
   * @param {Object} params - URL parameters
   */
  async handleSearchAction(params) {
    const { query, filter } = params

    // Send search event to renderer
    this.sendToRenderer('deep-link-search', {
      query: query ? decodeURIComponent(query) : '',
      filter,
    })

    // Show notification
    if (this.notificationManager && query) {
      this.notificationManager.showNotification(
        'Search',
        `Searching for: ${decodeURIComponent(query)}`,
        { type: 'info' },
      )
    }
  }

  /**
   * Ensure main window is visible and focused
   */
  ensureWindowVisible() {
    if (!this.windowManager) {
      return
    }

    if (this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()

      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }

      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }

      mainWindow.focus()
    } else {
      // Restore from tray
      this.windowManager.restoreFromTray()
    }
  }

  /**
   * Send event to renderer process
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  sendToRenderer(event, data) {
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow.webContents.send(event, data)
    }
  }

  /**
   * Generate deep link URL
   * @param {string} action - Action type
   * @param {Object} params - Parameters
   * @returns {string} Deep link URL
   */
  generateDeepLink(action, params = {}) {
    const url = new URL(`${this.protocol}://${action}`)

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value)
      }
    })

    return url.toString()
  }

  /**
   * Get example deep link URLs
   * @returns {Object} Example URLs
   */
  getExampleUrls() {
    return {
      openTask: this.generateDeepLink('task/123'),
      createTask: this.generateDeepLink('create', {
        title: 'New Task',
        description: 'Task description',
      }),
      searchTasks: this.generateDeepLink('search', {
        query: 'important',
        filter: 'pending',
      }),
      openView: this.generateDeepLink('view/completed'),
    }
  }

  /**
   * Cleanup deep linking
   */
  cleanup() {
    if (this.isInitialized) {
      // Remove protocol client registration
      app.removeAsDefaultProtocolClient(this.protocol)
      this.isInitialized = false
      console.log('🧹 Deep linking cleaned up')
    }
  }
}

module.exports = DeepLinkManager

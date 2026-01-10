/**
 * @fileoverview Deep Link Manager for Custom URL Protocol Handling
 *
 * Enables the app to respond to custom URLs like:
 * - corelive://open/task/123
 * - corelive://create?text=Buy%20milk
 * - corelive://settings
 *
 * What are deep links?
 * Deep links are custom URL schemes that open specific parts of your app.
 * Like how 'mailto:' opens your email client, 'corelive://' opens this app.
 *
 * Why deep links matter for desktop apps:
 * - Integration with other apps (e.g., click link in email to open task)
 * - Automation workflows (scripts can trigger app actions)
 * - Quick access from browser bookmarks
 * - Command-line integration
 * - OS search integration (Spotlight, Windows Search)
 *
 * Platform differences:
 * - macOS: Uses 'open-url' event
 * - Windows/Linux: Uses command line arguments
 * - All platforms: Must handle app already running vs launching
 *
 * Security considerations:
 * - Validate all URL parameters (prevent injection)
 * - Don't execute arbitrary commands
 * - Sanitize user input from URLs
 * - Consider authentication for sensitive actions
 *
 * @module electron/DeepLinkManager
 */

const { URL } = require('url')

const { log } = require('./logger.cjs')

/**
 * Manages custom URL protocol handling for the application.
 *
 * Supports various deep link patterns:
 * - Opening specific items: corelive://open/task/123
 * - Creating new items: corelive://create?text=New%20Task
 * - Navigation: corelive://settings, corelive://home
 * - Actions: corelive://complete/task/456
 *
 * The manager handles:
 * - Protocol registration with the OS
 * - URL parsing and validation
 * - Routing to appropriate actions
 * - Cross-platform compatibility
 * - App focus and window management
 */
class DeepLinkManager {
  constructor(
    windowManager,
    apiBridge,
    notificationManager,
    electronApp = null,
  ) {
    this.windowManager = windowManager
    this.apiBridge = apiBridge
    this.notificationManager = notificationManager
    // Allow app injection for testing
    this.app = electronApp || require('electron').app
    this.protocol = 'corelive' // Custom URL scheme
    this.isInitialized = false
    this.pendingUrl = null // URL received before app ready

    // OAuth Manager for browser-based OAuth flows
    // Set via setOAuthManager() after construction
    this.oauthManager = null

    // Bind methods for event handlers
    this.handleDeepLink = this.handleDeepLink.bind(this)
    this.handleSecondInstance = this.handleSecondInstance.bind(this)
  }

  /**
   * Sets the OAuth manager for handling OAuth callbacks.
   *
   * @param {OAuthManager} oauthManager - OAuth manager instance
   */
  setOAuthManager(oauthManager) {
    this.oauthManager = oauthManager
  }

  /**
   * Initializes deep linking support for the application.
   *
   * Setup process:
   * 1. Register custom protocol with OS
   * 2. Set up handlers for URL events
   * 3. Check for launch URL (app opened via deep link)
   *
   * Must be called after app is ready but before windows are shown
   * to handle launch URLs properly.
   *
   * Why initialization order matters:
   * - Protocol must be registered before receiving URLs
   * - Second instance handler must be ready immediately
   * - Launch URLs need special handling (app not fully ready)
   */
  initialize() {
    if (this.isInitialized) {
      return // Prevent double initialization
    }

    try {
      // Register corelive:// protocol with the operating system
      this.registerProtocol()

      // Handle when user clicks link while app is already running
      this.setupSecondInstanceHandler()

      // Check if app was launched by clicking a deep link
      this.handleInitialUrl()

      this.isInitialized = true
      log.info('✅ Deep linking initialized')
    } catch (error) {
      // Non-fatal: app works without deep links
      log.error('❌ Failed to initialize deep linking:', error)
    }
  }

  /**
   * Registers the custom URL protocol with the operating system.
   *
   * After registration, clicking 'corelive://' URLs will:
   * - Launch the app if not running
   * - Focus the app if already running
   * - Pass the URL to the app for handling
   *
   * Platform specifics:
   * - Windows: Adds registry entries
   * - macOS: Updates Info.plist, handles via 'open-url' event
   * - Linux: Creates .desktop file entries
   *
   * Note: May require app restart or OS cache clear to take effect
   */
  registerProtocol() {
    // Register as handler for corelive:// URLs
    if (!this.app.isDefaultProtocolClient(this.protocol)) {
      const success = this.app.setAsDefaultProtocolClient(this.protocol)
      if (!success) {
        // May fail in dev environment or without proper permissions
        log.warn('⚠️ Failed to register as default protocol client')
      }
    }

    // macOS-specific: Handle URLs via event (not command line)
    this.app.on('open-url', (event, url) => {
      event.preventDefault() // Prevent default handling
      this.handleDeepLink(url)
    })
  }

  /**
   * Setup handler for second instance (Windows/Linux)
   */
  setupSecondInstanceHandler() {
    this.app.on('second-instance', (_event, commandLine, _workingDirectory) => {
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
      // Parse the URL
      const parsedUrl = this.parseDeepLinkUrl(url)
      if (!parsedUrl) {
        log.warn('⚠️ Invalid deep link URL format')
        return false
      }

      // Ensure main window is visible
      this.ensureWindowVisible()

      // Route to appropriate handler
      const handled = await this.routeDeepLink(parsedUrl)
      return handled
    } catch (error) {
      log.error('❌ Failed to handle deep link:', error)

      // Show error notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Deep Link Error',
          'Failed to process the link. Please try again.',
          { type: 'error' },
        )
      }
      return false
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
        originalUrl: url, // Preserve original URL for handlers that need it
      }
    } catch (error) {
      log.error('Failed to parse deep link URL:', error)
      return null
    }
  }

  /**
   * Route deep link to appropriate handler
   * @param {Object} parsedUrl - Parsed URL components
   */
  async routeDeepLink(parsedUrl) {
    const { action, path, params, originalUrl } = parsedUrl

    switch (action) {
      case 'oauth':
        await this.handleOAuthCallback(path, params, originalUrl)
        return true

      case 'task':
        await this.handleTaskAction(path, params)
        return true

      case 'create':
        await this.handleCreateAction(params)
        return true

      case 'view':
        await this.handleViewAction(path, params)
        return true

      case 'search':
        await this.handleSearchAction(params)
        return true

      default:
        log.warn(`⚠️ Unknown deep link action: ${action}`)
        // Default to opening main window
        this.ensureWindowVisible()
        return false
    }

    return true
  }

  /**
   * Handle OAuth callback deep link.
   *
   * Receives: corelive://oauth/callback?code=...&state=...
   *
   * @param {string} path - URL path (e.g., '/callback')
   * @param {Object} params - URL parameters (code, state, error)
   * @param {string} originalUrl - Original deep link URL
   */
  async handleOAuthCallback(path, params, originalUrl) {
    log.info('🔐 Received OAuth callback deep link', {
      path,
      hasCode: !!params.code,
      hasState: !!params.state,
    })

    // Ensure main window is visible for auth completion
    this.ensureWindowVisible()

    if (!this.oauthManager) {
      log.error('❌ OAuth manager not initialized')
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In Error',
          'OAuth handler not ready. Please try again.',
          { type: 'error' },
        )
      }
      return
    }

    // Only handle /callback path
    if (path !== '/callback' && path !== 'callback') {
      log.warn(`⚠️ Unknown OAuth path: ${path}`)
      return
    }

    try {
      // Parse the original URL to pass to OAuthManager
      const url = new URL(originalUrl)
      await this.oauthManager.handleOAuthCallback(url)
    } catch (error) {
      log.error('❌ Failed to handle OAuth callback:', error)
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In Error',
          'Failed to complete sign-in. Please try again.',
          { type: 'error' },
        )
      }
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
      log.warn('⚠️ Task action requires task ID')
      return
    }

    try {
      // Get task details
      const task = await this.apiBridge.getTodoById(taskId)

      if (!task) {
        log.warn(`⚠️ Task not found: ${taskId}`)
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
      log.error('Failed to handle task action:', error)
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
      log.warn('⚠️ Create action requires title parameter')
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
      log.error('Failed to create task from deep link:', error)

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
      this.app.removeAsDefaultProtocolClient(this.protocol)
      this.isInitialized = false
    }
  }
}

module.exports = DeepLinkManager

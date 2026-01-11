/**
 * @fileoverview Electron Main Process Entry Point
 *
 * This is the main process file for the Electron application. In Electron architecture,
 * the main process is responsible for:
 * - Creating and managing application windows (BrowserWindow instances)
 * - Handling system-level events and native OS integrations
 * - Managing Inter-Process Communication (IPC) between main and renderer processes
 * - Controlling the application lifecycle
 *
 * Why is this separation important?
 * - Security: Main process has full Node.js access, renderers are sandboxed
 * - Performance: Heavy operations run here don't block the UI
 * - Native features: Only main process can access OS-level APIs
 *
 * @module electron/main
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Notification,
} = require('electron')

/**
 * Enable remote debugging for automated testing with Playwright.
 * This allows Playwright to connect to the Electron app via Chrome DevTools Protocol.
 * Only enabled when the environment variable is set to prevent security risks in production.
 */
if (process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch(
    'remote-debugging-port',
    process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT,
  )
}

// Import custom logger for consistent logging across the application

/**
 * Module imports are strategically organized for performance optimization.
 *
 * Critical modules (loaded immediately):
 * These are essential for app startup and must be available right away.
 */

// Manages user preferences and application configuration
const ConfigManager = require('./ConfigManager.cjs')
// Handles IPC errors with retry logic to ensure reliable communication
const IPCErrorHandler = require('./IPCErrorHandler.cjs')
// Defers loading of non-critical modules to speed up initial startup
const { lazyLoadManager } = require('./LazyLoadManager.cjs')
const { log } = require('./logger.cjs')
// Monitors memory usage to prevent leaks and optimize performance
const { memoryProfiler } = require('./MemoryProfiler.cjs')
// Performance configuration based on environment (dev/prod)
const {
  performanceOptimizer,
  OPTIMIZATION_LEVELS,
} = require('./performance-config.cjs')
// Core window management - handles creating, positioning, and lifecycle
const WindowManager = require('./WindowManager.cjs')
// Persists and restores window positions/sizes across app restarts
const WindowStateManager = require('./WindowStateManager.cjs')

/**
 * Environment flags determine behavior differences between development and production.
 * These affect security policies, performance optimizations, and debugging features.
 */
const isDev = process.env.NODE_ENV === 'development'
const isTestEnvironment = process.env.NODE_ENV === 'test'

/**
 * Performance optimization level selection.
 * Development mode prioritizes debugging, production mode prioritizes speed.
 */
const optimizationLevel = isDev ? 'development' : 'production'
const config = OPTIMIZATION_LEVELS[optimizationLevel]

/**
 * Manager instances - organized by initialization strategy
 *
 * Why use global references?
 * - Managers need to be accessible across different app lifecycle events
 * - Proper cleanup requires maintaining references for shutdown sequence
 * - Some managers depend on others, requiring careful initialization order
 */

// Core managers - initialized during app startup
let configManager // User preferences and app settings
let windowStateManager // Window position/size persistence
let windowManager // BrowserWindow lifecycle management
let ipcErrorHandler // Error handling with retry logic
// Note: apiBridge and nextServerManager are no longer needed in WebView architecture

/**
 * Lazy-loaded managers - initialized only when needed.
 * This improves startup time by deferring non-critical features.
 *
 * Why lazy load?
 * - Auto-updater isn't needed immediately on startup
 * - System tray might not be used by all users
 * - Notifications are event-driven, not needed at launch
 */
let autoUpdater // Handles app updates
let systemTrayManager // System tray icon and menu
let notificationManager // OS-level notifications
let shortcutManager // Global keyboard shortcuts
let systemIntegrationErrorHandler // OS integration error handling
let menuManager // Application menu bar
let deepLinkManager // Custom protocol URL handling
let oauthManager // Browser-based OAuth flow management

// Current authenticated user information
let activeUser = null

/**
 * Queue for deep link URLs received before DeepLinkManager is ready.
 * On macOS, 'open-url' events can fire very early, even before app.whenReady().
 * We queue these URLs and process them once the app is fully initialized.
 */
let pendingDeepLinkUrl = null

/**
 * Early 'open-url' handler for macOS.
 *
 * CRITICAL: This must be registered BEFORE app.whenReady() to catch
 * deep links that trigger app launch or arrive when app is starting.
 * If registered inside app.whenReady(), URLs are lost!
 */
app.on('open-url', (event, url) => {
  event.preventDefault()
  log.info('🔗 [Early] Received open-url event:', {
    url: url.slice(0, 50) + '...',
  })

  if (deepLinkManager && deepLinkManager.isInitialized) {
    // DeepLinkManager ready - handle immediately
    deepLinkManager.handleDeepLink(url)
  } else {
    // Queue for later processing
    log.info('🔗 [Early] Queuing deep link for later processing')
    pendingDeepLinkUrl = url
  }
})

/**
 * Process any queued deep link URLs.
 * Called after DeepLinkManager is fully initialized.
 */
function processPendingDeepLinkUrl() {
  if (pendingDeepLinkUrl && deepLinkManager && deepLinkManager.isInitialized) {
    log.info('🔗 Processing queued deep link URL')
    deepLinkManager.handleDeepLink(pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  }
}

/**
 * Ensures the OAuthManager is initialized when needed.
 *
 * OAuth manager handles browser-based OAuth flows required for providers
 * that block WebView authentication (e.g., Google OAuth).
 *
 * @returns {OAuthManager|null} The initialized manager or null if dependencies aren't ready
 */
function ensureOAuthManager() {
  if (!windowManager) {
    return null
  }

  if (!oauthManager) {
    const OAuthManager = require('./OAuthManager.cjs')
    oauthManager = new OAuthManager(windowManager, notificationManager || null)
  }

  return oauthManager
}

/**
 * Ensures the DeepLinkManager is initialized when needed.
 *
 * Deep links allow the app to respond to custom protocol URLs (e.g., corelive://open/task/123).
 * This enables integration with web browsers and other applications.
 *
 * Why lazy load?
 * - Not all app launches are triggered by deep links
 * - Reduces initial memory footprint and startup time
 *
 * @returns {DeepLinkManager|null} The initialized manager or null if dependencies aren't ready
 */
function ensureDeepLinkManager() {
  // Deep link manager requires window manager to function
  if (!windowManager) {
    return null
  }

  // First-time initialization
  if (!deepLinkManager) {
    const DeepLinkManager = require('./DeepLinkManager.cjs')
    deepLinkManager = new DeepLinkManager(
      windowManager,
      null, // apiBridge no longer used in WebView architecture
      notificationManager || null, // Notifications are optional
      app,
    )
  }

  // Connect OAuth manager to handle OAuth deep link callbacks
  const oauth = ensureOAuthManager()
  if (oauth && !deepLinkManager.oauthManager) {
    deepLinkManager.setOAuthManager(oauth)
  }

  // Initialize if not already done (handles protocol registration)
  if (!deepLinkManager.isInitialized) {
    deepLinkManager.initialize()
  }

  return deepLinkManager
}

/**
 * Ensures WindowStateManager is available before use.
 *
 * Window state persistence is critical for user experience - users expect
 * windows to appear where they left them. This helper prevents crashes
 * if state management is accessed before initialization.
 *
 * @returns {WindowStateManager} The initialized window state manager
 * @throws {Error} If manager hasn't been initialized yet
 */
function ensureWindowStateManagerInstance() {
  if (!windowStateManager) {
    throw new Error('Window state manager not initialized')
  }
  return windowStateManager
}

/**
 * Retrieves a BrowserWindow instance by type, creating it if necessary.
 *
 * Electron apps can have multiple windows with different purposes:
 * - Main window: Primary application interface
 * - Floating window: Always-on-top utility window for quick access
 *
 * @param {string} windowType - Type of window to retrieve ('main' or 'floating')
 * @returns {BrowserWindow|null} The requested window or null if unavailable
 */
function getBrowserWindowForType(windowType = 'main') {
  // Can't get windows if manager isn't initialized
  if (!windowManager) {
    return null
  }

  // Handle floating navigator window
  if (windowType === 'floating') {
    // Create floating window on-demand if it doesn't exist
    if (!windowManager.hasFloatingNavigator()) {
      try {
        windowManager.createFloatingNavigator()
      } catch (error) {
        // Non-fatal: floating window is optional feature
        log.warn('Failed to create floating navigator window:', error.message)
      }
    }
    // Safe property access in case getter doesn't exist
    return windowManager.getFloatingNavigator
      ? windowManager.getFloatingNavigator()
      : null
  }

  // Default to main window
  return windowManager.getMainWindow ? windowManager.getMainWindow() : null
}

/**
 * Synchronizes saved window state (position, size, etc.) to actual BrowserWindow.
 *
 * This function is crucial for user experience continuity. When users reposition
 * or resize windows, we save that state and restore it on next app launch.
 *
 * Why is this important?
 * - Users often have specific screen layouts (multi-monitor setups)
 * - Restoring window positions saves users time reconfiguring
 * - Provides a native app feel vs web apps that always start fresh
 *
 * @param {string} windowType - Type of window to sync ('main' or 'floating')
 */
function syncWindowBoundsToBrowserWindow(windowType = 'main') {
  try {
    const stateManager = ensureWindowStateManagerInstance()
    const state = stateManager.getWindowState(windowType)
    const targetWindow = getBrowserWindowForType(windowType)

    // Skip if state is missing or window is destroyed
    if (!state || !targetWindow || targetWindow.isDestroyed?.()) {
      return
    }

    const existingBounds = targetWindow.getBounds()
    const bounds = {
      x:
        typeof state.x === 'number'
          ? state.x
          : typeof existingBounds.x === 'number'
            ? existingBounds.x
            : undefined,
      y:
        typeof state.y === 'number'
          ? state.y
          : typeof existingBounds.y === 'number'
            ? existingBounds.y
            : undefined,
      width:
        typeof state.width === 'number'
          ? state.width
          : typeof existingBounds.width === 'number'
            ? existingBounds.width
            : undefined,
      height:
        typeof state.height === 'number'
          ? state.height
          : typeof existingBounds.height === 'number'
            ? existingBounds.height
            : undefined,
    }

    if (
      typeof bounds.width === 'number' &&
      typeof bounds.height === 'number' &&
      typeof bounds.x === 'number' &&
      typeof bounds.y === 'number'
    ) {
      targetWindow.setBounds(bounds)
    }

    if (windowType === 'floating' && typeof state.isAlwaysOnTop === 'boolean') {
      targetWindow.setAlwaysOnTop(state.isAlwaysOnTop)
    }

    if (windowType === 'main') {
      if (typeof state.isFullScreen === 'boolean') {
        targetWindow.setFullScreen(state.isFullScreen)
      }

      if (typeof state.isMaximized === 'boolean') {
        if (state.isMaximized && !targetWindow.isMaximized()) {
          targetWindow.maximize()
        } else if (!state.isMaximized && targetWindow.isMaximized()) {
          targetWindow.unmaximize()
        }
      }
    }
  } catch (error) {
    log.warn('Failed to synchronize window bounds:', error.message)
  }
}

/**
 * Sets the currently authenticated user.
 *
 * In WebView architecture, authentication is handled by the web app (Clerk).
 * This function simply stores the user info for Electron-side features
 * (e.g., displaying in menu, notifications).
 *
 * @param {Object} userPayload - User data from Clerk authentication
 * @param {string} userPayload.clerkId - Unique Clerk user identifier
 * @returns {Promise<Object>} The active user object
 */
async function setActiveUser(userPayload) {
  // Validate payload to prevent security issues
  if (!userPayload || typeof userPayload !== 'object' || !userPayload.clerkId) {
    throw new Error('Invalid user payload: clerkId is required')
  }

  // Store user info (no database sync needed - handled by web app)
  activeUser = {
    clerkId: userPayload.clerkId,
    emailAddresses: userPayload.emailAddresses || [],
    firstName: userPayload.firstName || null,
  }
  return activeUser
}

/**
 * Content Security Policy (CSP) configuration for enhanced security.
 *
 * CSP is a critical security feature that prevents:
 * - Cross-site scripting (XSS) attacks
 * - Data injection attacks
 * - Unauthorized code execution
 *
 * Why these specific rules?
 * - 'self': Only allow resources from our own origin by default
 * - Clerk domains: Required for authentication UI components
 * - 'unsafe-inline'/'unsafe-eval': Unfortunately needed for some React/Next.js features
 * - localhost: Development server connections
 * - data: URIs: For inline images and fonts
 *
 * Note: In production, consider stricter policies and nonces for inline scripts
 */
const CSP_POLICY = [
  "default-src 'self'",
  // Allow Clerk assets from custom domain (clerk.corelive.app), .dev and .com domains
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "style-src 'self' 'unsafe-inline' https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "img-src 'self' data: https: https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "font-src 'self' data: https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  // Include Clerk custom domain, telemetry and .com endpoints in connect-src
  "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com https://clerk-telemetry.com",
  "frame-src 'self' https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://clerk.corelive.app https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com",
].join('; ')

/**
 * Configures application-wide security policies.
 *
 * Security is paramount in Electron apps because they combine web content
 * with system-level access. This function implements defense-in-depth:
 *
 * 1. Content Security Policy: Restricts resource loading
 * 2. Permission handling: Controls API access (camera, microphone, etc.)
 * 3. Protocol blocking: Prevents malicious protocol handlers
 *
 * Why is this critical?
 * - Electron apps have Node.js access - one XSS could compromise the system
 * - Users trust desktop apps more than websites
 * - Malicious content could access files, run commands, etc.
 */
function setupSecurity() {
  try {
    /**
     * Apply CSP headers to all web requests.
     * This enforces our security policy on every page load.
     */
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP_POLICY],
        },
      })
    })

    /**
     * Permission request handler - controls what APIs web content can access.
     * Default deny approach: explicitly allow only what's needed.
     *
     * Currently allowed:
     * - notifications: For task reminders and updates
     */
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        // Deny all permissions by default for security
        const allowedPermissions = ['notifications'] // Only allow notifications
        callback(allowedPermissions.includes(permission))
      },
    )

    /**
     * Permission check handler - additional layer of permission control.
     * This catches any permission checks that bypass the request handler.
     * Deny everything by default for maximum security.
     */
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, _permission, _requestingOrigin, _details) => {
        return false // Deny all permission checks by default
      },
    )
  } catch (error) {
    log.error('❌ Security setup failed:', error.message)
  }
}

/**
 * Creates the main application window and initializes all core systems.
 *
 * This is the heart of the Electron app startup sequence. It orchestrates:
 * 1. Performance monitoring setup
 * 2. Core manager initialization (in specific order)
 * 3. Window creation and display
 * 4. Deferred feature loading
 *
 * Why async?
 * - Next.js server startup is asynchronous
 * - Database connections need to be established
 * - Allows proper error handling during initialization
 *
 * The function is split into critical (blocking) and deferred (non-blocking)
 * initialization to optimize perceived startup time.
 *
 * @returns {Promise<BrowserWindow>} The main application window
 */
async function createWindow() {
  // Start performance monitoring early to track startup metrics
  if (config.enableMemoryMonitoring) {
    memoryProfiler.startMonitoring()
  }

  /**
   * Critical initialization phase - these must complete before showing window.
   * Order matters here due to dependencies between managers.
   */
  const criticalInit = async () => {
    // Initialize IPC error handler first
    ipcErrorHandler = new IPCErrorHandler({
      maxRetries: 3,
      baseDelay: 1000,
      enableLogging: true,
    })

    // Initialize configuration manager
    configManager = new ConfigManager()

    // Initialize window state manager
    windowStateManager = new WindowStateManager(configManager)

    // Resolve server URL
    // In production: loads https://corelive.app/ (via WindowManager default)
    // In development/test: uses local dev server
    let serverUrl = process.env.ELECTRON_DEV_SERVER_URL

    // In test environment, always use external server if available
    if (isTestEnvironment && !serverUrl) {
      serverUrl = 'http://localhost:3011'
    }

    // In development, use external Next dev server when provided by scripts/dev.js
    // In production, serverUrl stays null and WindowManager loads https://corelive.app/
    if (isDev && !serverUrl) {
      serverUrl = 'http://localhost:3011'
    }

    // Note: APIBridge no longer needed - Floating Navigator uses oRPC via web

    // Initialize window manager with server URL and managers
    windowManager = new WindowManager(
      serverUrl,
      configManager,
      windowStateManager,
    )

    // Create main window immediately for better perceived performance

    const mainWindow = windowManager.createMainWindow()

    performanceOptimizer.startupMetrics.windowsCreated++

    return { mainWindow, serverUrl }
  }

  // Deferred initialization - happens after main window is shown
  const deferredInit = async () => {
    try {
      // Load system integration components lazily
      log.info('🔧 [DEFERRED] Loading SystemIntegrationErrorHandler...')
      const SystemIntegrationErrorHandler = await lazyLoadManager.loadComponent(
        'SystemIntegrationErrorHandler',
      )
      systemIntegrationErrorHandler = new SystemIntegrationErrorHandler(
        windowManager,
        configManager,
      )
      log.info('✅ [DEFERRED] SystemIntegrationErrorHandler loaded')

      log.info('🔧 [DEFERRED] Loading MenuManager...')
      // Load menu manager
      const MenuManager = await lazyLoadManager.loadComponent('MenuManager')
      menuManager = new MenuManager()

      // Get mainWindow from windowManager (mainWindow is local to criticalInit)
      const mainWindowRef = windowManager.getMainWindow()
      log.debug(
        '🔧 [DEFERRED] Retrieved mainWindow from windowManager:',
        !!mainWindowRef,
      )

      menuManager.initialize(mainWindowRef, windowManager, configManager)
      log.info('✅ [DEFERRED] MenuManager loaded')

      log.info('🔧 [DEFERRED] Loading SystemTrayManager...')
      // Load system tray manager
      const SystemTrayManager =
        await lazyLoadManager.loadComponent('SystemTrayManager')
      systemTrayManager = new SystemTrayManager(windowManager)
      log.info('✅ [DEFERRED] SystemTrayManager loaded')

      log.info('🔧 [DEFERRED] Loading NotificationManager...')
      // Load notification manager
      const NotificationManager = await lazyLoadManager.loadComponent(
        'NotificationManager',
      )
      notificationManager = new NotificationManager(
        windowManager,
        systemTrayManager,
        configManager,
      )
      log.info('✅ [DEFERRED] NotificationManager loaded')

      log.info('🔧 [DEFERRED] Loading ShortcutManager...')
      // Load shortcut manager
      const ShortcutManager =
        await lazyLoadManager.loadComponent('ShortcutManager')
      shortcutManager = new ShortcutManager(
        windowManager,
        notificationManager,
        configManager,
      )
      log.info('✅ [DEFERRED] ShortcutManager loaded')

      log.info('🔧 [DEFERRED] Setting managers in error handler...')
      // Set managers in error handler
      systemIntegrationErrorHandler.setManagers(
        systemTrayManager,
        notificationManager,
        shortcutManager,
      )
      log.info('✅ [DEFERRED] Managers set')

      log.info('🔧 [DEFERRED] Initializing system integration...')
      // Initialize system integration with comprehensive error handling
      await systemIntegrationErrorHandler.initializeSystemIntegration()
      log.info('✅ [DEFERRED] System integration initialized')

      // Load auto-updater in background (skip during automated tests)
      // Wrapped in own try-catch so failure doesn't block other initializations
      if (!isTestEnvironment) {
        try {
          const AutoUpdater = await lazyLoadManager.loadComponent('AutoUpdater')
          autoUpdater = new AutoUpdater()
          autoUpdater.setMainWindow(windowManager.getMainWindow())
        } catch (autoUpdaterError) {
          log.error('❌ Failed to initialize AutoUpdater:', autoUpdaterError)
          // Non-critical - continue without auto-updater
        }
      } else {
        log.info('AutoUpdater initialization skipped in test environment')
      }

      // Ensure deep link manager is ready once supporting managers exist
      log.info('🔧 [DEFERRED] Initializing DeepLinkManager...')
      const manager = ensureDeepLinkManager()
      if (manager) {
        log.info('✅ [DEFERRED] DeepLinkManager initialized')
        manager.notificationManager = notificationManager

        // Process any pending deep link URLs after initialization
        // This handles both:
        // 1. URLs from early 'open-url' events (before app ready)
        // 2. URLs from command line args (Windows/Linux)
        setTimeout(() => {
          try {
            manager.processPendingUrl() // Command line URLs
            processPendingDeepLinkUrl() // Early open-url URLs
          } catch (error) {
            log.warn('⚠️ Failed to process pending deep link URL', error)
          }
        }, 1000)
      }

      // Set up window close behavior after tray manager is loaded
      const mainWindow = windowManager.getMainWindow()
      mainWindow.on('close', (event) => {
        if (systemTrayManager) {
          systemTrayManager.handleWindowClose(event)
        }
      })
    } catch (error) {
      log.error('❌ Deferred initialization failed:', error)
      // Continue without non-critical components
    }
  }

  // Use optimized startup

  // const { mainWindow } = await performanceOptimizer.optimizeStartup(
  //   criticalInit,
  //   deferredInit,
  // )
  //

  // Run critical initialization directly
  const criticalResult = await criticalInit()

  // Run deferred initialization
  setImmediate(async () => {
    try {
      log.info('🔄 Starting deferred initialization...')
      await deferredInit()
      log.info('✅ Deferred initialization completed successfully')
    } catch (error) {
      console.error('❌ Main: Deferred initialization failed:', error)
      log.error(
        '❌ Main: Deferred initialization failed:',
        error.message,
        error.stack,
      )
    }
  })

  const { mainWindow } = criticalResult

  // Set up IPC handlers immediately (they handle lazy loading internally)

  setupIPCHandlers()

  return mainWindow
}

/**
 * Sets up all IPC (Inter-Process Communication) handlers.
 *
 * IPC is the bridge between the main process (this file) and renderer processes
 * (web pages). Electron uses IPC because:
 * - Renderer processes are sandboxed for security
 * - Main process has full system access
 * - This separation prevents web content from accessing sensitive APIs
 *
 * Handler types:
 * - handle(): For async request-response (like API calls)
 * - on(): For one-way messages or events
 *
 * All handlers follow these patterns:
 * 1. Input validation (never trust renderer input)
 * 2. Error handling (graceful degradation)
 * 3. Proper cleanup (prevent memory leaks)
 */
function setupIPCHandlers() {
  /**
   * Basic app control handlers.
   * These provide controlled access to app-level functions.
   */

  // Returns current app version for display in UI
  ipcMain.handle('app-version', () => {
    return app.getVersion()
  })

  // Allows renderer to trigger app shutdown
  ipcMain.handle('app-quit', () => {
    app.quit()
  })

  // Note: Todo IPC handlers removed - Floating Navigator uses oRPC via web app

  // Window management IPC handlers with error handling
  ipcMain.handle(
    'window-minimize',
    ipcErrorHandler.wrapHandler(
      () => {
        if (!windowManager) {
          throw new Error('Window manager not initialized')
        }

        if (!windowManager.hasMainWindow()) {
          throw new Error('Main window not available')
        }

        windowManager.minimizeToTray()
        return true
      },
      {
        channel: 'window-minimize',
        operationType: 'windowOperation',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-close',
    ipcErrorHandler.wrapHandler(
      () => {
        if (!windowManager) {
          throw new Error('Window manager not initialized')
        }

        if (!windowManager.hasMainWindow()) {
          throw new Error('Main window not available')
        }

        windowManager.minimizeToTray()
        return true
      },
      {
        channel: 'window-close',
        operationType: 'windowOperation',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-toggle-floating-navigator',
    ipcErrorHandler.wrapHandler(
      () => {
        if (!windowManager) {
          throw new Error('Window manager not initialized')
        }

        windowManager.toggleFloatingNavigator()
        return true
      },
      {
        channel: 'window-toggle-floating-navigator',
        operationType: 'windowOperation',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main') => {
        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getWindowState(type)
      },
      {
        channel: 'window-state-get',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-set',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main', properties = {}) => {
        if (!properties || typeof properties !== 'object') {
          throw new Error('Window state properties must be an object')
        }

        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        stateManager.setWindowState(type, properties)
        syncWindowBoundsToBrowserWindow(type)
        return stateManager.getWindowState(type)
      },
      {
        channel: 'window-state-set',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-reset',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main') => {
        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        stateManager.resetWindowState(type)
        syncWindowBoundsToBrowserWindow(type)
        return stateManager.getWindowState(type)
      },
      {
        channel: 'window-state-reset',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get-stats',
    ipcErrorHandler.wrapHandler(
      () => {
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getStats()
      },
      {
        channel: 'window-state-get-stats',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-move-to-display',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main', displayId) => {
        if (typeof displayId !== 'number') {
          throw new Error('Display ID must be a number')
        }

        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        const targetWindow = getBrowserWindowForType(type)
        return stateManager.moveWindowToDisplay(type, displayId, targetWindow)
      },
      {
        channel: 'window-state-move-to-display',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-snap-to-edge',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main', edge) => {
        if (!edge || typeof edge !== 'string') {
          throw new Error('Edge must be provided as a string')
        }

        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        const targetWindow = getBrowserWindowForType(type)
        return stateManager.snapWindowToEdge(type, edge, targetWindow)
      },
      {
        channel: 'window-state-snap-to-edge',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get-display',
    ipcErrorHandler.wrapHandler(
      (_event, windowType = 'main') => {
        const type = typeof windowType === 'string' ? windowType : 'main'
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getWindowDisplay(type)
      },
      {
        channel: 'window-state-get-display',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'window-state-get-all-displays',
    ipcErrorHandler.wrapHandler(
      () => {
        const stateManager = ensureWindowStateManagerInstance()
        return stateManager.getAllDisplays()
      },
      {
        channel: 'window-state-get-all-displays',
        operationType: 'windowState',
        enableDegradation: true,
      },
    ),
  )

  // System tray IPC handlers
  ipcMain.handle('window-show-floating-navigator', () => {
    if (windowManager) {
      windowManager.showFloatingNavigator()
    }
  })

  ipcMain.handle('window-hide-floating-navigator', () => {
    if (windowManager) {
      windowManager.hideFloatingNavigator()
    }
  })

  // Floating window control IPC handlers
  ipcMain.handle('floating-window-close', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.close()
        }
      }
      return true
    } catch (error) {
      log.error('Failed to close floating window:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-minimize', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.minimize()
        }
      }
      return true
    } catch (error) {
      log.error('Failed to minimize floating window:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-toggle-always-on-top', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          const isAlwaysOnTop = floatingWindow.isAlwaysOnTop()
          floatingWindow.setAlwaysOnTop(!isAlwaysOnTop)
          return !isAlwaysOnTop
        }
      }
      return false
    } catch (error) {
      log.error('Failed to toggle always on top:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-get-bounds', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          return floatingWindow.getBounds()
        }
      }
      return null
    } catch (error) {
      log.error('Failed to get floating window bounds:', error)
      return null
    }
  })

  ipcMain.handle('floating-window-set-bounds', (_event, bounds) => {
    try {
      if (!bounds || typeof bounds !== 'object') {
        throw new Error('Invalid bounds data')
      }

      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.setBounds(bounds)
        }
      }
      return true
    } catch (error) {
      log.error('Failed to set floating window bounds:', error)
      return false
    }
  })

  ipcMain.handle('floating-window-is-always-on-top', () => {
    try {
      if (windowManager && windowManager.hasFloatingNavigator()) {
        const floatingWindow = windowManager.getFloatingNavigator()
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          return floatingWindow.isAlwaysOnTop()
        }
      }
      return false
    } catch (error) {
      log.error('Failed to check always on top status:', error)
      return false
    }
  })

  ipcMain.handle('tray-show-notification', (event, title, body, options) => {
    if (systemTrayManager) {
      return systemTrayManager.showNotification(title, body, options)
    }
  })

  ipcMain.handle('tray-update-menu', (event, tasks) => {
    if (systemTrayManager) {
      systemTrayManager.updateTrayMenu(tasks)
    }
  })

  ipcMain.handle('tray-set-tooltip', (event, text) => {
    if (systemTrayManager) {
      systemTrayManager.setTrayTooltip(text)
    }
  })

  ipcMain.handle('tray-set-icon-state', (event, state) => {
    if (systemTrayManager) {
      return systemTrayManager.setTrayIconState(state)
    }
    return false
  })

  // Notification management IPC handlers with error handling and lazy loading
  ipcMain.handle(
    'notification-show',
    ipcErrorHandler.wrapHandler(
      async (event, title, body, options) => {
        // Validate input
        const titleValidation = ipcErrorHandler.validateInput(title, {
          type: 'string',
          required: true,
        })

        if (!titleValidation.isValid) {
          throw new Error(
            `Invalid notification title: ${titleValidation.error}`,
          )
        }

        const bodyValidation = ipcErrorHandler.validateInput(body, {
          type: 'string',
          required: true,
        })

        if (!bodyValidation.isValid) {
          throw new Error(`Invalid notification body: ${bodyValidation.error}`)
        }

        // Lazy load notification manager if not available
        if (!notificationManager) {
          try {
            const NotificationManager = await lazyLoadManager.loadComponent(
              'NotificationManager',
            )
            // eslint-disable-next-line require-atomic-updates
            notificationManager = new NotificationManager(
              windowManager,
              systemTrayManager,
              configManager,
            )
          } catch (error) {
            log.warn('Failed to load notification manager:', error.message)
            throw new Error('Notification manager not available')
          }
        }

        return notificationManager.showNotification(title, body, options || {})
      },
      {
        channel: 'notification-show',
        operationType: 'notification',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle('notification-get-preferences', () => {
    if (notificationManager) {
      return notificationManager.getPreferences()
    }
    return null
  })

  ipcMain.handle('notification-update-preferences', (event, preferences) => {
    if (notificationManager) {
      notificationManager.updatePreferences(preferences)
      return notificationManager.getPreferences()
    }
    return null
  })

  // Configuration management IPC handlers with error handling
  ipcMain.handle(
    'config-get',
    ipcErrorHandler.wrapHandler(
      (event, path, defaultValue) => {
        // Validate input
        const validation = ipcErrorHandler.validateInput(path, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid config path: ${validation.error}`)
        }

        if (!configManager) {
          throw new Error('Configuration manager not initialized')
        }

        return configManager.get(path, defaultValue)
      },
      {
        channel: 'config-get',
        operationType: 'getConfig',
        enableDegradation: true,
      },
    ),
  )

  ipcMain.handle(
    'config-set',
    ipcErrorHandler.wrapHandler(
      (event, path, value) => {
        // Validate input
        const validation = ipcErrorHandler.validateInput(path, {
          type: 'string',
          required: true,
        })

        if (!validation.isValid) {
          throw new Error(`Invalid config path: ${validation.error}`)
        }

        if (!configManager) {
          throw new Error('Configuration manager not initialized')
        }

        return configManager.set(path, value)
      },
      {
        channel: 'config-set',
        operationType: 'setConfig',
        enableDegradation: true,
      },
    ),
  )

  // Authentication IPC handlers (basic implementations for testing)
  ipcMain.handle('auth-get-user', () => {
    return activeUser
  })

  ipcMain.handle('auth-set-user', async (_event, user) => {
    try {
      return await setActiveUser(user)
    } catch (error) {
      log.error('Failed to set active user:', error)
      throw error
    }
  })

  ipcMain.handle('auth-logout', async () => {
    activeUser = null
    return true
  })

  ipcMain.handle('auth-is-authenticated', () => {
    return Boolean(activeUser)
  })

  ipcMain.handle('auth-sync-from-web', async (_event, authData) => {
    try {
      await setActiveUser(authData)
      return true
    } catch (error) {
      log.error('Failed to sync auth from web:', error)
      return false
    }
  })

  // OAuth IPC handlers for browser-based OAuth flows
  // Used when WebView OAuth is blocked (e.g., Google OAuth)
  ipcMain.handle('oauth-start', async (_event, provider) => {
    try {
      const oauth = ensureOAuthManager()
      if (!oauth) {
        throw new Error('OAuth manager not initialized')
      }

      if (!oauth.isProviderSupported(provider)) {
        throw new Error(`Unsupported OAuth provider: ${provider}`)
      }

      return await oauth.startOAuthFlow(provider)
    } catch (error) {
      log.error('Failed to start OAuth flow:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('oauth-get-supported-providers', () => {
    const oauth = ensureOAuthManager()
    return oauth ? oauth.getSupportedProviders() : []
  })

  ipcMain.handle('oauth-cancel', (_event, state) => {
    const oauth = ensureOAuthManager()
    if (oauth) {
      oauth.cancelPendingFlow(state)
    }
    return true
  })

  // Get pending sign-in token (for race condition handling)
  ipcMain.handle('oauth-get-pending-token', () => {
    const oauth = ensureOAuthManager()
    return oauth ? oauth.getPendingSignInToken() : null
  })

  // Clear pending sign-in token (after successful sign-in)
  ipcMain.handle('oauth-clear-pending-token', () => {
    const oauth = ensureOAuthManager()
    if (oauth) {
      oauth.clearPendingSignInToken()
    }
    return true
  })

  // Performance monitoring IPC handlers
  ipcMain.handle('performance-get-metrics', () => {
    return {
      optimizer: performanceOptimizer.getMetrics(),
      memory: memoryProfiler.getStatistics(),
      lazyLoad: lazyLoadManager.getStatus(),
    }
  })

  ipcMain.handle('performance-trigger-cleanup', () => {
    memoryProfiler.performCleanup('manual')
    return true
  })

  ipcMain.handle('performance-get-startup-time', () => {
    return Date.now() - performanceOptimizer.startupMetrics.startTime
  })

  // Menu action IPC handlers
  ipcMain.handle('menu-action', (event, action) => {
    if (menuManager) {
      menuManager.handleMenuAction(action)
    }
  })

  // Deep linking IPC handlers
  ipcMain.handle('deep-link-generate', (_event, action, params) => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.generateDeepLink(action, params)
    }
    return null
  })

  ipcMain.handle('deep-link-get-examples', () => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.getExampleUrls()
    }
    return {}
  })

  ipcMain.handle('deep-link-handle-url', async (_event, url) => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.handleDeepLink(url)
    }
    return false
  })

  // Add other IPC handlers without error wrapping for simplicity
  ipcMain.handle('window-show-main', () => {
    if (windowManager) {
      windowManager.restoreFromTray()
    }
  })

  // Auto-updater IPC handlers
  ipcMain.handle('updater-check-for-updates', () => {
    if (autoUpdater) {
      autoUpdater.manualCheckForUpdates()
      return true
    }
    return false
  })

  ipcMain.handle('updater-quit-and-install', () => {
    if (autoUpdater) {
      autoUpdater.quitAndInstall()
      return true
    }
    return false
  })

  ipcMain.handle('updater-get-status', () => {
    if (autoUpdater) {
      return autoUpdater.getUpdateStatus()
    }
    return { updateAvailable: false, updateDownloaded: false }
  })

  // Note: Quick todo operations removed - Floating Navigator uses oRPC via web app
}

/**
 * Application Entry Point and Lifecycle Management
 *
 * Electron apps follow a specific lifecycle:
 * 1. App starts → 'will-finish-launching' event
 * 2. App ready → 'ready' event (can create windows)
 * 3. Windows open → user interaction
 * 4. Windows close → 'window-all-closed' event
 * 5. App quits → 'before-quit' event
 */

/**
 * Single Instance Lock
 *
 * Ensures only one instance of the app runs at a time.
 * This prevents:
 * - Multiple database connections
 * - Port conflicts (Next.js server)
 * - Confusing UX with duplicate windows
 * - Resource waste
 *
 * Exception: Disabled in test environment for parallel test execution
 */
const gotTheLock = isTestEnvironment ? true : app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is running, quit this one
  app.quit()
} else {
  /**
   * App ready event - fired when Electron has finished initialization.
   * This is where we:
   * 1. Set up security policies
   * 2. Create the main window
   * 3. Initialize all systems
   */
  app.whenReady().then(async () => {
    // Setup security policies before any window creation
    setupSecurity()

    // Create the main application window
    const mainWindow = await createWindow()

    /**
     * Test environment special handling.
     * Makes the app behave differently during automated testing:
     * - Shows notification for debugging
     * - Window doesn't steal focus (better for parallel tests)
     * - Can be hidden from dock to reduce visual noise
     */
    if (isTestEnvironment) {
      new Notification({ title: 'Electron is Testing' }).show()
      // Show window without stealing focus for better test stability
      mainWindow.showInactive()
      // Note: These are commented out but can be enabled if needed:
      // app.hide() - Hide entire app
      // app.setActivationPolicy('accessory') - Remove from dock (macOS)
    }

    /**
     * macOS-specific: 'activate' event.
     * Fired when user clicks dock icon. By convention, macOS apps
     * recreate windows instead of quitting when all windows are closed.
     */
    app.on('activate', () => {
      // Re-create window if none exist
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

/**
 * Window close behavior for macOS.
 *
 * macOS convention: Close all windows = app stays in dock
 * Users can fully quit via Cmd+Q or the app menu.
 *
 * This handler is intentionally empty to follow macOS platform guidelines.
 */
app.on('window-all-closed', () => {
  // macOS: App stays running when all windows are closed (platform convention)
  // No action needed - this is the default Electron behavior on macOS
})

/**
 * Application cleanup handler.
 *
 * Ensures graceful shutdown by:
 * 1. Saving user state (window positions, preferences)
 * 2. Closing database connections properly
 * 3. Removing system integrations (shortcuts, tray icons)
 * 4. Stopping background processes
 *
 * Why cleanup order matters:
 * - Reverse order of initialization prevents dependency issues
 * - User-facing features cleaned up first (can fail gracefully)
 * - Core services cleaned up last (must succeed)
 *
 * This prevents:
 * - Data corruption from abrupt shutdown
 * - Memory leaks from orphaned processes
 * - System resource leaks (tray icons persisting)
 */
app.on('before-quit', async () => {
  // Stop performance monitoring first
  memoryProfiler.stopMonitoring()

  // Cleanup managers in reverse order of initialization
  // This ensures dependencies are available during cleanup

  // User-facing features (can fail without critical impact)
  if (oauthManager) {
    oauthManager.cleanup()
  }
  if (deepLinkManager) {
    deepLinkManager.cleanup()
  }
  if (systemTrayManager) {
    systemTrayManager.setQuitting(true)
  }
  if (systemIntegrationErrorHandler) {
    systemIntegrationErrorHandler.handleAppQuit()
  }
  if (shortcutManager) {
    shortcutManager.cleanup()
  }
  if (notificationManager) {
    notificationManager.cleanup()
  }

  // Core window management
  if (windowStateManager) {
    windowStateManager.cleanup() // Saves window positions
  }
  if (windowManager) {
    windowManager.cleanup() // Closes all windows
  }

  // Communication layer
  if (ipcErrorHandler) {
    ipcErrorHandler.cleanup()
  }

  // Note: apiBridge cleanup removed - no local database in WebView architecture

  // Final performance cleanup
  lazyLoadManager.cleanup()
  performanceOptimizer.cleanup()
  memoryProfiler.cleanup()
})

/**
 * Web content security handler.
 *
 * This is a critical security boundary. Every web page (renderer process)
 * created by the app passes through here. We enforce strict security
 * policies to prevent:
 *
 * 1. Popup/popunder attacks
 * 2. Webview injection vulnerabilities
 * 3. Protocol handler exploits
 *
 * These handlers run for ALL web content, including:
 * - Main window
 * - Floating window
 * - Any webviews (if used)
 * - DevTools windows
 */
app.on('web-contents-created', (_event, contents) => {
  /**
   * Prevent new window creation from web content.
   *
   * Why block this?
   * - Prevents popup ads/malware
   * - Stops potential phishing windows
   * - Maintains control over app's window management
   *
   * If legitimate popups are needed, implement them
   * through controlled IPC calls instead.
   */
  contents.on('new-window', (event, _navigationUrl) => {
    event.preventDefault()
  })

  /**
   * Webview security hardening.
   *
   * Webviews can be attack vectors because they:
   * - Can load arbitrary content
   * - Might try to access Node.js APIs
   * - Could load malicious preload scripts
   *
   * We strip dangerous capabilities and enforce isolation.
   */
  contents.on('will-attach-webview', (event, webPreferences, _params) => {
    // Remove preload scripts - they could contain malicious code
    delete webPreferences.preload
    delete webPreferences.preloadURL

    // Enforce security settings
    webPreferences.nodeIntegration = false // No Node.js access
    webPreferences.contextIsolation = true // Isolate contexts
  })

  /**
   * Navigation security.
   *
   * Restricts navigation to safe protocols only.
   * Blocks potentially dangerous protocols like:
   * - file:// (could access local files)
   * - custom protocols (could launch apps)
   * - javascript: (XSS vector)
   *
   * Only allows:
   * - http:// and https:// for web content
   * - file:// for local app resources
   */
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    if (
      parsedUrl.protocol !== 'http:' &&
      parsedUrl.protocol !== 'https:' &&
      parsedUrl.protocol !== 'file:'
    ) {
      event.preventDefault()
    }
  })
})

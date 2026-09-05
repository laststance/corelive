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

import { app, BrowserWindow, dialog, session, powerMonitor } from 'electron'
import type { WebContents, Event as ElectronEvent } from 'electron'

import type { AutoUpdater as AutoUpdaterType } from './AutoUpdater'
import { ConfigManager } from './ConfigManager'
import {
  LIVE_EDITOR_SHORTCUT_IDS,
  type LiveEditorShortcutId,
} from './constants'
import type { DeepLinkManager as DeepLinkManagerType } from './DeepLinkManager'
import { isRendererReadableConfigPath } from './ipc/ipc-schemas'
import { registerAuthHandlers } from './ipc/registerAuthHandlers'
import { typedHandle } from './ipc/typedHandle'
import { IPCErrorHandler } from './IPCErrorHandler'
import { lazyLoadManager } from './LazyLoadManager'
import { getLiveEditorNote, setLiveEditorNote } from './LiveEditorNoteStore'
import { log } from './logger'
import { memoryProfiler } from './MemoryProfiler'
import type { MenuManager as MenuManagerType } from './MenuManager'
import type { NotificationManager as NotificationManagerType } from './NotificationManager'
import type { OAuthManager as OAuthManagerType } from './OAuthManager'
import { performanceOptimizer, OPTIMIZATION_LEVELS } from './performance-config'
import type { ShortcutManager as ShortcutManagerType } from './ShortcutManager'
import type { SystemIntegrationErrorHandler as SystemIntegrationErrorHandlerType } from './SystemIntegrationErrorHandler'
import type {
  SystemTrayManager as SystemTrayManagerType,
  TaskItem,
} from './SystemTrayManager'
import type { AuthUserPayload } from './types/ipc'
import { createUiohookShortcutEngine } from './uiohookEngine'
import { applyShortcutRebind } from './utils/applyShortcutRebind'
import { resolveRemoteDebuggingPort } from './utils/debugMode'
import { isSameAccelerator } from './utils/isSameAccelerator'
import { loadUiohook } from './utils/loadUiohook'
import { isNativeTapLatchSet } from './utils/nativeTapLatch'
import { openConfigFile } from './utils/openConfigFile'
import {
  HIDE_APP_ICON_CONFIG_PATH,
  resolveHideAppIcon,
} from './utils/resolveHideAppIcon'
import { WindowManager } from './WindowManager'
import { WindowStateManager } from './WindowStateManager'

// ============================================================================
// Type Definitions
// ============================================================================

// `AuthUserPayload` from `./types/ipc` is the canonical shape — single source of truth.

/** Performance optimization configuration */
interface OptimizationConfig {
  enableMemoryMonitoring: boolean
  [key: string]: unknown
}

// ============================================================================
// Remote Debugging (opt-in debug — Issue #61)
// ============================================================================

/**
 * Open a Chrome DevTools Protocol port only when a debug opt-in is set.
 *
 * `CORELIVE_DEBUG=1` opens the default port (9222) unless
 * `CORELIVE_REMOTE_DEBUGGING_PORT` overrides it.
 * A default packaged build sets neither, so no port is opened — the production
 * app exposes no remote-debugging surface unless deliberately launched in debug
 * mode. (DevTools availability is gated separately in WindowManager.)
 */
// Must run at module scope: Chromium reads `remote-debugging-port` during
// browser-process init (before `app.whenReady()` resolves), so appending it
// inside `whenReady` would be a no-op and the CDP port would never open.
// `resolveRemoteDebuggingPort` throws on a bad `CORELIVE_REMOTE_DEBUGGING_PORT`,
// but here — before the `app.whenReady().catch(...)` boot backstop — an
// uncaught throw would crash startup outside the friendly fatal-error path.
// Since this is an opt-in *debug* lever, fail soft: warn loudly (the debug user
// who set the var needs to know it was rejected) and boot without the CDP port.
let remoteDebuggingPort: string | null = null
try {
  remoteDebuggingPort = resolveRemoteDebuggingPort(process.env)
} catch (error) {
  log.warn(
    '⚠️ Ignoring invalid CORELIVE_REMOTE_DEBUGGING_PORT — no CDP port opened.',
    error,
  )
}
if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

// ============================================================================
// Environment Flags
// ============================================================================

/**
 * Environment flags determine behavior differences between development and production.
 * These affect security policies, performance optimizations, and debugging features.
 */
const isDev = process.env.NODE_ENV === 'development'

/**
 * Performance optimization level selection.
 * Development mode prioritizes debugging, production mode prioritizes speed.
 */
const optimizationLevel: 'development' | 'production' = isDev
  ? 'development'
  : 'production'
const config = OPTIMIZATION_LEVELS[
  optimizationLevel
] as unknown as OptimizationConfig

// ============================================================================
// Manager Instances
// ============================================================================

/**
 * Manager instances - organized by initialization strategy
 *
 * Why use global references?
 * - Managers need to be accessible across different app lifecycle events
 * - Proper cleanup requires maintaining references for shutdown sequence
 * - Some managers depend on others, requiring careful initialization order
 */

// Core managers - initialized during app startup
let configManager: ConfigManager
let windowStateManager: WindowStateManager
let windowManager: WindowManager
let ipcErrorHandler: IPCErrorHandler
// Note: apiBridge and nextServerManager are no longer needed in WebView architecture

/**
 * Guards setupIPCHandlers against a second run. IPC handlers bind the
 * module-level `windowManager`, so they are process-global and only need
 * registering once; `ipcMain.handle` throws on duplicate channels, and the
 * macOS `activate` path can call createWindow (→ setupIPCHandlers) again after
 * every window is closed. The flag turns that re-entry into a no-op.
 */
let ipcHandlersInitialized = false

/**
 * Lazy-loaded managers - initialized only when needed.
 * This improves startup time by deferring non-critical features.
 *
 * Why lazy load?
 * - Auto-updater isn't needed immediately on startup
 * - System tray might not be used by all users
 * - Notifications are event-driven, not needed at launch
 */
let autoUpdater: AutoUpdaterType | null = null
let systemTrayManager: SystemTrayManagerType | null = null
let notificationManager: NotificationManagerType | null = null
/** Promise to track in-flight NotificationManager initialization (prevents race conditions) */
let notificationManagerPromise: Promise<NotificationManagerType> | null = null
let shortcutManager: ShortcutManagerType | null = null
/**
 * Guards the one-time attachment of the #125 native key-tap `powerMonitor`
 * listeners (sleep/lock → reset pressed-state, wake/unlock → re-arm). They are
 * app-lifetime, so re-running the deferred ShortcutManager load must not stack
 * duplicate listeners.
 */
let nativeTapPowerListenersAttached = false
let systemIntegrationErrorHandler: SystemIntegrationErrorHandlerType | null =
  null
let menuManager: MenuManagerType | null = null
let deepLinkManager: DeepLinkManagerType | null = null
let oauthManager: OAuthManagerType | null = null

// Current authenticated user information
let activeUser: AuthUserPayload | null = null

/**
 * Queue for deep link URLs received before DeepLinkManager is ready.
 * On macOS, 'open-url' events can fire very early, even before app.whenReady().
 * We queue these URLs and process them once the app is fully initialized.
 */
let pendingDeepLinkUrl: string | null = null

/**
 * Sanitizes a URL for safe logging by removing query parameters.
 * This prevents OAuth tokens, API keys, and other sensitive data from being logged.
 *
 * @param url - The full URL to sanitize
 * @returns A safe representation with only scheme, host, and path (no query string)
 */
function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url)
    // Return only scheme://host/path without query string or hash
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    // If URL parsing fails, return a minimal safe representation
    const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
    return schemeMatch ? `${schemeMatch[1]}://[invalid-url]` : '[invalid-url]'
  }
}

// ============================================================================
// Early Event Handlers
// ============================================================================

/**
 * Early 'open-url' handler for macOS.
 *
 * CRITICAL: This must be registered BEFORE app.whenReady() to catch
 * deep links that trigger app launch or arrive when app is starting.
 * If registered inside app.whenReady(), URLs are lost!
 */
app.on('open-url', (event, url) => {
  event.preventDefault()
  // Sanitize URL for logging to prevent OAuth tokens from being logged
  log.info('🔗 [Early] Received open-url event:', {
    url: sanitizeUrlForLogging(url),
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
function processPendingDeepLinkUrl(): void {
  if (pendingDeepLinkUrl && deepLinkManager && deepLinkManager.isInitialized) {
    // Sanitize URL for logging to prevent OAuth tokens from being logged
    log.info('🔗 Processing queued deep link URL:', {
      url: sanitizeUrlForLogging(pendingDeepLinkUrl),
    })
    deepLinkManager.handleDeepLink(pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  }
}

// ============================================================================
// Manager Initialization Helpers
// ============================================================================

/**
 * Ensures the OAuthManager is initialized when needed.
 *
 * OAuth manager handles browser-based OAuth flows required for providers
 * that block WebView authentication (e.g., Google OAuth).
 *
 * @returns The initialized manager or null if dependencies aren't ready
 */
function ensureOAuthManager(): OAuthManagerType | null {
  if (!windowManager) {
    return null
  }

  if (!oauthManager) {
    const { OAuthManager } = require('./OAuthManager.cjs')
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
 * @returns The initialized manager or null if dependencies aren't ready
 */
function ensureDeepLinkManager(): DeepLinkManagerType | null {
  // Deep link manager requires window manager to function
  if (!windowManager) {
    return null
  }

  // First-time initialization
  if (!deepLinkManager) {
    const { DeepLinkManager } = require('./DeepLinkManager.cjs')
    deepLinkManager = new DeepLinkManager(
      windowManager,
      null, // apiBridge no longer used in WebView architecture
      notificationManager || null, // Notifications are optional
      app,
    )
  }

  // At this point deepLinkManager is guaranteed to be non-null
  const manager = deepLinkManager!

  // Connect OAuth manager to handle OAuth deep link callbacks
  const oauth = ensureOAuthManager()
  if (oauth && !manager.hasOAuthManager) {
    manager.setOAuthManager(oauth)
  }

  // Initialize if not already done (handles protocol registration)
  if (!manager.isInitialized) {
    manager.initialize()
  }

  return manager
}

/**
 * Ensures the NotificationManager is initialized when needed.
 * Uses a Promise tracker to prevent race conditions from concurrent calls.
 *
 * @returns The initialized NotificationManager
 * @throws Error if initialization fails
 */
async function ensureNotificationManager(): Promise<NotificationManagerType> {
  // Return existing instance if available
  if (notificationManager) {
    return notificationManager
  }

  // Wait for in-flight initialization if one exists (prevents race condition)
  if (notificationManagerPromise) {
    return notificationManagerPromise
  }

  // Start new initialization and track the promise
  notificationManagerPromise = (async () => {
    try {
      const NotificationManagerCls = (await lazyLoadManager.loadComponent(
        'NotificationManager',
      )) as new (...args: unknown[]) => NotificationManagerType
      notificationManager = new NotificationManagerCls(
        windowManager,
        systemTrayManager,
        configManager,
      )
      return notificationManager
    } catch (error) {
      // Clear promise on failure to allow retry
      notificationManagerPromise = null
      log.warn(
        'Failed to load notification manager:',
        error instanceof Error ? error.message : String(error),
      )
      throw new Error('Notification manager not available')
    }
  })()

  return notificationManagerPromise
}

/**
 * Sets the currently authenticated user.
 *
 * In WebView architecture, authentication is handled by the web app (Clerk).
 * This function simply stores the user info for Electron-side features
 * (e.g., displaying in menu, notifications).
 *
 * @param userPayload - User data from Clerk authentication
 * @returns The active user object
 */
async function setActiveUser(
  userPayload: AuthUserPayload,
): Promise<AuthUserPayload> {
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

// ============================================================================
// Content Security Policy
// ============================================================================

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
 * - 'unsafe-inline': Unfortunately needed for some React/Next.js inline styles
 * - 'unsafe-eval' (dev only): React 19 / Next.js dev mode reconstructs error
 *   stacks from server components via eval(); never used in production
 * - localhost: Development server connections
 * - data: URIs: For inline images and fonts
 *
 * Note: In production, consider stricter policies and nonces for inline scripts
 */
// React/Next.js dev mode needs eval() for callstack reconstruction (devtools).
// Production builds never call eval(), so we keep the strict policy there.
const scriptSrcDirective = [
  "script-src 'self' 'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  'https://clerk.corelive.app',
  'https://*.clerk.accounts.dev',
  'https://*.clerk.dev',
  'https://*.clerk.com',
].join(' ')

const CSP_POLICY = [
  "default-src 'self'",
  // Allow Clerk assets from custom domain (clerk.corelive.app), .dev and .com domains
  scriptSrcDirective,
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
function setupSecurity(): void {
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
      (
        _webContents: WebContents | null,
        permission: string,
        callback: (permissionGranted: boolean) => void,
      ) => {
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
      (
        _webContents: WebContents | null,
        _permission: string,
        _requestingOrigin: string,
      ): boolean => {
        return false // Deny all permission checks by default
      },
    )
  } catch (error) {
    log.error(
      '❌ Security setup failed:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

// ============================================================================
// Window Creation
// ============================================================================

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
 * @returns The main application window
 */
/**
 * Load the system-integration manager stack (tray, notifications, shortcuts,
 * and the error handler that orchestrates them).
 * The error handler is constructed here with the managers it orchestrates so
 * system integration initializes as one coherent stack.
 */
async function loadSystemIntegrationStack(): Promise<void> {
  log.info('🔧 [DEFERRED] Loading SystemIntegrationErrorHandler...')
  const SystemIntegrationErrorHandlerCls = (await lazyLoadManager.loadComponent(
    'SystemIntegrationErrorHandler',
  )) as new (...args: unknown[]) => SystemIntegrationErrorHandlerType
  systemIntegrationErrorHandler = new SystemIntegrationErrorHandlerCls(
    windowManager,
    configManager,
  )
  log.info('✅ [DEFERRED] SystemIntegrationErrorHandler loaded')

  log.info('🔧 [DEFERRED] Loading SystemTrayManager...')
  const SystemTrayManagerCls = (await lazyLoadManager.loadComponent(
    'SystemTrayManager',
  )) as new (...args: unknown[]) => SystemTrayManagerType
  systemTrayManager = new SystemTrayManagerCls(windowManager)
  windowManager.setTrayBoundsProvider(
    () => systemTrayManager?.getTrayBounds() ?? null,
  )
  log.info('✅ [DEFERRED] SystemTrayManager loaded')

  log.info('🔧 [DEFERRED] Loading NotificationManager...')
  const NotificationManagerCls = (await lazyLoadManager.loadComponent(
    'NotificationManager',
  )) as new (...args: unknown[]) => NotificationManagerType
  notificationManager = new NotificationManagerCls(
    windowManager,
    systemTrayManager,
    configManager,
  )
  log.info('✅ [DEFERRED] NotificationManager loaded')

  log.info('🔧 [DEFERRED] Loading ShortcutManager...')
  const ShortcutManagerCls = (await lazyLoadManager.loadComponent(
    'ShortcutManager',
  )) as new (...args: unknown[]) => ShortcutManagerType
  // Inject the uiohook tap so lone-modifier bindings (e.g. Right ⌥) can register
  // natively; if the native module can't load it degrades to the no-op engine and
  // those binds fall back to chords (existing accelerator behavior is untouched).
  const nativeShortcutEngine = createUiohookShortcutEngine(loadUiohook)
  shortcutManager = new ShortcutManagerCls(
    windowManager,
    notificationManager,
    configManager,
    nativeShortcutEngine,
  )
  log.info('✅ [DEFERRED] ShortcutManager loaded')

  // #125 native key-tap freeze-safety — power-event recovery. A CGEventTap can
  // silently die across display sleep / screen lock; revive it on wake/unlock.
  // And a lone modifier "held across sleep" must not leave a stale pressed-alone
  // key, so drop the pressed-set before sleeping. Attached once (app-lifetime).
  if (!nativeTapPowerListenersAttached) {
    nativeTapPowerListenersAttached = true
    // Sleep / lock: clear in-flight pressed-alone state WITHOUT restarting.
    const dropNativeTapPressedState = () =>
      shortcutManager?.resetNativeTapState()
    powerMonitor.on('suspend', dropNativeTapPressedState)
    powerMonitor.on('lock-screen', dropNativeTapPressedState)
    // Wake / unlock: stop→start the tap so a silently-dead tap revives.
    const reviveNativeTap = () => shortcutManager?.reArmNativeTap()
    powerMonitor.on('resume', reviveNativeTap)
    powerMonitor.on('unlock-screen', reviveNativeTap)
  }

  // Feed the tray the live, display-only hotkey for the LiveEditor toggle item.
  // ShortcutManager is constructed AFTER SystemTrayManager, so this is a setter
  // injection rather than a constructor argument. Only the displayed key is
  // exposed, and only when it holds a real accelerator string.
  systemTrayManager?.setShortcutAcceleratorProvider(() => {
    const current = shortcutManager?.getCurrentShortcuts() ?? {}
    const accelerators: Record<string, string> = {}
    if (typeof current.toggleLiveEditor === 'string') {
      accelerators.toggleLiveEditor = current.toggleLiveEditor
    }
    return accelerators
  })

  log.info('🔧 [DEFERRED] Wiring managers + initializing system integration...')
  systemIntegrationErrorHandler.setManagers(
    systemTrayManager,
    notificationManager,
    shortcutManager,
  )
  await systemIntegrationErrorHandler.initializeSystemIntegration()
  log.info('✅ [DEFERRED] System integration initialized')
}

/**
 * Load the deep-link stack: registers `corelive://` protocol handler with
 * the OS and drains any URLs that arrived before the handler was ready.
 */
async function loadDeepLinkStack(): Promise<void> {
  log.info('🔧 [DEFERRED] Initializing DeepLinkManager...')
  const manager = ensureDeepLinkManager()
  if (!manager) {
    return
  }
  log.info('✅ [DEFERRED] DeepLinkManager initialized')
  manager.setNotificationManager(notificationManager)

  // Drain any deep-link URLs received before the manager was ready:
  // 1. URLs from early `open-url` events (before app ready)
  // 2. URLs from command line args (Windows/Linux)
  setTimeout(() => {
    try {
      manager.processPendingUrl()
      processPendingDeepLinkUrl()
    } catch (error) {
      log.warn('⚠️ Failed to process pending deep link URL', error)
    }
  }, 1000)
}

async function createWindow(): Promise<void> {
  // Start performance monitoring early to track startup metrics
  if (config.enableMemoryMonitoring) {
    memoryProfiler.startMonitoring()
  }

  /**
   * Critical initialization phase - these must complete before showing window.
   * Order matters here due to dependencies between managers.
   */
  const criticalInit = async (): Promise<{
    serverUrl: string
  }> => {
    // Initialize IPC error handler first
    ipcErrorHandler = new IPCErrorHandler({
      maxRetries: 3,
      baseDelay: 1000,
      enableLogging: true,
    })

    // Initialize configuration manager
    configManager = new ConfigManager()

    // Apply the persisted dock-icon policy BEFORE any window shows (the first one
    // is openStartupPanel below), so a hidden icon stays hidden across a cold
    // Start-at-Login restart without waiting on the renderer's ElectronStartupSync
    // round-trip — a REMOTE load that can be slow or never complete at login,
    // leaving the icon visible. Setting 'accessory' before the app activates a
    // window also avoids the stale Cmd+Tab entry a later regular→accessory flip
    // leaves. macOS-only; the default 'regular' needs no action when false. (#112)
    if (process.platform === 'darwin' && resolveHideAppIcon(configManager)) {
      app.setActivationPolicy('accessory')
    }

    // Initialize window state manager
    windowStateManager = new WindowStateManager(configManager)

    // Development uses the local Next.js server; packaged builds use the web app.
    const serverUrl = isDev ? 'http://localhost:4991' : 'https://corelive.app'

    // Initialize window manager with server URL and managers
    windowManager = new WindowManager(
      serverUrl,
      configManager,
      windowStateManager,
    )

    // The Electron main window is retired (T18). CoreLive is now a thin native
    // companion: the full task app runs browser-only at corelive.app, and
    // Electron always opens the LiveEditor panel at launch. It is created hidden
    // and surfaces once it resolves — signed out, it hands over to the login
    // window (WindowManager nav-watch); a load failure self-heals via the panel
    // recovery dialog.
    windowManager.openStartupPanel()
    performanceOptimizer.startupMetrics.windowsCreated += 1

    return { serverUrl }
  }

  // Deferred initialization - happens after main window is shown
  const deferredInit = async (): Promise<void> => {
    try {
      // MenuManager always loads (works under xvfb)
      log.info('🔧 [DEFERRED] Loading MenuManager...')
      const MenuManagerCls = (await lazyLoadManager.loadComponent(
        'MenuManager',
      )) as new (...args: unknown[]) => MenuManagerType
      menuManager = new MenuManagerCls()

      // The menu bar is companion chrome after main-window retirement (T18):
      // View/Window roles target whatever window is focused; New Task opens the
      // browser. MenuManager.initialize accepts `BrowserWindow | null`, so the
      // (now permanently absent) main window passes through as null.
      if (menuManager) {
        menuManager.initialize(null, windowManager, configManager)
      }
      log.info('✅ [DEFERRED] MenuManager loaded')

      await loadSystemIntegrationStack()

      // Only packaged apps have an update target; development and unit-test processes must not create updater timers.
      if (app.isPackaged) {
        // Keep updater startup isolated so a failure cannot block the app.
        try {
          const AutoUpdaterCls = (await lazyLoadManager.loadComponent(
            'AutoUpdater',
          )) as new (...args: unknown[]) => AutoUpdaterType
          autoUpdater = new AutoUpdaterCls()
          // No main window to bind dialogs to after T18; the updater surfaces
          // through its own notifications.
        } catch (autoUpdaterError) {
          log.error('❌ Failed to initialize AutoUpdater:', autoUpdaterError)
        }
      } else {
        log.info('AutoUpdater initialization skipped outside packaged builds')
      }

      await loadDeepLinkStack()

      // No main-window close-to-tray wiring after T18 — the surviving panels own
      // their own close behavior (LiveEditor via live-editor-window-* IPC).
    } catch (error) {
      log.error('❌ Deferred initialization failed:', error)
      // Continue without non-critical components
    }
  }

  // Run critical initialization directly. Its return value (serverUrl) is no
  // longer consumed here now that the Electron main window is retired (T18);
  // criticalInit still wires up the renderer origin internally.
  await criticalInit()

  // Run deferred initialization
  setImmediate(async () => {
    try {
      log.info('🔄 Starting deferred initialization...')
      await deferredInit()
      log.info('✅ Deferred initialization completed successfully')
    } catch (error) {
      console.error('❌ Main: Deferred initialization failed:', error)
      log.error('❌ Main: Deferred initialization failed:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  })

  // Set up IPC handlers immediately (they handle lazy loading internally)
  setupIPCHandlers()
}

// ============================================================================
// IPC Handlers
// ============================================================================

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

/**
 * Strip user-authored LiveEditor note text from a config snapshot before
 * exposing it via generic config snapshot channels. The note map is personal
 * scratch content and only the dedicated `live-editor-note-get` channel should
 * surface it. Any other window sees only LiveEditor metadata.
 *
 * @param snapshot - The full config object as returned by `ConfigManager.getAll()`.
 * @returns A shallow clone with `liveEditor.notes` removed.
 */
function redactLiveEditorNotes(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const liveEditor = snapshot.liveEditor
  if (!liveEditor || typeof liveEditor !== 'object') return snapshot
  const { notes: _notes, ...rest } = liveEditor as Record<string, unknown>
  return { ...snapshot, liveEditor: rest }
}

/**
 * Shortcut ids that stay bound while the app is unfocused — everything else is
 * contextual. Reported to the keybind Settings UI as `isGlobal`.
 */
const GLOBAL_SHORTCUT_IDS: string[] = [...LIVE_EDITOR_SHORTCUT_IDS]

function setupIPCHandlers(): void {
  // Register IPC channels exactly once per process. A macOS re-launch via the
  // `activate` handler can call createWindow again, which would re-enter here
  // and make `ipcMain.handle` throw on the already-registered channels.
  if (ipcHandlersInitialized) {
    return
  }
  ipcHandlersInitialized = true

  /**
   * Basic app control handlers.
   * These provide controlled access to app-level functions.
   */

  // Returns current app version for display in UI
  typedHandle('app-version', () => {
    return app.getVersion()
  })

  // Allows renderer to trigger app shutdown
  typedHandle('app-quit', () => {
    app.quit()
  })

  // Panel settings (Zod-validated). Setters persist config and apply to the
  // live window inside WindowManager, so these handlers only delegate.
  typedHandle('live-editor-get-visible-on-all-workspaces', () => {
    if (!windowManager) return false
    return windowManager.getLiveEditorVisibleOnAllWorkspaces()
  })

  typedHandle(
    'live-editor-set-visible-on-all-workspaces',
    (_event, enabled) => {
      if (!windowManager) return false
      return windowManager.setLiveEditorVisibleOnAllWorkspaces(enabled)
    },
  )

  typedHandle('live-editor-window-get-always-on-top', () => {
    if (!windowManager) return false
    return windowManager.getLiveEditorAlwaysOnTop()
  })

  typedHandle('live-editor-window-set-always-on-top', (_event, enabled) => {
    if (!windowManager) return false
    return windowManager.setLiveEditorAlwaysOnTop(enabled)
  })

  // ────────────────────────────────────────────────────────────────────────
  // LiveEditor Window IPC handlers
  //
  // Why a separate block: LiveEditor is a frameless transparent panel with
  // its own preload; window/note channels live together so the contract
  // between preload-live-editor.ts and main.ts is easy to audit.
  // ────────────────────────────────────────────────────────────────────────
  typedHandle('live-editor-window-toggle', () => {
    if (!windowManager) return false
    windowManager.toggleLiveEditor()
    return true
  })

  typedHandle('live-editor-window-show', () => {
    if (!windowManager) return
    windowManager.showLiveEditor()
  })

  typedHandle('live-editor-window-hide', () => {
    if (!windowManager) return
    windowManager.hideLiveEditor()
  })

  typedHandle('live-editor-window-set-opacity', (_event, value) => {
    if (!windowManager) return 1
    return windowManager.setLiveEditorOpacity(value)
  })

  typedHandle('live-editor-window-get-opacity', () => {
    if (!windowManager) return 1
    return windowManager.getLiveEditorOpacity()
  })

  typedHandle('live-editor-window-get-bounds', () => {
    try {
      if (windowManager?.hasLiveEditorWindow()) {
        const win = windowManager.getLiveEditorWindow()
        if (win && !win.isDestroyed()) {
          return win.getBounds()
        }
      }
      return null
    } catch (error) {
      log.error('Failed to get LiveEditor window bounds:', error)
      return null
    }
  })

  typedHandle('live-editor-window-set-bounds', (_event, bounds) => {
    try {
      if (windowManager?.hasLiveEditorWindow()) {
        const win = windowManager.getLiveEditorWindow()
        if (win && !win.isDestroyed()) {
          win.setBounds(bounds)
        }
      }
      return true
    } catch (error) {
      log.error('Failed to set LiveEditor window bounds:', error)
      return false
    }
  })

  // Per-category note text (persisted in `liveEditor.notes[<categoryId>]`).
  typedHandle('live-editor-note-get', (_event, categoryId) => {
    if (!configManager) return ''
    return getLiveEditorNote(configManager, categoryId)
  })

  typedHandle('live-editor-note-set', (_event, categoryId, text) => {
    if (!configManager) return false
    setLiveEditorNote(configManager, categoryId, text)
    return true
  })

  /**
   * Rebind ONE of the two LiveEditor toggle slots — the shared body behind both
   * set-shortcut handlers, so the cross-slot duplicate guard can't be
   * implemented on one slot and forgotten on the other.
   * @param slotId - Which slot to write: `'toggleLiveEditor'` or `'toggleLiveEditorSecondary'`.
   * @param accelerator - The requested accelerator, or `''` to disable that slot.
   * @returns
   * - `true` when the accelerator bound exactly as requested (or was an intentional `''` disable)
   * - `false` on a conflict, a silent fallback substitution, or a duplicate of the other slot
   * @example
   * setLiveEditorShortcutSlot('toggleLiveEditorSecondary', 'lone-modifier:rightOption') // => true
   */
  const setLiveEditorShortcutSlot = (
    slotId: LiveEditorShortcutId,
    accelerator: string,
  ): boolean => {
    if (!configManager) return false

    // Reject a key already held by the OTHER slot. Two slots on one accelerator
    // is never what the user meant, and both registrars mishandle it: a chord
    // trips handleShortcutConflict (firing a misleading "Shortcut Changed" toast
    // before the rollback), and the native tap keys bindings by keycode — the
    // second bind would orphan the first, then unbinding either would kill both.
    const otherSlotId = LIVE_EDITOR_SHORTCUT_IDS.find((id) => id !== slotId)
    const otherAccelerator =
      configManager.get<string>(`shortcuts.${otherSlotId}`, '') ?? ''
    if (isSameAccelerator(accelerator, otherAccelerator)) return false

    // Try to register first; only persist on success so the renderer's
    // returned boolean accurately reflects whether the new accelerator is
    // live. `shortcuts.*` is the single store both slots read and write —
    // ShortcutManager registers from it, so a rollback here restores the
    // genuinely live binding even when the generic keybind UI did the rebind.
    const previous = configManager.get<string>(`shortcuts.${slotId}`, '') ?? ''
    if (shortcutManager) {
      try {
        // Reject a hard failure OR a silently-substituted fallback as a
        // conflict, so the renderer's boolean reflects the real binding
        // (§6e Design B; handleShortcutConflict itself is left untouched).
        if (
          !applyShortcutRebind(shortcutManager, slotId, accelerator, previous)
        ) {
          return false
        }
      } catch (error) {
        log.error('Failed to update LiveEditor shortcut:', error)
        return false
      }
    } else {
      // No live registrar (system integration disabled, or the deferred stack
      // hasn't loaded yet): `updateShortcuts` — which normally does this write —
      // never ran, so persist the choice here or it would vanish on read-back
      // and never reach the next registration pass.
      configManager.set(`shortcuts.${slotId}`, accelerator)
    }
    // Keep the tray's displayed LiveEditor hotkey in sync with the rebind.
    systemTrayManager?.refreshTrayMenu()
    return true
  }

  typedHandle('live-editor-config-get-shortcut', () => {
    if (!configManager) return ''
    // Read the CANONICAL store ShortcutManager registers from, like the
    // secondary-slot getter does. This used to read the legacy
    // `liveEditor.shortcut` mirror, which only this UI ever wrote — so it stayed
    // empty on every profile that never touched it and the box showed "unbound"
    // while Alt+Space was live. That empty box beside the second slot would read
    // as "slot 1 is free" right before the duplicate guard rejected it.
    return configManager.get<string>('shortcuts.toggleLiveEditor', '') ?? ''
  })

  typedHandle('live-editor-config-set-shortcut', (_event, accelerator) =>
    setLiveEditorShortcutSlot('toggleLiveEditor', accelerator),
  )

  typedHandle('live-editor-config-get-shortcut-secondary', () => {
    if (!configManager) return ''
    return (
      configManager.get<string>('shortcuts.toggleLiveEditorSecondary', '') ?? ''
    )
  })

  typedHandle(
    'live-editor-config-set-shortcut-secondary',
    (_event, accelerator) =>
      setLiveEditorShortcutSlot('toggleLiveEditorSecondary', accelerator),
  )

  typedHandle('tray-show-notification', (_event, title, body, options) => {
    if (systemTrayManager) {
      const notif = systemTrayManager.showNotification(title, body, options)
      return notif ? { id: String(Date.now()) } : null
    }
    return null
  })

  typedHandle('tray-update-menu', (_event, tasks) => {
    if (systemTrayManager) {
      systemTrayManager.updateTrayMenu(tasks as TaskItem[])
    }
  })

  typedHandle('tray-set-tooltip', (_event, text) => {
    if (systemTrayManager) {
      systemTrayManager.setTrayTooltip(text)
    }
  })

  typedHandle('tray-set-icon-state', (_event, state) => {
    if (systemTrayManager) {
      return systemTrayManager.setTrayIconState(state)
    }
    return false
  })

  // Notification management IPC handlers (Zod-validated, lazy-loaded)
  typedHandle('notification-show', async (_event, title, body, options) => {
    const manager = await ensureNotificationManager()
    const notif = manager.showNotification(title, body, options || {})
    return notif ? { id: String(Date.now()) } : null
  })

  typedHandle('notification-get-settings', () => {
    if (notificationManager) {
      return notificationManager.getSettings()
    }
    return null
  })

  typedHandle('notification-update-settings', (_event, settings) => {
    if (notificationManager) {
      notificationManager.updateSettings(settings)
      return notificationManager.getSettings()
    }
    return null
  })

  typedHandle('notification-clear-all', () => {
    notificationManager?.clearAllNotifications()
  })

  typedHandle('notification-clear', (_event, tag) => {
    notificationManager?.clearNotification(tag)
  })

  typedHandle('notification-is-enabled', () => {
    return notificationManager?.isEnabled() ?? false
  })

  typedHandle('notification-get-active-count', () => {
    return notificationManager?.getActiveNotificationCount() ?? 0
  })

  // Configuration management IPC handlers (Zod-validated)
  typedHandle('config-get', (_event, path, defaultValue) => {
    if (!configManager) {
      throw new Error('Configuration manager not initialized')
    }
    // Defense in depth: typedHandle validates this first, but the handler also
    // refuses unknown LiveEditor subpaths before ConfigManager can read notes.
    if (!isRendererReadableConfigPath(path)) {
      throw new Error('LiveEditor note content requires its dedicated channel')
    }
    const value = configManager.get(path, defaultValue)
    if (path === 'liveEditor') {
      return redactLiveEditorNotes({ liveEditor: value }).liveEditor
    }
    return value
  })

  typedHandle('config-set', (_event, path, value) => {
    if (!configManager) {
      throw new Error('Configuration manager not initialized')
    }
    return configManager.set(path, value)
  })

  typedHandle('config-get-all', () => {
    if (!configManager) {
      return {}
    }
    return redactLiveEditorNotes(
      configManager.getAll() as Record<string, unknown>,
    )
  })

  typedHandle('config-get-section', (_event, section) => {
    if (!configManager) {
      return null
    }
    const result = configManager.getSection(
      section as keyof ReturnType<typeof configManager.getAll>,
    )
    if (section === 'liveEditor' && result && typeof result === 'object') {
      // Strip free-text notes from the generic getter; anyone asking for the
      // LiveEditor section gets only metadata. The dedicated `live-editor-note-get`
      // channel is the single read path for note text.
      const { notes: _notes, ...rest } = result as Record<string, unknown>
      return rest as Record<string, unknown>
    }
    return result as Record<string, unknown> | null
  })

  typedHandle('config-update', (_event, updates) => {
    if (!configManager) {
      return false
    }
    return configManager.update(updates)
  })

  typedHandle('config-reset', () => {
    if (!configManager) {
      return false
    }
    return configManager.reset()
  })

  typedHandle('config-reset-section', (_event, section) => {
    if (!configManager) {
      return false
    }
    return configManager.resetSection(
      section as keyof ReturnType<typeof configManager.getAll>,
    )
  })

  typedHandle('config-validate', () => {
    if (!configManager) {
      return {
        isValid: false,
        errors: ['Configuration manager not initialized'],
      }
    }
    return configManager.validate()
  })

  // Security: filesystem paths are chosen by main-process dialogs, never
  // accepted from renderer input. A compromised renderer can trigger the
  // dialog but cannot write/read arbitrary paths.
  typedHandle('config-export', async () => {
    if (!configManager) {
      return false
    }
    // No main window to parent the dialog to after T18; an unparented save
    // dialog is the behavior the previous `?? undefined` fallback already took.
    const result = await dialog.showSaveDialog({
      title: 'Export configuration',
      defaultPath: 'corelive-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) {
      return false
    }
    return configManager.exportConfig(result.filePath)
  })

  typedHandle('config-import', async () => {
    if (!configManager) {
      return false
    }
    // Unparented open dialog after T18 (see config-export above).
    const result = await dialog.showOpenDialog({
      title: 'Import configuration',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) {
      return false
    }
    return configManager.importConfig(filePath)
  })

  typedHandle('config-backup', () => {
    if (!configManager) {
      return null
    }
    return configManager.backup()
  })

  typedHandle('config-get-paths', () => {
    if (!configManager) {
      return { config: '', windowState: '', directory: '' }
    }
    return configManager.getConfigPaths()
  })

  // Security: path is resolved from ConfigManager only — renderer cannot supply
  // an arbitrary filesystem target (same rule as config-export/import).
  typedHandle('config-open', async () => {
    if (!configManager) {
      return false
    }
    const { config: configPath } = configManager.getConfigPaths()
    return openConfigFile(configPath)
  })

  // Authentication IPC handlers; `auth-set-user` from the login window also
  // triggers the native login → LiveEditor handoff.
  registerAuthHandlers({
    getActiveUser: () => activeUser,
    setActiveUser,
    clearActiveUser: () => {
      activeUser = null
    },
    getWindowManager: () => windowManager ?? null,
  })

  // Settings window IPC handlers
  typedHandle('settings:open', () => {
    try {
      if (windowManager) {
        windowManager.openSettings()
        return true
      }
      log.warn('settings:open - windowManager not available')
      return false
    } catch (error) {
      log.error('settings:open - Failed to open settings window:', error)
      return false
    }
  })

  typedHandle('settings:close', () => {
    try {
      if (windowManager) {
        windowManager.closeSettings()
        return true
      }
      log.warn('settings:close - windowManager not available')
      return false
    } catch (error) {
      log.error('settings:close - Failed to close settings window:', error)
      return false
    }
  })

  // Hide App Icon (Dock visibility) IPC handler - macOS only
  typedHandle('settings:setHideAppIcon', (_event, hide) => {
    try {
      // This API is macOS-only - check platform first
      if (process.platform !== 'darwin') {
        log.info('settings:setHideAppIcon - Not supported on this platform')
        return true // Return true to indicate success (no-op on non-macOS)
      }

      // accessory = no Dock icon / no Cmd+Tab entry; regular = normal app.
      app.setActivationPolicy(hide ? 'accessory' : 'regular')

      // Persist so the main process re-applies this at the NEXT boot, before any
      // window shows — the renderer round-trip (ElectronStartupSync) that pushes
      // this can be slow or never run on a cold Start-at-Login restart (#112).
      // This write is also what SEEDS config for an existing user whose
      // hideAppIcon only ever lived in renderer localStorage.
      //
      // Propagate the write result: if it fails (unwritable userData / full disk)
      // the runtime policy still applied, but the next cold restart would read the
      // OLD value and reintroduce #112 — so report the durable save failed instead
      // of claiming success. The renderer gates its Redux/localStorage update on
      // this boolean (ElectronSettingsPage.tsx:88), so a false keeps the toggle
      // honest (not shown as saved).
      const persisted = configManager
        ? configManager.set(HIDE_APP_ICON_CONFIG_PATH, hide)
        : false

      log.info(
        `Dock icon visibility changed: ${hide ? 'hidden' : 'visible'} (persisted: ${persisted})`,
      )
      return persisted
    } catch (error) {
      log.error(
        'settings:setHideAppIcon - Failed to change dock icon visibility:',
        error,
      )
      return false
    }
  })

  // Show in Menu Bar IPC handler — shows/hides the tray (menu-bar) icon. Boot
  // always (re)creates the tray (SystemIntegrationErrorHandler), but the
  // renderer's ElectronStartupSync re-pushes the persisted Redux/localStorage
  // value at every launch, so an "off" choice survives restarts: the tray
  // appears at boot, then the startup sync hides it (the same correct-after-
  // boot pattern as setHideAppIcon). See SystemTrayManager.setMenuBarVisible.
  typedHandle('settings:setShowInMenuBar', async (_event, show) => {
    try {
      if (!systemTrayManager) {
        log.warn('settings:setShowInMenuBar - systemTrayManager not available')
        return false
      }
      const didApply = await systemTrayManager.setMenuBarVisible(show)
      log.info(
        `settings:setShowInMenuBar - Menu bar ${show ? 'shown' : 'hidden'}: ${didApply}`,
      )
      return didApply
    } catch (error) {
      log.error(
        'settings:setShowInMenuBar - Failed to change menu bar visibility:',
        error,
      )
      return false
    }
  })

  // Start at Login IPC handler
  typedHandle('settings:setStartAtLogin', (_event, startAtLogin) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: startAtLogin,
        openAsHidden: false,
      })
      log.info(`Start at login setting changed: ${startAtLogin}`)
      return true
    } catch (error) {
      log.error(
        'settings:setStartAtLogin - Failed to change start at login setting:',
        error,
      )
      return false
    }
  })

  // Get current login item settings
  typedHandle('settings:getLoginItemSettings', () => {
    try {
      return app.getLoginItemSettings()
    } catch (error) {
      log.error(
        'settings:getLoginItemSettings - Failed to get login item settings:',
        error,
      )
      return { openAtLogin: false }
    }
  })

  // Reset the Settings popover to default size and re-anchor to the tray.
  typedHandle('settings:resetPopoverSize', () => {
    try {
      if (windowManager) {
        windowManager.resetSettingsPopoverSize()
        return true
      }
      log.warn('settings:resetPopoverSize - windowManager not available')
      return false
    } catch (error) {
      log.error(
        'settings:resetPopoverSize - Failed to reset popover size:',
        error,
      )
      return false
    }
  })

  // OAuth IPC handlers for browser-based OAuth flows
  // OAuth IPC handlers (Zod-validated)
  // Used when WebView OAuth is blocked (e.g., Google OAuth)
  typedHandle('oauth-start', async (event, provider) => {
    try {
      const oauth = ensureOAuthManager()
      if (!oauth) {
        throw new Error('OAuth manager not initialized')
      }
      if (!oauth.isProviderSupported(provider)) {
        throw new Error(`Unsupported OAuth provider: ${provider}`)
      }
      // Pass the initiating renderer so the resulting one-time sign-in ticket is
      // pushed back to THIS window only (single recipient → no double-consume).
      return await oauth.startOAuthFlow(provider, event.sender)
    } catch (error) {
      log.error('Failed to start OAuth flow:', error)
      return {
        state: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  typedHandle('oauth-get-supported-providers', () => {
    const oauth = ensureOAuthManager()
    return oauth ? oauth.getSupportedProviders() : []
  })

  typedHandle('oauth-cancel', (_event, state) => {
    const oauth = ensureOAuthManager()
    if (oauth) {
      oauth.cancelPendingFlow(state ?? null)
    }
    return true
  })

  typedHandle('oauth-get-pending-token', (event) => {
    const oauth = ensureOAuthManager()
    // Pass the requesting window so the PULL releases the one-time ticket only
    // to the window that STARTED the flow (scoped in getPendingSignInToken).
    return oauth ? oauth.getPendingSignInToken(event.sender) : null
  })

  typedHandle('oauth-clear-pending-token', () => {
    const oauth = ensureOAuthManager()
    if (oauth) {
      oauth.clearPendingSignInToken()
    }
    return true
  })

  // Performance monitoring IPC handlers (typed)
  typedHandle('performance-get-metrics', () => {
    return {
      optimizer: performanceOptimizer.getMetrics(),
      memory: memoryProfiler.getStatistics(),
      lazyLoad: lazyLoadManager.getStatus(),
    }
  })

  typedHandle('performance-trigger-cleanup', () => {
    memoryProfiler.performCleanup('manual')
    return true
  })

  typedHandle('performance-get-startup-time', () => {
    return Date.now() - performanceOptimizer.startupMetrics.startTime
  })

  // Menu action IPC handlers
  typedHandle('menu-action', (_event, action) => {
    if (menuManager) {
      menuManager.handleMenuAction({ action })
    }
  })

  // Shortcuts IPC handlers
  typedHandle('shortcuts-get-registered', () => {
    if (!shortcutManager) {
      return []
    }
    const registered = shortcutManager.getRegisteredShortcuts()
    return Object.entries(registered).map(([id, accelerator]) => ({
      id,
      accelerator,
      description: id,
      enabled: true,
      isGlobal: GLOBAL_SHORTCUT_IDS.includes(id),
    }))
  })

  typedHandle('shortcuts-get-defaults', () => {
    if (!shortcutManager) {
      return []
    }
    const defaults = shortcutManager.getDefaultShortcuts()
    return Object.entries(defaults)
      .filter(([key]) => key !== 'enabled')
      .map(([id, accelerator]) => ({
        id,
        accelerator: accelerator as string,
        description: id,
        enabled: true,
        isGlobal: GLOBAL_SHORTCUT_IDS.includes(id),
      }))
  })

  typedHandle('shortcuts-update', (_event, shortcuts) => {
    if (!shortcutManager) {
      return false
    }
    const didUpdate = shortcutManager.updateShortcuts(shortcuts)
    // Keep the tray's displayed hotkeys in sync with the rebind.
    if (didUpdate) {
      systemTrayManager?.refreshTrayMenu()
    }
    return didUpdate
  })

  typedHandle('shortcuts-register', (_event, definition) => {
    if (!shortcutManager) {
      return false
    }
    const handler = shortcutManager.getHandlerForShortcut(definition.id)
    if (!handler) {
      return false
    }
    return shortcutManager.registerShortcut(
      definition.accelerator,
      definition.id,
      handler,
    )
  })

  typedHandle('shortcuts-unregister', (_event, id) => {
    if (!shortcutManager) {
      return false
    }
    return shortcutManager.unregisterShortcut(id)
  })

  typedHandle('shortcuts-is-registered', (_event, accelerator) => {
    if (!shortcutManager) {
      return false
    }
    return shortcutManager.isShortcutRegistered(accelerator)
  })

  typedHandle('shortcuts-enable', () => {
    if (!shortcutManager) {
      return false
    }
    shortcutManager.enable()
    return true
  })

  typedHandle('shortcuts-disable', () => {
    if (!shortcutManager) {
      return false
    }
    shortcutManager.disable()
    return true
  })

  typedHandle('shortcuts-get-stats', () => {
    if (!shortcutManager) {
      return {
        totalRegistered: 0,
        isEnabled: false,
        platform: process.platform,
        shortcuts: {},
      }
    }
    return shortcutManager.getStats()
  })

  // #125 native key-tap freeze-safety: surface tap health + manual re-enable to
  // the renderer's "disabled after a failed start — re-enable" control.
  typedHandle('shortcuts-get-native-tap-status', () => {
    if (!shortcutManager) {
      // ShortcutManager not constructed yet: read the persisted brick-guard from
      // disk so an early renderer poll during a latch-blocked launch still sees
      // the block (and keeps the re-enable affordance) instead of a false
      // "not blocked" (codex review). `active` is false — nothing is live yet.
      return {
        available: false,
        latchBlocked: isNativeTapLatchSet(),
        active: false,
      }
    }
    return shortcutManager.getNativeTapStatus()
  })

  typedHandle('shortcuts-reenable-native-tap', () => {
    if (!shortcutManager) {
      // Re-enable can't act before ShortcutManager exists, but report the real
      // persisted latch state so the renderer doesn't conclude the block cleared.
      return {
        available: false,
        latchBlocked: isNativeTapLatchSet(),
        active: false,
      }
    }
    return shortcutManager.reenableNativeTap()
  })

  // Deep linking IPC handlers
  typedHandle('deep-link-generate', (_event, action, params) => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.generateDeepLink(action, params)
    }
    return null
  })

  typedHandle('deep-link-get-examples', () => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.getExampleUrls()
    }
    return null
  })

  typedHandle('deep-link-handle-url', async (_event, url) => {
    const manager = ensureDeepLinkManager()
    if (manager) {
      return manager.handleDeepLink(url)
    }
    return false
  })

  // Auto-updater IPC handlers (Zod-validated)
  typedHandle('updater-check-for-updates', () => {
    if (autoUpdater) {
      autoUpdater.manualCheckForUpdates()
      return true
    }
    return false
  })

  typedHandle('updater-quit-and-install', () => {
    if (autoUpdater) {
      autoUpdater.quitAndInstall()
      return true
    }
    return false
  })

  typedHandle('updater-get-status', () => {
    if (autoUpdater) {
      return autoUpdater.getUpdateStatus()
    }
    return {
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
    }
  })
}

// ============================================================================
// Application Lifecycle
// ============================================================================

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
 */
const gotTheLock = app.requestSingleInstanceLock()

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
  app
    .whenReady()
    .then(async () => {
      // Setup security policies before any window creation
      setupSecurity()

      // Boot the Electron companion (auxiliary panels only; main is retired).
      await createWindow()

      /**
       * macOS-specific: 'activate' event.
       * Fired when user clicks dock icon. By convention, macOS apps
       * recreate windows instead of quitting when all windows are closed.
       */
      app.on('activate', () => {
        const allWindows = BrowserWindow.getAllWindows()
        // No windows exist at all (every panel was closed; the app stayed
        // tray-resident per window-all-closed).
        if (allWindows.length === 0) {
          // If the app already booted once, the manager stack is live. Re-running
          // the full createWindow() here would build a SECOND ConfigManager /
          // WindowManager / tray / shortcut stack on top of it with no teardown —
          // leaking a duplicate tray icon and clashing global-shortcut
          // registrations. Just surface LiveEditor (or the login window when
          // signed out) through the existing WindowManager.
          if (windowManager) {
            windowManager.restoreFromTray()
            return
          }
          // Genuinely uninitialized (boot never completed): recreate from scratch.
          // createWindow is async; leaving the promise unhandled would swallow
          // a boot failure here silently, so log any rejection instead.
          void createWindow().catch((error: unknown) => {
            log.error('Failed to recreate window on activate:', error)
          })
          return
        }
        // Windows exist but no *real* one is visible — e.g. a panel-only startup
        // whose panel was later closed, or every panel hidden to the tray.
        // The startup pill is excluded: it is shown via `showInactive()` so
        // `isVisible()` reports true, but it carries no surface the user can act
        // on, so counting it would wrongly suppress the dock-click reveal. A dock
        // click must always surface something, so surface LiveEditor (or the
        // login window when signed out) via restoreFromTray.
        //
        // The startup pill is retired with the main window (T18), so any visible
        // window now counts as a real one.
        const isAnyRealWindowVisible = allWindows.some((window) =>
          window.isVisible(),
        )
        if (!isAnyRealWindowVisible) {
          windowManager?.restoreFromTray()
        }
      })
    })
    .catch((bootError: unknown) => {
      // Last-resort backstop: a throw anywhere in the boot chain (corrupt config
      // read, window creation, security setup) would otherwise be an unhandled
      // rejection that leaves the user staring at nothing. Fail loud — log,
      // surface a dialog, and quit rather than leaving a silent blank boot.
      log.error('Fatal error during app startup:', bootError)
      dialog.showErrorBox(
        'CoreLive failed to start',
        `An unexpected error occurred during startup:\n\n${String(bootError)}`,
      )
      app.quit()
    })
}

/**
 * Window close behavior for macOS.
 *
 * macOS convention: closing all windows keeps the app alive. With the main
 * window retired, CoreLive is a tray-resident companion (LiveEditor / login /
 * Settings) — closing every panel leaves it running in the menu bar; the user
 * quits explicitly via Cmd+Q, the app menu, or the tray's Quit. (T10 / design
 * Open Question #6: stay tray-resident, never quit on the last panel close.)
 *
 * This handler is intentionally empty to follow that guideline.
 *
 * Summon-surface note (why staying alive at zero windows is not a soft-lock):
 * in the default config at least one route back to a window always remains —
 * the Dock icon re-opens via the `activate` handler above, the always-registered
 * global shortcut Alt+Space (`toggleLiveEditor`) creates + shows LiveEditor from
 * anywhere, and the tray's menu offers a restore item. Becoming truly headless
 * needs the exotic combination of Hide-App-Icon (accessory Dock) AND
 * Show-in-Menu-Bar=false (tray destroyed) AND rebinding Alt+Space to an empty /
 * unregistrable accelerator — narrow enough to accept here; revisit (e.g. force
 * the tray to stay while the Dock is hidden) if it is ever reported.
 */
app.on('window-all-closed', () => {
  // Stay tray-resident: no app.quit() here. Quitting is always explicit
  // (Cmd+Q / app menu / tray Quit), never an implicit last-panel-close side effect.
})

/**
 * Application cleanup handler.
 *
 * Ensures graceful shutdown by:
 * 1. Saving user state (window positions, settings)
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
  if (autoUpdater) {
    autoUpdater.cleanup()
  }
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
 * - Login, LiveEditor and Settings windows
 * - Any webviews (if used)
 * - DevTools windows
 */
app.on('web-contents-created', (_event, contents: WebContents) => {
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
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  contents.on('did-create-window', () => {
    // Defense-in-depth telemetry if a future Electron path creates a popup
    // despite the window-open handler above.
    log.warn('Blocked unexpected renderer-created window')
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
  contents.on(
    'will-attach-webview',
    (
      _event: ElectronEvent,
      webPreferences: Electron.WebPreferences,
      _params: Record<string, string>,
    ) => {
      // Remove preload scripts - they could contain malicious code
      delete webPreferences.preload

      // Enforce security settings
      webPreferences.nodeIntegration = false // No Node.js access
      webPreferences.contextIsolation = true // Isolate contexts
    },
  )

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
  contents.on(
    'will-navigate',
    (event: ElectronEvent, navigationUrl: string) => {
      const parsedUrl = new URL(navigationUrl)

      if (
        parsedUrl.protocol !== 'http:' &&
        parsedUrl.protocol !== 'https:' &&
        parsedUrl.protocol !== 'file:'
      ) {
        event.preventDefault()
      }
    },
  )
})

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

import {
  app,
  BrowserWindow,
  dialog,
  session,
  Notification,
  screen,
} from 'electron'
import type { WebContents, Event as ElectronEvent } from 'electron'

import type { AutoUpdater as AutoUpdaterType } from './AutoUpdater'
import { ConfigManager } from './ConfigManager'
import type { DeepLinkManager as DeepLinkManagerType } from './DeepLinkManager'
import { typedHandle } from './ipc/typedHandle'
import { typedSend } from './ipc/typedSend'
import { IPCErrorHandler } from './IPCErrorHandler'
import { lazyLoadManager } from './LazyLoadManager'
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
import {
  DEFAULT_STARTUP_WINDOW_CONFIG,
  type AuthUserPayload,
  type WindowBounds,
} from './types/ipc'
import { resolveRemoteDebuggingPort } from './utils/debugMode'
import { WindowManager } from './WindowManager'
import {
  WindowStateManager,
  type WindowType,
  type SnapEdge,
} from './WindowStateManager'

// ============================================================================
// Type Definitions
// ============================================================================

// `AuthUserPayload` from `./types/ipc` is the canonical shape — single source of truth.

/** Performance optimization configuration */
interface OptimizationConfig {
  enableMemoryMonitoring: boolean
  [key: string]: unknown
}

/**
 * Validates and converts a string to WindowType.
 * Returns 'main' as default if the input is invalid.
 *
 * @param value - Input value to validate
 * @returns Valid WindowType
 */
function toWindowType(value: unknown): WindowType {
  if (value === 'main' || value === 'floating' || value === 'braindump') {
    return value
  }
  return 'main'
}

// ============================================================================
// Remote Debugging (Playwright E2E + opt-in prod debug — Issue #61)
// ============================================================================

/**
 * Open a Chrome DevTools Protocol port only when a debug opt-in is set.
 *
 * Two independent levers, both resolved by `resolveRemoteDebuggingPort`:
 * - `PLAYWRIGHT_REMOTE_DEBUGGING_PORT` — the E2E suite's lever (unchanged).
 * - `CORELIVE_DEBUG=1` — the prod debug opt-in; opens the default port (9222)
 *   unless `CORELIVE_REMOTE_DEBUGGING_PORT` overrides it.
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
// (The `ELECTRON_RENDERER_URL` block below also throws at module scope but is
// left fail-loud on purpose: it's an E2E-only knob, so a typo there should abort
// the test run rather than silently load production.)
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

/**
 * E2E renderer URL override.
 *
 * The Playwright Electron E2E suite (`e2e/electron/*.spec.ts`) loads the
 * renderer from a local Next.js server (`http://localhost:3011`) so tests
 * never hit production. To swap the URL without flipping the rest of the
 * dev/prod surface (CSP `'unsafe-eval'`, optimization level), we accept a
 * dedicated `ELECTRON_RENDERER_URL` env var. Production runs leave this
 * unset and continue to use `https://corelive.app`.
 *
 * Validation: hostname must be exactly `localhost` or `127.0.0.1` and the
 * protocol must be `http:`. We parse with `URL` (instead of `startsWith`)
 * so that subdomain tricks like `http://localhost.attacker.com` cannot
 * slip past the guard. This is defense-in-depth before the value reaches
 * `WindowManager.createMainWindow`.
 */
if (process.env.ELECTRON_RENDERER_URL) {
  let parsedRendererUrl: URL
  try {
    parsedRendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
  } catch {
    throw new Error(
      `ELECTRON_RENDERER_URL must be a valid URL — got ` +
        `"${process.env.ELECTRON_RENDERER_URL}".`,
    )
  }
  if (
    parsedRendererUrl.protocol !== 'http:' ||
    (parsedRendererUrl.hostname !== 'localhost' &&
      parsedRendererUrl.hostname !== '127.0.0.1')
  ) {
    throw new Error(
      `ELECTRON_RENDERER_URL must use http: with hostname "localhost" or ` +
        `"127.0.0.1" — got "${parsedRendererUrl.protocol}//${parsedRendererUrl.hostname}". ` +
        `This guard prevents accidental production renderer load during E2E.`,
    )
  }
}

// ============================================================================
// Environment Flags
// ============================================================================

/**
 * Environment flags determine behavior differences between development and production.
 * These affect security policies, performance optimizations, and debugging features.
 */
const isDev = process.env.NODE_ENV === 'development'
const isTestEnvironment = process.env.NODE_ENV === 'test'

/**
 * Test-only userData override for Playwright Electron E2E isolation.
 */
if (isTestEnvironment && process.env.ELECTRON_E2E_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_E2E_USER_DATA_DIR)
}

/**
 * E2E system-integration kill switch.
 *
 * Linux CI runs Electron under `xvfb` (virtual display). Several lazy-loaded
 * managers are unsuitable in that environment:
 * - `SystemTrayManager` — no system tray on a headless display
 * - `NotificationManager` — DBus / libnotify is flaky/absent
 * - `ShortcutManager` — `globalShortcut` races on Linux WMs
 * - `DeepLinkManager` — protocol handlers can't register without a desktop
 *
 * When this flag is `'true'`, `deferredInit` skips all four. The renderer
 * still loads, IPC for window controls still works, and tests can exercise
 * the integrated startup path without flake from the system surface.
 *
 * Auto-coupling: setting `ELECTRON_RENDERER_URL` (E2E renderer override)
 * implies the kill switch. Pointing the renderer at a local URL while
 * still registering the tray icon and `corelive://` protocol handler
 * against the host OS would leak real OS state from a test run — so the
 * two flags are coupled by default. Setting both explicitly is also fine.
 *
 * Defaults to `false` (production behavior). Humans can override locally
 * via `ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION=true` to repro a tray bug
 * without the URL flag.
 */
const disableSystemIntegration =
  process.env.ELECTRON_E2E_DISABLE_SYSTEM_INTEGRATION === 'true' ||
  Boolean(process.env.ELECTRON_RENDERER_URL)

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
 * Ensures WindowStateManager is available before use.
 *
 * Window state persistence is critical for user experience - users expect
 * windows to appear where they left them. This helper prevents crashes
 * if state management is accessed before initialization.
 *
 * @returns The initialized window state manager
 * @throws Error if manager hasn't been initialized yet
 */
function ensureWindowStateManagerInstance(): WindowStateManager {
  if (!windowStateManager) {
    throw new Error('Window state manager not initialized')
  }
  return windowStateManager
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
 * Retrieves a BrowserWindow instance by type, creating it if necessary.
 *
 * Electron apps can have multiple windows with different purposes:
 * - Main window: Primary application interface
 * - Floating window: Always-on-top utility window for quick access
 *
 * @param windowType - Type of window to retrieve ('main' or 'floating')
 * @returns The requested window or null if unavailable
 */
function getBrowserWindowForType(
  windowType: string = 'main',
): BrowserWindow | null {
  // Can't get windows if manager isn't initialized
  if (!windowManager) {
    return null
  }

  // Handle BrainDump panel — never auto-create from a state operation; the
  // panel is created on demand by user gesture (menu/tray/shortcut).
  if (windowType === 'braindump') {
    return windowManager.hasBrainDumpWindow?.()
      ? (windowManager.getBrainDumpWindow?.() ?? null)
      : null
  }

  // Handle floating navigator window
  if (windowType === 'floating') {
    // Create floating window on-demand if it doesn't exist
    if (!windowManager.hasFloatingNavigator()) {
      try {
        windowManager.createFloatingNavigator()
      } catch (error) {
        // Non-fatal: floating window is optional feature
        log.warn(
          'Failed to create floating navigator window:',
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    // Safe property access in case getter doesn't exist
    return windowManager.getFloatingNavigator
      ? windowManager.getFloatingNavigator()
      : null
  }

  // Only return the main window for an explicit 'main' request — falling back
  // here for unknown types lets a stray 'braindump' (or future addition)
  // silently mutate main-window state.
  if (windowType === 'main') {
    return windowManager.getMainWindow ? windowManager.getMainWindow() : null
  }

  return null
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
 * @param windowType - Type of window to sync ('main' or 'floating')
 */
function syncWindowBoundsToBrowserWindow(
  windowType: WindowType = 'main',
): void {
  try {
    const stateManager = ensureWindowStateManagerInstance()
    const state = stateManager.getWindowState(windowType)
    const targetWindow = getBrowserWindowForType(windowType)

    // Skip if state is missing or window is destroyed
    if (!state || !targetWindow || targetWindow.isDestroyed?.()) {
      return
    }

    const existingBounds = targetWindow.getBounds()
    const bounds: WindowBounds = {
      x:
        typeof state.x === 'number'
          ? state.x
          : typeof existingBounds.x === 'number'
            ? existingBounds.x
            : 0,
      y:
        typeof state.y === 'number'
          ? state.y
          : typeof existingBounds.y === 'number'
            ? existingBounds.y
            : 0,
      width:
        typeof state.width === 'number'
          ? state.width
          : typeof existingBounds.width === 'number'
            ? existingBounds.width
            : 800,
      height:
        typeof state.height === 'number'
          ? state.height
          : typeof existingBounds.height === 'number'
            ? existingBounds.height
            : 600,
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
    log.warn(
      'Failed to synchronize window bounds:',
      error instanceof Error ? error.message : String(error),
    )
  }
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
 *
 * Skipped entirely under `disableSystemIntegration` (E2E kill switch). The
 * `systemIntegrationErrorHandler` is also constructed inside this helper so
 * that the kill-switch path leaves NO partially-initialized handler — every
 * `if (systemIntegrationErrorHandler)` call site downstream becomes a clean
 * no-op rather than a half-wired surface.
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
  shortcutManager = new ShortcutManagerCls(
    windowManager,
    notificationManager,
    configManager,
  )
  log.info('✅ [DEFERRED] ShortcutManager loaded')

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
 *
 * Skipped under `disableSystemIntegration` since protocol registration
 * requires a real desktop session.
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

async function createWindow(): Promise<BrowserWindow> {
  // Start performance monitoring early to track startup metrics
  if (config.enableMemoryMonitoring) {
    memoryProfiler.startMonitoring()
  }

  /**
   * Critical initialization phase - these must complete before showing window.
   * Order matters here due to dependencies between managers.
   */
  const criticalInit = async (): Promise<{
    mainWindow: BrowserWindow
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

    // Initialize window state manager
    windowStateManager = new WindowStateManager(configManager)

    // Development uses local Next.js server, production uses web app.
    // The `ELECTRON_RENDERER_URL` env var (validated near the top of this
    // file) lets the Playwright E2E suite point the renderer at the local
    // Next.js server WITHOUT also flipping `isDev` — keeping CSP and
    // optimization level identical to production for high-fidelity tests.
    const serverUrl =
      process.env.ELECTRON_RENDERER_URL ??
      (isDev ? 'http://localhost:3011' : 'https://corelive.app')

    // Note: APIBridge no longer needed - Floating Navigator uses oRPC via web

    // Initialize window manager with server URL and managers
    windowManager = new WindowManager(
      serverUrl,
      configManager,
      windowStateManager,
    )

    // Create main window immediately for better perceived performance.
    // Panel-only startup configs (showMain === false) still create the window —
    // just hidden — so it can be revealed later from the tray or `activate`.
    const startupConfig = configManager.getSection('behavior').startup
    const mainWindow = windowManager.createMainWindow(startupConfig.showMain)

    // Open the auxiliary panels the user chose to start with. Each is created
    // hidden and revealed only once it authenticates (WindowManager's
    // nav-watch); a signed-out or failed panel surfaces the main window instead.
    if (startupConfig.showFloating) {
      windowManager.openStartupPanel('floating')
    }
    if (startupConfig.showBraindump) {
      windowManager.openStartupPanel('braindump')
    }

    // Panel-only launches (showMain === false) can leave NOTHING on screen for a
    // moment while each panel resolves its auth-gated load. Arm a tiny floating
    // "Opening CoreLive…" pill so the boot reads as "waking up", never "is it
    // broken?". Gated off under test/E2E (NODE_ENV === 'test') so the extra
    // window never perturbs window-count assertions.
    if (!startupConfig.showMain && !isTestEnvironment) {
      windowManager.armStartupPill()
    }

    performanceOptimizer.startupMetrics.windowsCreated++

    return { mainWindow, serverUrl }
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

      const mainWindowRef = windowManager.getMainWindow()
      log.debug(
        '🔧 [DEFERRED] Retrieved mainWindow from windowManager:',
        !!mainWindowRef,
      )

      if (menuManager && mainWindowRef) {
        menuManager.initialize(mainWindowRef, windowManager, configManager)
      }
      log.info('✅ [DEFERRED] MenuManager loaded')

      // System-integration stack (tray, notifications, shortcuts, error
      // handler) and deep-link stack are gated by the E2E kill switch.
      // Both are unreliable on a Linux xvfb display.
      if (disableSystemIntegration) {
        log.info(
          '🧪 [DEFERRED] disableSystemIntegration=true — skipping ' +
            'SystemIntegrationErrorHandler, tray, notifications, shortcuts, ' +
            'and deep link.',
        )
      } else {
        await loadSystemIntegrationStack()
      }

      // AutoUpdater is gated by NODE_ENV=test (NOT the kill switch) so the
      // production-build smoke run can still exercise the updater path.
      // Wrapped in its own try/catch so failure doesn't block startup.
      if (!isTestEnvironment) {
        try {
          const AutoUpdaterCls = (await lazyLoadManager.loadComponent(
            'AutoUpdater',
          )) as new (...args: unknown[]) => AutoUpdaterType
          autoUpdater = new AutoUpdaterCls()
          const mainWin = windowManager.getMainWindow()
          if (mainWin) {
            autoUpdater.setMainWindow(mainWin)
          }
        } catch (autoUpdaterError) {
          log.error('❌ Failed to initialize AutoUpdater:', autoUpdaterError)
        }
      } else {
        log.info('AutoUpdater initialization skipped in test environment')
      }

      if (!disableSystemIntegration) {
        await loadDeepLinkStack()
      }

      // Set up window close behavior after tray manager is loaded
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.on('close', (event: ElectronEvent) => {
          if (systemTrayManager) {
            systemTrayManager.handleWindowClose(event)
          }
        })
      }
    } catch (error) {
      log.error('❌ Deferred initialization failed:', error)
      // Continue without non-critical components
    }
  }

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
      log.error('❌ Main: Deferred initialization failed:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  })

  const { mainWindow } = criticalResult

  // Set up IPC handlers immediately (they handle lazy loading internally)
  setupIPCHandlers()

  return mainWindow
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
 * Strip user-authored BrainDump note text from a config snapshot before
 * exposing it via the generic `config-get-all` channel. The note map is
 * personal scratch content and only the dedicated `braindump-note-get`
 * channel should surface it. Any other window asking for the full config
 * sees only the BrainDump metadata (sync mode, opacity, shortcut, etc.).
 *
 * @param snapshot - The full config object as returned by `ConfigManager.getAll()`.
 * @returns A shallow clone with `braindump.notes` removed.
 */
function redactBrainDumpNotes(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const braindump = snapshot.braindump
  if (!braindump || typeof braindump !== 'object') return snapshot
  const { notes: _notes, ...rest } = braindump as Record<string, unknown>
  return { ...snapshot, braindump: rest }
}

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

  // Note: Todo IPC handlers removed - Floating Navigator uses oRPC via web app

  // Window management IPC handlers (Zod-validated)
  typedHandle('window-minimize', () => {
    if (!windowManager) {
      throw new Error('Window manager not initialized')
    }
    if (!windowManager.hasMainWindow()) {
      throw new Error('Main window not available')
    }
    windowManager.minimizeToTray()
    return true
  })

  typedHandle('window-close', () => {
    if (!windowManager) {
      throw new Error('Window manager not initialized')
    }
    if (!windowManager.hasMainWindow()) {
      throw new Error('Main window not available')
    }
    windowManager.minimizeToTray()
    return true
  })

  typedHandle('window-toggle-floating-navigator', () => {
    if (!windowManager) {
      throw new Error('Window manager not initialized')
    }
    windowManager.toggleFloatingNavigator()
    return true
  })

  typedHandle('window-state-get', (_event, windowType) => {
    const type = toWindowType(windowType)
    const stateManager = ensureWindowStateManagerInstance()
    return stateManager.getWindowState(type)
  })

  typedHandle('window-state-set', (_event, windowType, properties) => {
    const type = toWindowType(windowType)
    const stateManager = ensureWindowStateManagerInstance()
    stateManager.setWindowState(type, properties)
    syncWindowBoundsToBrowserWindow(type)
    return stateManager.getWindowState(type)
  })

  typedHandle('window-state-reset', (_event, windowType) => {
    const type = toWindowType(windowType)
    const stateManager = ensureWindowStateManagerInstance()
    stateManager.resetWindowState(type)
    syncWindowBoundsToBrowserWindow(type)
    return stateManager.getWindowState(type)
  })

  typedHandle('window-state-get-stats', () => {
    const stateManager = ensureWindowStateManagerInstance()
    return stateManager.getStats()
  })

  typedHandle(
    'window-state-move-to-display',
    (_event, windowType, displayId) => {
      const type = toWindowType(windowType)
      const stateManager = ensureWindowStateManagerInstance()
      const targetWindow = getBrowserWindowForType(type)
      return stateManager.moveWindowToDisplay(type, displayId, targetWindow)
    },
  )

  typedHandle('window-state-snap-to-edge', (_event, windowType, edge) => {
    const type = toWindowType(windowType)
    const stateManager = ensureWindowStateManagerInstance()
    const targetWindow = getBrowserWindowForType(type)
    return stateManager.snapWindowToEdge(type, edge as SnapEdge, targetWindow)
  })

  typedHandle('window-state-get-display', (_event, windowType) => {
    const type = toWindowType(windowType)
    const stateManager = ensureWindowStateManagerInstance()
    const display = stateManager.getWindowDisplay(type)
    if (!display) return null
    return {
      id: display.id,
      label: display.label || `Display ${display.id}`,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      touchSupport: display.touchSupport,
      monochrome: display.monochrome,
      accelerometerSupport: display.accelerometerSupport,
      colorSpace: display.colorSpace,
      colorDepth: display.colorDepth,
      depthPerComponent: display.depthPerComponent,
      isPrimary: display.id === screen.getPrimaryDisplay().id,
    }
  })

  typedHandle('window-state-get-all-displays', () => {
    const stateManager = ensureWindowStateManagerInstance()
    return stateManager.getAllDisplays()
  })

  // System tray IPC handlers
  typedHandle('window-show-floating-navigator', () => {
    if (windowManager) {
      windowManager.showFloatingNavigator()
    }
  })

  typedHandle('window-hide-floating-navigator', () => {
    if (windowManager) {
      windowManager.hideFloatingNavigator()
    }
  })

  typedHandle('floating-window-get-visible-on-all-workspaces', () => {
    if (!windowManager) return false
    return windowManager.getFloatingPanelsVisibleOnAllWorkspaces()
  })

  typedHandle(
    'floating-window-set-visible-on-all-workspaces',
    (_event, enabled) => {
      if (!windowManager) return false
      return windowManager.setFloatingPanelsVisibleOnAllWorkspaces(enabled)
    },
  )

  // Floating window control IPC handlers (Zod-validated)
  typedHandle('floating-window-close', () => {
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

  typedHandle('floating-window-minimize', () => {
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

  typedHandle('floating-window-toggle-always-on-top', () => {
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

  typedHandle('floating-window-get-bounds', () => {
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

  typedHandle('floating-window-set-bounds', (_event, bounds) => {
    try {
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

  typedHandle('floating-window-is-always-on-top', () => {
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

  // ────────────────────────────────────────────────────────────────────────
  // BrainDump Window IPC handlers
  //
  // Why a separate block: BrainDump is a frameless transparent panel with
  // its own preload; window/note/sync/category channels live together so the
  // contract between preload-braindump.ts and main.ts is easy to audit.
  // ────────────────────────────────────────────────────────────────────────
  typedHandle('window-toggle-braindump', () => {
    if (!windowManager) {
      throw new Error('Window manager not initialized')
    }
    windowManager.toggleBrainDump()
    return true
  })

  typedHandle('braindump-window-toggle', () => {
    if (!windowManager) return false
    windowManager.toggleBrainDump()
    return true
  })

  typedHandle('braindump-window-show', () => {
    if (!windowManager) return
    windowManager.showBrainDump()
  })

  typedHandle('braindump-window-hide', () => {
    if (!windowManager) return
    windowManager.hideBrainDump()
  })

  typedHandle('braindump-window-set-opacity', (_event, value) => {
    if (!windowManager) return 1
    return windowManager.setBrainDumpOpacity(value)
  })

  typedHandle('braindump-window-get-opacity', () => {
    if (!windowManager) return 1
    return windowManager.getBrainDumpOpacity()
  })

  typedHandle('braindump-window-get-bounds', () => {
    try {
      if (windowManager?.hasBrainDumpWindow()) {
        const win = windowManager.getBrainDumpWindow()
        if (win && !win.isDestroyed()) {
          return win.getBounds()
        }
      }
      return null
    } catch (error) {
      log.error('Failed to get BrainDump window bounds:', error)
      return null
    }
  })

  typedHandle('braindump-window-set-bounds', (_event, bounds) => {
    try {
      if (windowManager?.hasBrainDumpWindow()) {
        const win = windowManager.getBrainDumpWindow()
        if (win && !win.isDestroyed()) {
          win.setBounds(bounds)
        }
      }
      return true
    } catch (error) {
      log.error('Failed to set BrainDump window bounds:', error)
      return false
    }
  })

  // Per-category note text (persisted in `braindump.notes[<categoryId>]`).
  typedHandle('braindump-note-get', (_event, categoryId) => {
    if (!configManager) return ''
    const notes = configManager.get<Record<string, string>>(
      'braindump.notes',
      {},
    )
    return notes?.[String(categoryId)] ?? ''
  })

  typedHandle('braindump-note-set', (_event, categoryId, text) => {
    if (!configManager) return false
    const notes = {
      ...(configManager.get<Record<string, string>>('braindump.notes', {}) ??
        {}),
      [String(categoryId)]: text,
    }
    configManager.set('braindump.notes', notes)
    return true
  })

  // Sync mode (mirror FloatingNav category selection).
  typedHandle('braindump-config-get-sync', () => {
    if (!configManager) return true
    return configManager.get<boolean>('braindump.syncMode', true) ?? true
  })

  typedHandle('braindump-config-set-sync', (_event, enabled) => {
    if (!configManager) return false
    configManager.set('braindump.syncMode', enabled)
    return true
  })

  typedHandle('braindump-config-get-shortcut', () => {
    if (!configManager) return ''
    return configManager.get<string>('braindump.shortcut', '') ?? ''
  })

  typedHandle('braindump-config-set-shortcut', (_event, accelerator) => {
    if (!configManager) return false
    // Try to register first; only persist on success so the renderer's
    // returned boolean accurately reflects whether the new accelerator is
    // live.
    const previous = configManager.get<string>('braindump.shortcut', '') ?? ''
    if (shortcutManager) {
      try {
        const ok = shortcutManager.updateShortcuts({
          toggleBrainDump: accelerator,
        })
        if (!ok) {
          // Rollback so config and registered shortcut stay in sync.
          shortcutManager.updateShortcuts({ toggleBrainDump: previous })
          return false
        }
      } catch (error) {
        log.error('Failed to update BrainDump shortcut:', error)
        return false
      }
    }
    configManager.set('braindump.shortcut', accelerator)
    return true
  })

  typedHandle('braindump-config-get-last-category', () => {
    if (!configManager) return null
    return (
      configManager.get<number | null>('braindump.lastCategoryId', null) ?? null
    )
  })

  typedHandle('braindump-config-set-last-category', (_event, categoryId) => {
    if (!configManager) return false
    configManager.set('braindump.lastCategoryId', categoryId)

    // Broadcast to BrainDump window so its `on('braindump-category-changed')`
    // listener mirrors the new selection without round-tripping config.
    const brainDumpWin = windowManager?.getBrainDumpWindow()
    if (brainDumpWin && !brainDumpWin.isDestroyed()) {
      typedSend(brainDumpWin.webContents, 'braindump-category-changed', {
        categoryId,
      })
    }
    return true
  })

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

  typedHandle('notification-get-preferences', () => {
    if (notificationManager) {
      return notificationManager.getPreferences()
    }
    return null
  })

  typedHandle('notification-update-preferences', (_event, preferences) => {
    if (notificationManager) {
      notificationManager.updatePreferences(preferences)
      return notificationManager.getPreferences()
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
    return configManager.get(path, defaultValue)
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
    return redactBrainDumpNotes(
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
    if (section === 'braindump' && result && typeof result === 'object') {
      // Strip free-text notes from the generic getter; anyone asking for the
      // BrainDump section gets only metadata. The dedicated `braindump-note-get`
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
    const mainWindow = windowManager.getMainWindow()
    const result = await dialog.showSaveDialog(
      mainWindow ?? (undefined as unknown as BrowserWindow),
      {
        title: 'Export configuration',
        defaultPath: 'corelive-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      },
    )
    if (result.canceled || !result.filePath) {
      return false
    }
    return configManager.exportConfig(result.filePath)
  })

  typedHandle('config-import', async () => {
    if (!configManager) {
      return false
    }
    const mainWindow = windowManager.getMainWindow()
    const result = await dialog.showOpenDialog(
      mainWindow ?? (undefined as unknown as BrowserWindow),
      {
        title: 'Import configuration',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      },
    )
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

  // Authentication IPC handlers (basic implementations for testing)
  typedHandle('auth-get-user', () => {
    return activeUser
  })

  typedHandle('auth-set-user', async (_event, user) => {
    try {
      return await setActiveUser(user)
    } catch (error) {
      log.error('Failed to set active user:', error)
      throw error
    }
  })

  typedHandle('auth-logout', () => {
    activeUser = null
    return true
  })

  typedHandle('auth-is-authenticated', () => {
    return Boolean(activeUser)
  })

  typedHandle('auth-sync-from-web', async (_event, authData) => {
    try {
      await setActiveUser(authData)
      return true
    } catch (error) {
      log.error('Failed to sync auth from web:', error)
      return false
    }
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

      if (hide) {
        // Hide from dock - app becomes "accessory" (no dock icon)
        app.setActivationPolicy('accessory')
      } else {
        // Show in dock - app becomes "regular" application
        app.setActivationPolicy('regular')
      }
      log.info(`Dock icon visibility changed: ${hide ? 'hidden' : 'visible'}`)
      return true
    } catch (error) {
      log.error(
        'settings:setHideAppIcon - Failed to change dock icon visibility:',
        error,
      )
      return false
    }
  })

  // Show in Menu Bar IPC handler — toggles the tray (menu-bar) icon live.
  // Note: live-only by design (T11 scope). The tray is re-created at the next
  // launch regardless of this setting; restart-persistence would be a separate
  // settings-mirror feature. See SystemTrayManager.setMenuBarVisible.
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

  // Persist which window(s) open at Electron launch. Writes through
  // ConfigManager.update() (flat dot-paths) so the >=1-true invariant runs:
  // a renderer cannot persist a boot-nothing config — all-false snaps showMain
  // back on before saving.
  typedHandle('settings:setStartupConfig', (_event, startup) => {
    try {
      if (!configManager) {
        log.error('settings:setStartupConfig - ConfigManager not initialized')
        return false
      }
      const didSave = configManager.update({
        'behavior.startup.showMain': startup.showMain,
        'behavior.startup.showBraindump': startup.showBraindump,
        'behavior.startup.showFloating': startup.showFloating,
      })
      log.info(
        'settings:setStartupConfig - startup window config saved',
        startup,
      )
      return didSave
    } catch (error) {
      log.error(
        'settings:setStartupConfig - Failed to save startup config:',
        error,
      )
      return false
    }
  })

  // Read side of the startup-window pair — lets the settings UI show the saved
  // choice without consuming the untyped `config.getSection` surface. Falls back
  // to the showMain-only default (which satisfies the >=1-true invariant) when
  // ConfigManager is somehow unavailable, so the UI never renders an all-off state.
  typedHandle('settings:getStartupConfig', () => {
    if (!configManager) {
      log.error('settings:getStartupConfig - ConfigManager not initialized')
      return { ...DEFAULT_STARTUP_WINDOW_CONFIG }
    }
    return configManager.getSection('behavior').startup
  })

  // OAuth IPC handlers for browser-based OAuth flows
  // OAuth IPC handlers (Zod-validated)
  // Used when WebView OAuth is blocked (e.g., Google OAuth)
  typedHandle('oauth-start', async (_event, provider) => {
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

  typedHandle('oauth-get-pending-token', () => {
    const oauth = ensureOAuthManager()
    return oauth ? oauth.getPendingSignInToken() : null
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
      isGlobal: id === 'toggleFloatingNavigator',
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
        isGlobal: id === 'toggleFloatingNavigator',
      }))
  })

  typedHandle('shortcuts-update', (_event, shortcuts) => {
    if (!shortcutManager) {
      return false
    }
    return shortcutManager.updateShortcuts(shortcuts)
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

  typedHandle('window-show-main', () => {
    if (windowManager) {
      windowManager.restoreFromTray()
    }
  })

  // Read-only snapshot of which auxiliary windows are visible right now, so the
  // settings UI can label a "Try it now" action accurately. has*() already
  // guards destroyed windows; isVisible() only runs on a live reference.
  typedHandle('window-get-aux-visibility', () => {
    if (!windowManager) {
      return { floating: false, braindump: false }
    }
    const floatingWindow = windowManager.hasFloatingNavigator()
      ? windowManager.getFloatingNavigator()
      : null
    const braindumpWindow = windowManager.hasBrainDumpWindow()
      ? windowManager.getBrainDumpWindow()
      : null
    return {
      floating: Boolean(floatingWindow?.isVisible()),
      braindump: Boolean(braindumpWindow?.isVisible()),
    }
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
    return { updateAvailable: false, updateDownloaded: false }
  })

  // Note: Quick todo operations removed - Floating Navigator uses oRPC via web app
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
  app
    .whenReady()
    .then(async () => {
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
        // Show window without stealing focus for better test stability — but only
        // when the startup config asks for the main window. A panel-only startup
        // (showMain === false) must stay hidden here too, otherwise E2E would
        // silently reveal a window the user opted out of.
        if (configManager.getSection('behavior').startup.showMain) {
          mainWindow.showInactive()
        }
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
        const allWindows = BrowserWindow.getAllWindows()
        // No windows exist at all: recreate from scratch (macOS convention).
        if (allWindows.length === 0) {
          // createWindow is async; floating the promise unhandled would swallow
          // a boot failure here silently, so log any rejection instead.
          void createWindow().catch((error: unknown) => {
            log.error('Failed to recreate window on activate:', error)
          })
          return
        }
        // Windows exist but no *real* one is visible — e.g. a panel-only startup
        // whose panel was later closed, or the main window minimized to the tray.
        // The startup pill is excluded: it is shown via `showInactive()` so
        // `isVisible()` reports true, but it carries no surface the user can act
        // on, so counting it would wrongly suppress the dock-click reveal. A dock
        // click must always surface something, so reveal the always-created main
        // window (restoreFromTray restores + shows + focuses it).
        //
        // The `windowManager?.` optional chain is intentional: if the manager is
        // somehow absent, `!undefined` is true so the pill (if any) counts as a
        // real window — the safe status-quo, since restoreFromTray would be a
        // no-op there anyway.
        const isAnyRealWindowVisible = allWindows.some(
          (window) =>
            window.isVisible() && !windowManager?.isStartupPill(window),
        )
        if (!isAnyRealWindowVisible) {
          windowManager?.restoreFromTray()
        }
      })
    })
    .catch((bootError: unknown) => {
      // Last-resort backstop: a throw anywhere in the boot chain (corrupt config
      // read, window creation, security setup) would otherwise be an unhandled
      // rejection that leaves the user staring at nothing. Fail loud — log always,
      // and in production surface a dialog + quit rather than a silent blank boot.
      // Stays quiet under test so a genuine boot failure surfaces via assertions,
      // not a modal that wedges the headless runner.
      log.error('Fatal error during app startup:', bootError)
      if (!isTestEnvironment) {
        dialog.showErrorBox(
          'CoreLive failed to start',
          `An unexpected error occurred during startup:\n\n${String(bootError)}`,
        )
        app.quit()
      }
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
 * - Main window
 * - Floating window
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

/**
 * @fileoverview Type-safe IPC channel definitions for Electron.
 *
 * This file defines all IPC channels used between main and renderer processes.
 * Type safety is enforced at compile time for both request and response types.
 *
 * @module electron/types/ipc
 */

import type { IpcMainInvokeEvent } from 'electron'

import type { LoadingStatus } from '../LazyLoadManager'
import type { MemoryStatistics } from '../MemoryProfiler'
import type { NativeTapStatus } from '../nativeShortcutEngine'
// Re-export so the preload barrel (`./types/ipc`) stays the single type surface
// the renderer bridge imports from — it never reaches into main-process modules.
export type { NativeTapStatus } from '../nativeShortcutEngine'
import type { PerformanceMetrics } from '../performance-config'
import type {
  DisplayInfo as WindowManagerDisplayInfo,
  WindowStats,
} from '../WindowStateManager'

// ============================================================================
// Shared Types
// ============================================================================

/** User data structure synchronized between Electron and web app */
export interface ElectronUser {
  id: string
  clerkId: string
  email: string
  firstName?: string | null
  lastName?: string | null
  imageUrl?: string | null
}

/**
 * Auth user payload exchanged on auth IPC channels.
 *
 * Required fields reflect what `setActiveUser` in main.ts actually reads:
 *  - `clerkId` is required (user identity)
 *  - `emailAddresses` is optional array (Clerk can expose multiple)
 *  - `firstName` may be null when Clerk user has no name
 *
 * The index signature mirrors the Zod schema's `.passthrough()`: renderer may
 * include richer Clerk fields (`id`, `email`, `lastName`, `imageUrl`, ...) and
 * they will be accepted at runtime. Unknown fields are ignored by main.
 */
export interface AuthUserPayload {
  clerkId: string
  emailAddresses?: string[]
  firstName?: string | null
  [extra: string]: unknown
}

/** Window bounds and state */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Extended window state including maximized/fullscreen flags */
export interface WindowState extends WindowBounds {
  isMaximized?: boolean
  isFullScreen?: boolean
  isMinimized?: boolean
  alwaysOnTop?: boolean
  displayId?: number
  lastSaved?: number
}

/**
 * Which window(s) Electron surfaces at launch — the source of truth for the
 * configurable-startup feature, read synchronously from config.json at
 * `app.whenReady()` before auth/DB exist. Lives here (a pure type module)
 * because ConfigManager imports fs/electron and cannot be a type dependency.
 *
 * Invariant: at least one boolean is always true (enforced in ConfigManager,
 * never the IPC handler, so generic config writes can't break it).
 */
export interface StartupWindowConfig {
  /** Open the Brain Dump panel (`/braindump`) at launch. */
  showBraindump: boolean
  /** Open the Floating Navigator (`/floating-navigator`) at launch. */
  showFloating: boolean
}

/**
 * Boot-safe startup default — the Floating Navigator opens (the front door
 * after the main window's retirement, T18). The single source of truth shared
 * by ConfigManager (factory default), both preload bridges, and the settings UI
 * so the "what opens at launch" default can never drift between surfaces. Always
 * satisfies the ≥1-true invariant. Spread it (`{ ...DEFAULT }`) at call sites
 * that need a mutable copy.
 *
 * @example
 * setStartup({ ...DEFAULT_STARTUP_WINDOW_CONFIG }) // => { showBraindump: false, showFloating: true }
 */
export const DEFAULT_STARTUP_WINDOW_CONFIG: StartupWindowConfig = {
  showBraindump: false,
  showFloating: true,
}

/**
 * Live visibility of the auxiliary (non-main) windows, read on demand from the
 * main process. Lets the settings UI reflect what is *actually* on screen now
 * (e.g. to label a "Try it now" action) rather than the persisted startup
 * setting, which can drift once a panel is opened/closed at runtime.
 *
 * Both flags require the window to both exist and be visible.
 */
export interface AuxWindowVisibility {
  /** The Floating Navigator window exists and is currently visible. */
  floating: boolean
  /** The Brain Dump window exists and is currently visible. */
  braindump: boolean
}

/** Display information (richer version from WindowStateManager) */
export type DisplayInfo = WindowManagerDisplayInfo

export type { WindowStats }

/**
 * Notification options safe to serialize across IPC.
 *
 * Contains only IPC-serializable fields — no callbacks. Used in all IPC
 * request/event payloads where notification options cross the main↔renderer
 * boundary. Callbacks (`onClick`, `onAction`) live in `NotificationOptions`
 * below, which extends this for in-process NotificationManager use only.
 */
export interface SerializableNotificationOptions {
  type?: 'info' | 'warning' | 'error' | 'success'
  silent?: boolean
  tag?: string
  urgency?: 'low' | 'normal' | 'critical'
  timeoutMs?: number
  icon?: string
  actions?: Array<{ type: 'button'; text: string }>
}

/**
 * Notification options for in-process NotificationManager use.
 *
 * Extends SerializableNotificationOptions with renderer-only callbacks that
 * must NOT be sent over IPC (functions aren't structured-clone serializable).
 */
export interface NotificationOptions extends SerializableNotificationOptions {
  /** Renderer-only callbacks (not serialized across IPC) */
  onClick?: () => Promise<void> | void
  onAction?: (actionIndex: number) => Promise<void> | void
}

/** Notification settings (matches NotificationManager) */
export interface NotificationSettingsState {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
  showInTray: boolean
  autoHide: boolean
  autoHideDelay: number
  position: 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft'
}

/** Tray icon states */
export type TrayIconState = 'default' | 'active' | 'notification' | 'disabled'

/** OAuth provider types */
export type OAuthProvider = 'google' | 'github' | 'apple'

/** OAuth flow result from main-process initiated flow */
export interface OAuthResult {
  state: string | null
  success: boolean
  error?: string
}

/** OAuth pending token */
export interface PendingSignInToken {
  token: string
  provider: string
}

/** Shortcut definition */
export interface ShortcutDefinition {
  id: string
  accelerator: string
  description: string
  enabled: boolean
  isGlobal: boolean
}

/** Config section types */
export type ConfigSection =
  | 'window'
  | 'notifications'
  | 'shortcuts'
  | 'general'
  | 'appearance'
  | 'tray'
  | 'behavior'
  | 'advanced'
  | 'braindump'

/** Window-state-managed window kinds (must mirror WindowStateManager support). */
export type ManagedWindowKind = 'main' | 'floating' | 'braindump'

/** Deep link examples */
export interface DeepLinkExamples {
  openTask: string
  createTask: string
  searchTasks: string
  openView: string
}

/** Updater status (matches AutoUpdater.getUpdateStatus()) */
export interface UpdaterStatus {
  updateAvailable: boolean
  updateDownloaded: boolean
  downloadProgress: UpdaterDownloadProgress | null
}

/** Normalized auto-update download progress sent from main to renderer. */
export interface UpdaterDownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// ============================================================================
// IPC Channel Definitions
// ============================================================================

/**
 * Type-safe IPC channel definitions.
 *
 * Each channel defines:
 * - request: The type of data sent from renderer to main
 * - response: The type of data returned from main to renderer
 *
 * @example
 * ```typescript
 * // Main process handler
 * handleIPC('auth-get-user', async () => {
 *   return authManager.getCurrentUser()
 * })
 *
 * // Renderer process call
 * const user = await window.electronAPI.auth.getUser()
 * ```
 */
export interface IPCChannels {
  // ──────────────────────────────────────────────────────────────────────────
  // Authentication
  // ──────────────────────────────────────────────────────────────────────────
  'auth-get-user': {
    request: void
    response: AuthUserPayload | null
  }
  'auth-set-user': {
    request: AuthUserPayload
    response: AuthUserPayload
  }
  'auth-logout': {
    request: void
    response: boolean
  }
  'auth-is-authenticated': {
    request: void
    response: boolean
  }
  'auth-sync-from-web': {
    request: AuthUserPayload
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OAuth
  // ──────────────────────────────────────────────────────────────────────────
  'oauth-start': {
    request: string
    response: OAuthResult
  }
  'oauth-get-supported-providers': {
    request: void
    response: string[]
  }
  'oauth-cancel': {
    request: [state?: string | null]
    response: boolean
  }
  'oauth-get-pending-token': {
    request: void
    response: PendingSignInToken | null
  }
  'oauth-clear-pending-token': {
    request: void
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Window Operations
  // ──────────────────────────────────────────────────────────────────────────
  'window-toggle-floating-navigator': {
    request: void
    response: boolean
  }
  'window-show-floating-navigator': {
    request: void
    response: void
  }
  'window-hide-floating-navigator': {
    request: void
    response: void
  }
  'window-show-main': {
    request: void
    response: void
  }
  /**
   * Toggle the BrainDump window. Available from any renderer (FloatingNav,
   * Main) — mirrors `window-toggle-floating-navigator`.
   */
  'window-toggle-braindump': {
    request: void
    response: boolean
  }
  /**
   * Read-only snapshot of which auxiliary windows are visible right now. Used
   * by the settings UI to label "Try it now" actions accurately. Never mutates
   * window state.
   */
  'window-get-aux-visibility': {
    request: void
    response: AuxWindowVisibility
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Window State Management
  // ──────────────────────────────────────────────────────────────────────────
  'window-state-get': {
    request: ManagedWindowKind
    response: WindowState | null
  }
  'window-state-set': {
    request: [ManagedWindowKind, Partial<WindowState>]
    response: WindowState | null
  }
  'window-state-reset': {
    request: ManagedWindowKind
    response: WindowState | null
  }
  'window-state-get-stats': {
    request: void
    response: WindowStats
  }
  'window-state-move-to-display': {
    request: [ManagedWindowKind, number]
    response: boolean
  }
  'window-state-snap-to-edge': {
    request: [
      ManagedWindowKind,
      (
        | 'left'
        | 'right'
        | 'top'
        | 'bottom'
        | 'top-left'
        | 'top-right'
        | 'bottom-left'
        | 'bottom-right'
        | 'maximize'
      ),
    ]
    response: boolean
  }
  'window-state-get-display': {
    request: ManagedWindowKind
    response: DisplayInfo | null
  }
  'window-state-get-all-displays': {
    request: void
    response: DisplayInfo[]
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Floating Window
  // ──────────────────────────────────────────────────────────────────────────
  'floating-window-get-visible-on-all-workspaces': {
    request: void
    response: boolean
  }
  'floating-window-set-visible-on-all-workspaces': {
    request: boolean
    response: boolean
  }
  'floating-window-close': {
    request: void
    response: boolean
  }
  'floating-window-minimize': {
    request: void
    response: boolean
  }
  /**
   * Floating Navigator → open the task app's Completed import surface (`/home`)
   * in the user's browser (T14). The full task app is web-only, so importing
   * happens in the browser, not a main-window dialog. No request payload: the
   * path is hard-coded in the main handler so the renderer cannot drive the URL.
   */
  'floating-open-import': {
    request: void
    response: void
  }
  'floating-window-toggle-always-on-top': {
    request: void
    response: boolean
  }
  'floating-window-get-bounds': {
    request: void
    response: WindowBounds | null
  }
  'floating-window-set-bounds': {
    request: WindowBounds
    response: boolean
  }
  'floating-window-is-always-on-top': {
    request: void
    response: boolean
  }
  /**
   * Persisted Settings value for FloatingNavigator's always-on-top state —
   * distinct from the live `is`/`toggle` pair above. `get` returns the effective
   * value (live window when open, else the persisted relaunch state); `set`
   * persists across config + window-state + the live window so relaunch honors it.
   */
  'floating-window-get-always-on-top': {
    request: void
    response: boolean
  }
  'floating-window-set-always-on-top': {
    request: boolean
    response: boolean
  }
  /**
   * Floating Navigator global toggle accelerator. Mirrors the BrainDump shortcut
   * channels, but reads/writes the canonical `shortcuts.toggleFloatingNavigator`
   * config key (no separate mirror), so the inline box never drifts from a rebind
   * made via the generic keybind settings. `get` returns the configured
   * accelerator (empty string when disabled); `set` re-registers it and returns
   * false on conflict — including a silently-substituted fallback, which the main
   * handler unwinds so the renderer shows the conflict copy (§6e).
   */
  'floating-config-get-shortcut': {
    request: void
    response: string
  }
  'floating-config-set-shortcut': {
    request: string
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BrainDump Window
  // ──────────────────────────────────────────────────────────────────────────
  /** Toggle BrainDump window visibility (callable from BrainDump itself). */
  'braindump-window-toggle': {
    request: void
    response: boolean
  }
  'braindump-window-show': {
    request: void
    response: void
  }
  'braindump-window-hide': {
    request: void
    response: void
  }
  /** Set BrainDump window opacity. Value is clamped to [0.30, 1.00] in main. */
  'braindump-window-set-opacity': {
    request: number
    response: number
  }
  'braindump-window-get-opacity': {
    request: void
    response: number
  }
  /** Persisted Settings value: keep BrainDump pinned above other windows. */
  'braindump-window-get-always-on-top': {
    request: void
    response: boolean
  }
  'braindump-window-set-always-on-top': {
    request: boolean
    response: boolean
  }
  'braindump-window-get-bounds': {
    request: void
    response: WindowBounds | null
  }
  'braindump-window-set-bounds': {
    request: WindowBounds
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BrainDump Notes (per-category text persistence)
  // ──────────────────────────────────────────────────────────────────────────
  /** Read the persisted note text for a categoryId (empty string if none). */
  'braindump-note-get': {
    request: number
    response: string
  }
  /** Persist the note text for a categoryId. */
  'braindump-note-set': {
    request: [categoryId: number, text: string]
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BrainDump Configuration (sync mode, shortcut, last category)
  // ──────────────────────────────────────────────────────────────────────────
  'braindump-config-get-sync': {
    request: void
    response: boolean
  }
  'braindump-config-set-sync': {
    request: boolean
    response: boolean
  }
  'braindump-config-get-shortcut': {
    request: void
    response: string
  }
  'braindump-config-set-shortcut': {
    request: string
    response: boolean
  }
  'braindump-config-get-last-category': {
    request: void
    response: number | null
  }
  'braindump-config-set-last-category': {
    request: number
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // System Tray
  // ──────────────────────────────────────────────────────────────────────────
  'tray-show-notification': {
    request: [string, string, SerializableNotificationOptions?]
    response: { id: string } | null
  }
  'tray-update-menu': {
    request: [tasks: Array<{ id: string; title: string; completed?: boolean }>]
    response: void
  }
  'tray-set-tooltip': {
    request: string
    response: void
  }
  'tray-set-icon-state': {
    request: TrayIconState
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Menu
  // ──────────────────────────────────────────────────────────────────────────
  'menu-action': {
    request: string
    response: void
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────────────────────────────────
  'notification-show': {
    request: [string, string, SerializableNotificationOptions?]
    response: { id: string } | null
  }
  'notification-get-settings': {
    request: void
    response: NotificationSettingsState | null
  }
  'notification-update-settings': {
    request: Partial<NotificationSettingsState>
    response: NotificationSettingsState | null
  }
  'notification-clear-all': {
    request: void
    response: void
  }
  'notification-clear': {
    request: string
    response: void
  }
  'notification-is-enabled': {
    request: void
    response: boolean
  }
  'notification-get-active-count': {
    request: void
    response: number
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shortcuts
  // ──────────────────────────────────────────────────────────────────────────
  'shortcuts-get-registered': {
    request: void
    response: ShortcutDefinition[]
  }
  'shortcuts-get-defaults': {
    request: void
    response: ShortcutDefinition[]
  }
  'shortcuts-update': {
    request: Record<string, string>
    response: boolean
  }
  'shortcuts-register': {
    request: ShortcutDefinition
    response: boolean
  }
  'shortcuts-unregister': {
    request: string
    response: boolean
  }
  'shortcuts-is-registered': {
    request: string
    response: boolean
  }
  'shortcuts-enable': {
    request: void
    response: boolean
  }
  'shortcuts-disable': {
    request: void
    response: boolean
  }
  'shortcuts-get-stats': {
    request: void
    response: {
      totalRegistered: number
      isEnabled: boolean
      platform: string
      shortcuts: Record<string, string>
    }
  }
  // #125 native key-tap freeze-safety: read tap health / manually re-enable.
  'shortcuts-get-native-tap-status': {
    request: void
    response: NativeTapStatus
  }
  'shortcuts-reenable-native-tap': {
    request: void
    response: NativeTapStatus
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Configuration
  // ──────────────────────────────────────────────────────────────────────────
  'config-get': {
    request: [path: string, defaultValue?: unknown]
    response: unknown
  }
  'config-set': {
    request: [path: string, value: unknown]
    response: boolean
  }
  'config-get-all': {
    request: void
    response: Record<string, unknown>
  }
  'config-get-section': {
    request: ConfigSection
    response: Record<string, unknown> | null
  }
  'config-update': {
    request: Record<string, unknown>
    response: boolean
  }
  'config-reset': {
    request: void
    response: boolean
  }
  'config-reset-section': {
    request: ConfigSection
    response: boolean
  }
  'config-validate': {
    request: void
    response: { isValid: boolean; errors: string[] }
  }
  'config-export': {
    request: void
    response: boolean
  }
  'config-import': {
    request: void
    response: boolean
  }
  'config-backup': {
    request: void
    response: string | null
  }
  'config-get-paths': {
    request: void
    response: { config: string; windowState: string; directory: string }
  }
  'config-open': {
    request: void
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Deep Linking
  // ──────────────────────────────────────────────────────────────────────────
  'deep-link-generate': {
    request: [action: string, params?: Record<string, unknown>]
    response: string | null
  }
  'deep-link-get-examples': {
    request: void
    response: DeepLinkExamples | null
  }
  'deep-link-handle-url': {
    request: string
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // App Operations
  // ──────────────────────────────────────────────────────────────────────────
  'app-version': {
    request: void
    response: string
  }
  'app-quit': {
    request: void
    response: void
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Auto Updater
  // ──────────────────────────────────────────────────────────────────────────
  'updater-check-for-updates': {
    request: void
    response: boolean
  }
  'updater-quit-and-install': {
    request: void
    response: boolean
  }
  'updater-get-status': {
    request: void
    response: UpdaterStatus
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Performance
  // ──────────────────────────────────────────────────────────────────────────
  'performance-get-metrics': {
    request: void
    response: {
      optimizer: PerformanceMetrics
      memory: MemoryStatistics | null
      lazyLoad: LoadingStatus
    }
  }
  'performance-trigger-cleanup': {
    request: void
    // Returns `true` once cleanup completes. Historical spec advertised
    // `{ freedMemory: number }` but the implementation has always returned a boolean
    // — aligned here so `typedHandle` can enforce the contract.
    response: boolean
  }
  'performance-get-startup-time': {
    request: void
    response: number
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Settings window + per-user settings
  // ──────────────────────────────────────────────────────────────────────────
  'settings:open': {
    request: void
    response: boolean
  }
  'settings:close': {
    request: void
    response: boolean
  }
  /** macOS only: toggle dock visibility via `app.setActivationPolicy`. */
  'settings:setHideAppIcon': {
    request: boolean
    response: boolean
  }
  /** macOS: show/hide the tray (menu-bar) icon via `SystemTrayManager.setMenuBarVisible`. */
  'settings:setShowInMenuBar': {
    request: boolean
    response: boolean
  }
  'settings:setStartAtLogin': {
    request: boolean
    response: boolean
  }
  'settings:getLoginItemSettings': {
    request: void
    response: { openAtLogin: boolean; openAsHidden?: boolean }
  }
  /**
   * Persist which window(s) open at Electron launch. The >=1-true invariant is
   * enforced in ConfigManager (not here), so a renderer cannot persist a
   * boot-nothing config. Returns the saved success flag.
   */
  'settings:setStartupConfig': {
    request: StartupWindowConfig
    response: boolean
  }
  /**
   * Read the persisted startup-window config so the settings UI can show the
   * saved choice. Mirrors the read+write pairs every other settings domain
   * exposes, so the renderer never has to consume the untyped `config.getSection`
   * surface. The returned config always satisfies the >=1-true invariant.
   */
  'settings:getStartupConfig': {
    request: void
    response: StartupWindowConfig
  }
  /**
   * Reset the Settings popover window to its default size (360×380) and
   * re-anchor it to the tray icon. Called from the "Restore default size"
   * button in ElectronSettingsPage. Takes no arguments; returns true on success.
   */
  'settings:resetPopoverSize': {
    request: void
    response: boolean
  }
}

// ============================================================================
// Event Channel Definitions (one-way from main to renderer)
// ============================================================================

export interface IPCEventChannels {
  // OAuth events
  'oauth-success': { user: unknown }
  'oauth-error': { error: string }
  'oauth-complete-exchange': {
    code: string
    verifier: string
    provider: string
  }
  'clerk-sign-in-token': { token: string; provider: string }

  // Auth events
  'auth-state-changed': { isAuthenticated: boolean; user: ElectronUser | null }

  // Window events
  'window-focus': void
  'window-blur': void

  // App events
  'app-update-available': { version: string; releaseNotes?: string }
  'app-update-downloaded': { version: string }
  'updater-message': string
  'updater-download-progress': UpdaterDownloadProgress

  // Task events (from shortcuts/deep links)
  'focus-task': { taskId: string }
  'mark-task-complete': { taskId: string }
  'shortcut-new-task': void
  'shortcut-search': void

  // Menu events
  'menu-action': { action: string; filePath?: string }

  // Floating navigator events (main → floating renderer)
  'floating-navigator-menu-action': string
  /**
   * Broadcast when the Floating Navigator's keep-on-top setting changes from
   * ANY surface (the Settings toggle or the in-window pin). Lets the floating
   * window's own pin button live-update instead of lying until relaunch (§6d).
   */
  'floating-window-always-on-top-changed': { alwaysOnTop: boolean }

  // BrainDump events (main → braindump renderer)
  /** Sent when the active category changes (via FloatingNav sync, etc.). */
  'braindump-category-changed': { categoryId: number }

  // Notification fallback events (renderer hook-up pending)
  'notification-permission-denied': { reason?: string; guidance?: string }
  'show-fallback-notification': {
    title: string
    body: string
    options?: SerializableNotificationOptions
  }

  // System integration status broadcast (from SystemIntegrationErrorHandler)
  'system-integration-status': {
    status: 'full' | 'partial' | 'minimal' | 'failed' | undefined
    title: string
    message: string
    issues: string[]
    integrationStatus: {
      tray: { available: boolean; fallbackMode: boolean; error: string | null }
      notifications: {
        available: boolean
        fallbackMode: boolean
        error: string | null
      }
      shortcuts: {
        available: boolean
        partiallyAvailable: boolean
        failedCount: number
        error: string | null
      }
    }
  }

  // Deep link events — `task` passes through raw Todo shape; `id`/`title` are
  // guaranteed, additional Clerk-style fields are accepted via index signature.
  'deep-link-focus-task': {
    task: { id: string; title: string; [extra: string]: unknown }
    params: Record<string, string>
  }
  'deep-link-create-task': {
    title?: string
    description?: string
    priority?: string
    dueDate?: string
  }
  'deep-link-task-created': {
    task: { id: string; title: string; [extra: string]: unknown }
  }
  'deep-link-navigate': { view: string; params: Record<string, string> }
  'deep-link-search': { query: string; filter?: string }
}

// ============================================================================
// Helper Types
// ============================================================================

/** Extract all channel names */
export type IPCChannel = keyof IPCChannels

/** Extract all event channel names */
export type IPCEventChannel = keyof IPCEventChannels

/** Extract request type for a channel */
export type IPCRequest<C extends IPCChannel> = IPCChannels[C]['request']

/** Extract response type for a channel */
export type IPCResponse<C extends IPCChannel> = IPCChannels[C]['response']

/** Extract event data type for an event channel */
export type IPCEventData<C extends IPCEventChannel> = IPCEventChannels[C]

// ============================================================================
// Typed IPC Handler Utilities
// ============================================================================

/**
 * Type-safe IPC handler function signature.
 *
 * @example
 * ```typescript
 * const handler: IPCHandler<'auth-get-user'> = async (event) => {
 *   return authManager.getCurrentUser()
 * }
 * ```
 */
export type IPCHandler<C extends IPCChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IPCRequest<C> extends void
    ? []
    : IPCRequest<C> extends unknown[]
      ? IPCRequest<C>
      : [IPCRequest<C>]
) => Promise<IPCResponse<C>> | IPCResponse<C>

/**
 * Type-safe event listener function signature.
 *
 * @example
 * ```typescript
 * const listener: IPCEventListener<'oauth-success'> = (data) => {
 *   console.log('OAuth success:', data.provider)
 * }
 * ```
 */
export type IPCEventListener<C extends IPCEventChannel> = (
  data: IPCEventData<C>,
) => void

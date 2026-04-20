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

/** Notification preferences (matches NotificationManager) */
export interface NotificationPreferences {
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
  'window-minimize': {
    request: void
    response: boolean
  }
  'window-close': {
    request: void
    response: boolean
  }
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

  // ──────────────────────────────────────────────────────────────────────────
  // Window State Management
  // ──────────────────────────────────────────────────────────────────────────
  'window-state-get': {
    request: 'main' | 'floating'
    response: WindowState | null
  }
  'window-state-set': {
    request: ['main' | 'floating', Partial<WindowState>]
    response: WindowState | null
  }
  'window-state-reset': {
    request: 'main' | 'floating'
    response: WindowState | null
  }
  'window-state-get-stats': {
    request: void
    response: WindowStats
  }
  'window-state-move-to-display': {
    request: ['main' | 'floating', number]
    response: boolean
  }
  'window-state-snap-to-edge': {
    request: [
      'main' | 'floating',
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
    request: 'main' | 'floating'
    response: DisplayInfo | null
  }
  'window-state-get-all-displays': {
    request: void
    response: DisplayInfo[]
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Floating Window
  // ──────────────────────────────────────────────────────────────────────────
  'floating-window-close': {
    request: void
    response: boolean
  }
  'floating-window-minimize': {
    request: void
    response: boolean
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
  'notification-get-preferences': {
    request: void
    response: NotificationPreferences | null
  }
  'notification-update-preferences': {
    request: Partial<NotificationPreferences>
    response: NotificationPreferences | null
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
  // Settings window + per-user preferences
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
  /** Placeholder for future SystemTrayManager integration. */
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

  // Task events (from shortcuts/deep links)
  'focus-task': { taskId: string }
  'mark-task-complete': { taskId: string }
  'shortcut-new-task': void
  'shortcut-search': void

  // Menu events
  'menu-action': { action: string; filePath?: string }

  // Floating navigator events (main → floating renderer)
  'floating-navigator-menu-action': string

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

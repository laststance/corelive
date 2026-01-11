/**
 * @fileoverview Type-safe IPC channel definitions for Electron.
 *
 * This file defines all IPC channels used between main and renderer processes.
 * Type safety is enforced at compile time for both request and response types.
 *
 * @module electron/types/ipc
 */

import type { IpcMainInvokeEvent } from 'electron'

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
}

/** Display information */
export interface DisplayInfo {
  id: number
  bounds: WindowBounds
  workArea: WindowBounds
  isPrimary: boolean
  scaleFactor: number
}

/** Notification options */
export interface NotificationOptions {
  type?: 'info' | 'warning' | 'error' | 'success'
  silent?: boolean
  urgency?: 'low' | 'normal' | 'critical'
  timeoutMs?: number
  icon?: string
  actions?: Array<{ text: string; type: string }>
}

/** Notification preferences */
export interface NotificationPreferences {
  enabled: boolean
  sound: boolean
  taskReminders: boolean
  dueDateAlerts: boolean
  achievementNotifications: boolean
  quietHoursEnabled: boolean
  quietHoursStart?: string
  quietHoursEnd?: string
}

/** Tray icon states */
export type TrayIconState = 'default' | 'active' | 'notification' | 'disabled'

/** OAuth provider types */
export type OAuthProvider = 'google' | 'github' | 'apple'

/** OAuth result from browser flow */
export interface OAuthResult {
  success: boolean
  provider: OAuthProvider
  token?: string
  error?: string
}

/** OAuth pending token */
export interface PendingSignInToken {
  token: string
  provider: OAuthProvider
  createdAt: number
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

/** Deep link examples */
export interface DeepLinkExamples {
  openTask: string
  createTask: string
  searchTasks: string
  openView: string
}

/** Updater status */
export interface UpdaterStatus {
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  version?: string
  releaseNotes?: string
  error?: string
}

/** IPC error statistics */
export interface IPCErrorStats {
  totalErrors: number
  errorsByChannel: Record<string, number>
  lastError?: {
    channel: string
    message: string
    timestamp: number
  }
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
    response: ElectronUser | null
  }
  'auth-set-user': {
    request: ElectronUser
    response: boolean
  }
  'auth-logout': {
    request: void
    response: void
  }
  'auth-is-authenticated': {
    request: void
    response: boolean
  }
  'auth-sync-from-web': {
    request: { token: string; user: ElectronUser }
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OAuth
  // ──────────────────────────────────────────────────────────────────────────
  'oauth-start': {
    request: OAuthProvider
    response: OAuthResult
  }
  'oauth-get-supported-providers': {
    request: void
    response: OAuthProvider[]
  }
  'oauth-cancel': {
    request: void
    response: void
  }
  'oauth-get-pending-token': {
    request: void
    response: PendingSignInToken | null
  }
  'oauth-clear-pending-token': {
    request: void
    response: void
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Window Operations
  // ──────────────────────────────────────────────────────────────────────────
  'window-minimize': {
    request: void
    response: void
  }
  'window-close': {
    request: void
    response: void
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
    response: boolean
  }
  'window-state-reset': {
    request: 'main' | 'floating'
    response: void
  }
  'window-state-get-stats': {
    request: void
    response: { saves: number; loads: number; resets: number }
  }
  'window-state-move-to-display': {
    request: ['main' | 'floating', number]
    response: boolean
  }
  'window-state-snap-to-edge': {
    request: ['main' | 'floating', 'left' | 'right' | 'top' | 'bottom']
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
    response: void
  }
  'floating-window-minimize': {
    request: void
    response: void
  }
  'floating-window-toggle-always-on-top': {
    request: void
    response: boolean
  }
  'floating-window-get-bounds': {
    request: void
    response: WindowBounds
  }
  'floating-window-set-bounds': {
    request: WindowBounds
    response: void
  }
  'floating-window-is-always-on-top': {
    request: void
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // System Tray
  // ──────────────────────────────────────────────────────────────────────────
  'tray-show-notification': {
    request: [string, string, NotificationOptions?]
    response: { id: string } | null
  }
  'tray-update-menu': {
    request: Array<{ id: string; title: string; completed?: boolean }>
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
    request: [string, string, NotificationOptions?]
    response: { id: string } | null
  }
  'notification-get-preferences': {
    request: void
    response: NotificationPreferences | null
  }
  'notification-update-preferences': {
    request: Partial<NotificationPreferences>
    response: boolean
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
    request: { id: string; accelerator: string }
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
    request: string
    response: boolean
  }
  'shortcuts-disable': {
    request: string
    response: boolean
  }
  'shortcuts-get-stats': {
    request: void
    response: { total: number; enabled: number; global: number }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Configuration
  // ──────────────────────────────────────────────────────────────────────────
  'config-get': {
    request: string
    response: unknown
  }
  'config-set': {
    request: [string, unknown]
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
    response: void
  }
  'config-reset-section': {
    request: ConfigSection
    response: void
  }
  'config-validate': {
    request: Record<string, unknown>
    response: { valid: boolean; errors?: string[] }
  }
  'config-export': {
    request: void
    response: string
  }
  'config-import': {
    request: string
    response: boolean
  }
  'config-backup': {
    request: void
    response: string
  }
  'config-get-paths': {
    request: void
    response: { config: string; backup: string; logs: string }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Deep Linking
  // ──────────────────────────────────────────────────────────────────────────
  'deep-link-generate': {
    request: { action: string; params?: Record<string, string> }
    response: string
  }
  'deep-link-get-examples': {
    request: void
    response: DeepLinkExamples
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
    response: UpdaterStatus
  }
  'updater-quit-and-install': {
    request: void
    response: void
  }
  'updater-get-status': {
    request: void
    response: UpdaterStatus
  }

  // ──────────────────────────────────────────────────────────────────────────
  // IPC Error Handling
  // ──────────────────────────────────────────────────────────────────────────
  'ipc-error-stats': {
    request: void
    response: IPCErrorStats
  }
  'ipc-error-health-check': {
    request: void
    response: { healthy: boolean; issues?: string[] }
  }
  'ipc-error-reset-stats': {
    request: void
    response: void
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Performance
  // ──────────────────────────────────────────────────────────────────────────
  'performance-get-metrics': {
    request: void
    response: {
      memoryUsage: NodeJS.MemoryUsage
      uptime: number
      cpuUsage: NodeJS.CpuUsage
    }
  }
  'performance-trigger-cleanup': {
    request: void
    response: { freedMemory: number }
  }
  'performance-get-startup-time': {
    request: void
    response: number
  }
}

// ============================================================================
// Event Channel Definitions (one-way from main to renderer)
// ============================================================================

export interface IPCEventChannels {
  // OAuth events
  'oauth-success': OAuthResult
  'oauth-error': { provider: OAuthProvider; error: string }
  'oauth-complete-exchange': { provider: OAuthProvider; code: string }
  'clerk-sign-in-token': { token: string; provider: OAuthProvider }

  // Auth events
  'auth-state-changed': { isAuthenticated: boolean; user: ElectronUser | null }

  // Window events
  'window-focus': void
  'window-blur': void

  // App events
  'app-update-available': { version: string; releaseNotes?: string }
  'app-update-downloaded': { version: string }
  'updater-message': {
    type: 'checking' | 'available' | 'downloaded' | 'error'
    message?: string
  }

  // Task events (from shortcuts/deep links)
  'focus-task': { taskId: string }
  'mark-task-complete': { taskId: string }
  'shortcut-new-task': void
  'shortcut-search': void

  // Deep link events
  'deep-link-focus-task': {
    task: { id: string; title: string }
    params: Record<string, string>
  }
  'deep-link-create-task': {
    title?: string
    description?: string
    priority?: string
  }
  'deep-link-task-created': { task: { id: string; title: string } }
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

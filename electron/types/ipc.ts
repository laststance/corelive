/**
 * @fileoverview Type-safe IPC channel definitions for Electron.
 *
 * This file defines all IPC channels used between main and renderer processes.
 * Type safety is enforced at compile time for both request and response types.
 *
 * @module electron/types/ipc
 */

// ============================================================================
// Shared Types
// ============================================================================

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

/** Config section types */
export type ConfigSection =
  | 'window'
  | 'notifications'
  | 'shortcuts'
  | 'general'
  | 'appearance'
  | 'behavior'
  | 'advanced'
  | 'liveEditor'

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
  // LiveEditor Window
  // ──────────────────────────────────────────────────────────────────────────
  /** Toggle LiveEditor window visibility (callable from LiveEditor itself). */
  'live-editor-window-toggle': {
    request: void
    response: boolean
  }
  'live-editor-window-show': {
    request: void
    response: void
  }
  'live-editor-window-hide': {
    request: void
    response: void
  }
  /** Set LiveEditor window opacity. Value is clamped to [0.30, 1.00] in main. */
  'live-editor-window-set-opacity': {
    request: number
    response: number
  }
  'live-editor-window-get-opacity': {
    request: void
    response: number
  }
  /** Persisted Settings value: keep LiveEditor pinned above other windows. */
  'live-editor-window-get-always-on-top': {
    request: void
    response: boolean
  }
  'live-editor-window-set-always-on-top': {
    request: boolean
    response: boolean
  }
  'live-editor-window-get-bounds': {
    request: void
    response: WindowBounds | null
  }
  'live-editor-window-set-bounds': {
    request: WindowBounds
    response: boolean
  }
  /** Persisted Settings value: show LiveEditor on every macOS Space. */
  'live-editor-get-visible-on-all-workspaces': {
    request: void
    response: boolean
  }
  'live-editor-set-visible-on-all-workspaces': {
    request: boolean
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LiveEditor Notes (per-category text persistence)
  // ──────────────────────────────────────────────────────────────────────────
  /** Read the persisted note text for a categoryId (empty string if none). */
  'live-editor-note-get': {
    request: number
    response: string
  }
  /** Persist the note text for a categoryId. */
  'live-editor-note-set': {
    request: [categoryId: number, text: string]
    response: boolean
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LiveEditor Configuration (shortcuts)
  // ──────────────────────────────────────────────────────────────────────────
  'live-editor-config-get-shortcut': {
    request: void
    response: string
  }
  'live-editor-config-set-shortcut': {
    request: string
    response: boolean
  }
  'live-editor-config-get-shortcut-secondary': {
    request: void
    response: string
  }
  'live-editor-config-set-shortcut-secondary': {
    request: string
    response: boolean
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
  // Settings window + per-user settings
  // ──────────────────────────────────────────────────────────────────────────
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
  // Sent by {@link OAuthManager}; received in preload-shared/auth-oauth-bridge.ts.
  'oauth-error': { error: string }
  'clerk-sign-in-token': { token: string; provider: string }
}

// ============================================================================
// Helper Types
// ============================================================================

/** Extract all channel names */
export type IPCChannel = keyof IPCChannels

/** Extract all event channel names */
export type IPCEventChannel = keyof IPCEventChannels

/** Extract response type for a channel */
export type IPCResponse<C extends IPCChannel> = IPCChannels[C]['response']

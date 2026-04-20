/**
 * @fileoverview Electron Preload Script - Security Bridge
 *
 * The preload script is the MOST CRITICAL security component in Electron.
 * It runs in a special context that has access to both Node.js APIs and
 * the web page's DOM, acting as a secure bridge between them.
 *
 * Security Architecture:
 * 1. Main Process (full system access) ← IPC → Preload Script ← contextBridge → Renderer (web page)
 * 2. Preload has Node.js access but runs in isolated context
 * 3. Only whitelisted, sanitized APIs are exposed to the renderer
 *
 * Why is this critical?
 * - Without proper preload isolation, web content could access Node.js
 * - A single XSS vulnerability could compromise the entire system
 * - This script defines the ONLY APIs available to web content
 *
 * Best Practices:
 * - NEVER expose raw Node.js APIs to renderer
 * - Always validate and sanitize data
 * - Use channel whitelisting for IPC
 * - Keep the exposed API surface minimal
 *
 * @module electron/preload
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import { typedInvoke } from './ipc/typedInvoke'
import { log } from './logger'
import type {
  ConfigSection,
  DeepLinkExamples,
  IPCEventChannel,
  NotificationOptions,
  NotificationPreferences,
  ShortcutDefinition,
  TrayIconState,
  WindowBounds,
  WindowState,
} from './types/ipc'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Allowed event-channel map for the generic `on/removeListener/removeAllListeners`
 * entry points.
 *
 * Request/response channels are already guarded by `typedInvoke` — the typed
 * wrapper constrains channel names to `IPCChannel` at compile-time. The
 * whitelist below only protects the untyped listener surface, which is solely
 * for one-way events (main → renderer). Including request/response channels
 * here would needlessly widen the listener-management attack surface.
 */
type AllowedChannelsMap = Record<IPCEventChannel, true>

/** Sanitized data type */
type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizedValue[]
  | { [key: string]: SanitizedValue }

/** Task item for tray menu */
interface TrayTaskItem {
  id: string
  title: string
  completed?: boolean
}

/** User data */
interface ElectronUserData {
  clerkId: string
  [key: string]: unknown
}

/** OAuth callback data */
interface OAuthCallbackData {
  [key: string]: unknown
}

// ============================================================================
// Allowed Channels Whitelist
// ============================================================================

/**
 * Whitelist of allowed IPC channels for security.
 *
 * This is a critical security control. Only channels listed here
 * can be used by the renderer process. This prevents:
 * - Malicious code from accessing unauthorized APIs
 * - Accidental exposure of dangerous functionality
 * - IPC injection attacks
 *
 * When adding new channels:
 * 1. Consider if it's truly needed in the renderer
 * 2. Ensure the main process handler validates all input
 * 3. Document what the channel does and why it's safe
 */
/**
 * Whitelist of channels allowed for renderer-facing `on/off/removeAllListeners`.
 *
 * Since `typedInvoke`/`createTypedListener` already constrain callers to valid
 * channel names at compile-time, this map only guards the untyped generic
 * `on()` / `removeListener()` / `removeAllListeners()` entry points below.
 *
 * The `satisfies AllowedChannelsMap` assertion forces exhaustive enumeration
 * of every `IPCEventChannel`. Adding an event channel in `types/ipc.ts`
 * without listing it here is a compile error. This is the single source of
 * truth — no hand-maintained subset is allowed to drift.
 */
const ALLOWED_CHANNELS = {
  // Event channels (main → renderer) — the only surface guarded here,
  // since request/response channels go through typedInvoke (compile-time safe).
  'oauth-success': true,
  'oauth-error': true,
  'oauth-complete-exchange': true,
  'clerk-sign-in-token': true,
  'auth-state-changed': true,
  'window-focus': true,
  'window-blur': true,
  'app-update-available': true,
  'app-update-downloaded': true,
  'updater-message': true,
  'focus-task': true,
  'mark-task-complete': true,
  'shortcut-new-task': true,
  'shortcut-search': true,
  'menu-action': true,
  'deep-link-focus-task': true,
  'deep-link-create-task': true,
  'deep-link-task-created': true,
  'deep-link-navigate': true,
  'deep-link-search': true,
  'floating-navigator-menu-action': true,
  'notification-permission-denied': true,
  'show-fallback-notification': true,
  'system-integration-status': true,
} satisfies AllowedChannelsMap

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Validate IPC channel for security.
 *
 * @param channel - Channel name to validate
 * @returns True if channel is in whitelist
 */
function validateChannel(channel: string): boolean {
  return (ALLOWED_CHANNELS as Record<string, boolean>)[channel] === true
}

/**
 * Sanitize data to prevent injection attacks.
 *
 * @param data - Data to sanitize
 * @returns Sanitized data
 */
function sanitizeData<T>(data: T): T {
  // Keys that could be used for prototype pollution attacks
  const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype']

  if (typeof data === 'string') {
    return data.trim() as T
  }
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map((item) => sanitizeData(item)) as T
    }
    // Deep clone and sanitize object properties
    // Use null prototype to prevent prototype pollution attacks
    const sanitized = Object.create(null) as Record<string, SanitizedValue>
    for (const [key, value] of Object.entries(data)) {
      // Block prototype pollution attacks
      if (FORBIDDEN_KEYS.includes(key)) {
        continue
      }

      if (typeof value === 'string') {
        sanitized[key] = value.trim()
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (value === null || value === undefined) {
        sanitized[key] = value
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) => sanitizeData(item))
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeData(value)
      }
    }
    return sanitized as T
  }
  return data
}

// ============================================================================
// Exposed API
// ============================================================================

/**
 * Expose secure API to renderer process via contextBridge.
 *
 * This is the ONLY way renderer processes should access system capabilities.
 * Everything exposed here is available as window.electronAPI in the renderer.
 *
 * Security principles applied:
 * 1. No direct Node.js API exposure
 * 2. All data is sanitized before sending via IPC
 * 3. All channels are whitelisted
 * 4. Error messages are sanitized (no system details leaked)
 * 5. Each method validates input before processing
 *
 * API Design:
 * - Organized by feature area (todos, auth, window, etc.)
 * - Async/await pattern for all IPC calls
 * - Consistent error handling
 * - TypeScript-friendly structure
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Note: Todo operations removed - WebView architecture uses oRPC via HTTP.
   * The web app (loaded in WebView) handles all data operations through
   * the same oRPC client used by the browser version.
   */

  // Window control APIs
  window: {
    /**
     * Minimize window to tray.
     */
    minimize: async () => {
      try {
        return await typedInvoke('window-minimize')
      } catch (error) {
        log.error('Failed to minimize window:', error)
      }
    },

    /**
     * Close window (minimize to tray).
     */
    close: async () => {
      try {
        return await typedInvoke('window-close')
      } catch (error) {
        log.error('Failed to close window:', error)
      }
    },

    /**
     * Toggle floating navigator visibility.
     */
    toggleFloatingNavigator: async () => {
      try {
        return await typedInvoke('window-toggle-floating-navigator')
      } catch (error) {
        log.error('Failed to toggle floating navigator:', error)
      }
    },

    /**
     * Show floating navigator.
     */
    showFloatingNavigator: async () => {
      try {
        return await typedInvoke('window-show-floating-navigator')
      } catch (error) {
        log.error('Failed to show floating navigator:', error)
      }
    },

    /**
     * Hide floating navigator.
     */
    hideFloatingNavigator: async () => {
      try {
        return await typedInvoke('window-hide-floating-navigator')
      } catch (error) {
        log.error('Failed to hide floating navigator:', error)
      }
    },

    /**
     * Get window bounds.
     * Extracts only x, y, width, height from the full window state.
     */
    getBounds: async (): Promise<WindowBounds> => {
      try {
        const state = await typedInvoke('window-state-get', 'main')
        if (state) {
          return {
            x: typeof state.x === 'number' ? state.x : 0,
            y: typeof state.y === 'number' ? state.y : 0,
            width: typeof state.width === 'number' ? state.width : 800,
            height: typeof state.height === 'number' ? state.height : 600,
          }
        }
        return { x: 0, y: 0, width: 800, height: 600 }
      } catch (error) {
        log.error('Failed to get window bounds:', error)
        return { x: 0, y: 0, width: 800, height: 600 }
      }
    },

    /**
     * Set window bounds.
     */
    setBounds: async (bounds: WindowBounds): Promise<void> => {
      try {
        await typedInvoke('window-state-set', 'main', bounds)
      } catch (error) {
        log.error('Failed to set window bounds:', error)
      }
    },

    /**
     * Check if window is minimized.
     */
    isMinimized: async (): Promise<boolean> => {
      try {
        const state = await typedInvoke('window-state-get', 'main')
        return state?.isMinimized || false
      } catch (error) {
        log.error('Failed to check if window is minimized:', error)
        return false
      }
    },

    /**
     * Check if window is always on top.
     */
    isAlwaysOnTop: async (): Promise<boolean> => {
      try {
        const state = await typedInvoke('window-state-get', 'main')
        return state?.alwaysOnTop || false
      } catch (error) {
        log.error('Failed to check if window is always on top:', error)
        return false
      }
    },

    /**
     * Move window to specific display.
     */
    moveToDisplay: async (displayIndex: number): Promise<void> => {
      try {
        await typedInvoke('window-state-move-to-display', 'main', displayIndex)
      } catch (error) {
        log.error('Failed to move window to display:', error)
      }
    },
  },

  // System integration APIs
  system: {
    /**
     * Show native notification.
     */
    showNotification: async (
      title: string,
      body: string,
      options: NotificationOptions = {},
    ): Promise<{ id: string } | null> => {
      if (!title || typeof title !== 'string') {
        throw new Error('Notification title is required')
      }
      if (!body || typeof body !== 'string') {
        throw new Error('Notification body is required')
      }

      const sanitizedTitle = sanitizeData(title)
      const sanitizedBody = sanitizeData(body)
      const sanitizedOptions = sanitizeData(options)

      try {
        return await typedInvoke(
          'tray-show-notification',
          sanitizedTitle as string,
          sanitizedBody as string,
          sanitizedOptions as NotificationOptions | undefined,
        )
      } catch (error) {
        log.error('Failed to show notification:', error)
        throw new Error('Failed to show notification')
      }
    },

    /**
     * Update system tray menu with tasks.
     */
    updateTrayMenu: async (tasks: TrayTaskItem[] = []): Promise<void> => {
      if (!Array.isArray(tasks)) {
        throw new Error('Tasks must be an array')
      }

      const sanitizedTasks = sanitizeData(tasks)

      try {
        return await typedInvoke(
          'tray-update-menu',
          sanitizedTasks as TrayTaskItem[],
        )
      } catch (error) {
        log.error('Failed to update tray menu:', error)
      }
    },

    /**
     * Set system tray tooltip.
     */
    setTrayTooltip: async (text: string): Promise<void> => {
      if (!text || typeof text !== 'string') {
        throw new Error('Tooltip text is required')
      }

      const sanitizedText = sanitizeData(text)

      try {
        return await typedInvoke('tray-set-tooltip', sanitizedText as string)
      } catch (error) {
        log.error('Failed to set tray tooltip:', error)
      }
    },

    /**
     * Set system tray icon state.
     */
    setTrayIconState: async (state: TrayIconState): Promise<boolean> => {
      if (typeof state !== 'string') {
        throw new Error('Icon state must be a string')
      }

      const validStates: TrayIconState[] = [
        'default',
        'active',
        'notification',
        'disabled',
      ]
      if (!validStates.includes(state)) {
        throw new Error(
          `Invalid icon state. Must be one of: ${validStates.join(', ')}`,
        )
      }

      try {
        return await typedInvoke('tray-set-icon-state', state)
      } catch (error) {
        log.error('Failed to set tray icon state:', error)
        return false
      }
    },
  },

  // Notification management APIs
  notifications: {
    /**
     * Show custom notification.
     */
    show: async (
      title: string,
      body: string,
      options: NotificationOptions = {},
    ): Promise<{ id: string } | null> => {
      if (!title || typeof title !== 'string') {
        throw new Error('Notification title is required')
      }
      if (!body || typeof body !== 'string') {
        throw new Error('Notification body is required')
      }

      const sanitizedTitle = sanitizeData(title)
      const sanitizedBody = sanitizeData(body)
      const sanitizedOptions = sanitizeData(options)

      try {
        return await typedInvoke(
          'notification-show',
          sanitizedTitle as string,
          sanitizedBody as string,
          sanitizedOptions as NotificationOptions | undefined,
        )
      } catch (error) {
        log.error('Failed to show notification:', error)
        throw new Error('Failed to show notification')
      }
    },

    /**
     * Get notification preferences.
     */
    getPreferences: async (): Promise<NotificationPreferences | null> => {
      try {
        return await typedInvoke('notification-get-preferences')
      } catch (error) {
        log.error('Failed to get notification preferences:', error)
        return null
      }
    },

    /**
     * Update notification preferences.
     */
    updatePreferences: async (
      preferences: Record<string, unknown>,
    ): Promise<NotificationPreferences | null> => {
      if (!preferences || typeof preferences !== 'object') {
        throw new Error('Invalid preferences data')
      }

      const sanitizedPreferences = sanitizeData(preferences)

      try {
        return await typedInvoke(
          'notification-update-preferences',
          sanitizedPreferences as Partial<NotificationPreferences>,
        )
      } catch (error) {
        log.error('Failed to update notification preferences:', error)
        throw new Error('Failed to update preferences')
      }
    },

    /**
     * Clear all active notifications.
     */
    clearAll: async (): Promise<void> => {
      try {
        return await typedInvoke('notification-clear-all')
      } catch (error) {
        log.error('Failed to clear all notifications:', error)
      }
    },

    /**
     * Clear specific notification by tag.
     */
    clear: async (tag: string): Promise<void> => {
      if (!tag || typeof tag !== 'string') {
        throw new Error('Notification tag is required')
      }

      const sanitizedTag = sanitizeData(tag)

      try {
        return await typedInvoke('notification-clear', sanitizedTag as string)
      } catch (error) {
        log.error('Failed to clear notification:', error)
      }
    },

    /**
     * Check if notifications are enabled.
     */
    isEnabled: async (): Promise<boolean> => {
      try {
        return await typedInvoke('notification-is-enabled')
      } catch (error) {
        log.error('Failed to check notification status:', error)
        return false
      }
    },

    /**
     * Get count of active notifications.
     */
    getActiveCount: async (): Promise<number> => {
      try {
        return await typedInvoke('notification-get-active-count')
      } catch (error) {
        log.error('Failed to get active notification count:', error)
        return 0
      }
    },
  },

  // Keyboard shortcut management APIs
  shortcuts: {
    /**
     * Get currently registered shortcuts.
     */
    getRegistered: async (): Promise<ShortcutDefinition[]> => {
      try {
        return await typedInvoke('shortcuts-get-registered')
      } catch (error) {
        log.error('Failed to get registered shortcuts:', error)
        return []
      }
    },

    /**
     * Get default shortcuts configuration.
     */
    getDefaults: async (): Promise<ShortcutDefinition[]> => {
      try {
        return await typedInvoke('shortcuts-get-defaults')
      } catch (error) {
        log.error('Failed to get default shortcuts:', error)
        return []
      }
    },

    /**
     * Update shortcuts configuration.
     */
    update: async (shortcuts: Record<string, string>): Promise<boolean> => {
      if (!shortcuts || typeof shortcuts !== 'object') {
        throw new Error('Invalid shortcuts configuration')
      }

      const sanitizedShortcuts = sanitizeData(shortcuts) as Record<
        string,
        string
      >

      try {
        return await typedInvoke('shortcuts-update', sanitizedShortcuts)
      } catch (error) {
        log.error('Failed to update shortcuts:', error)
        throw new Error('Failed to update shortcuts')
      }
    },

    /**
     * Register a single shortcut.
     *
     * @param accelerator - Keyboard accelerator (e.g., 'CommandOrControl+N')
     * @param id - Unique shortcut ID
     * @param description - Human-readable description
     * @param options - Optional: enabled and isGlobal flags
     */
    register: async (
      accelerator: string,
      id: string,
      description: string = '',
      options: { enabled?: boolean; isGlobal?: boolean } = {},
    ): Promise<boolean> => {
      if (!accelerator || typeof accelerator !== 'string') {
        throw new Error('Accelerator is required')
      }
      if (!id || typeof id !== 'string') {
        throw new Error('Shortcut ID is required')
      }

      const shortcutDefinition = sanitizeData({
        id,
        accelerator,
        description: description || id,
        enabled: options.enabled ?? true,
        isGlobal: options.isGlobal ?? false,
      }) as ShortcutDefinition

      try {
        return await typedInvoke('shortcuts-register', shortcutDefinition)
      } catch (error) {
        log.error('Failed to register shortcut:', error)
        throw new Error('Failed to register shortcut')
      }
    },

    /**
     * Unregister a shortcut.
     */
    unregister: async (id: string): Promise<boolean> => {
      if (!id || typeof id !== 'string') {
        throw new Error('Shortcut ID is required')
      }

      const sanitizedId = sanitizeData(id)

      try {
        return await typedInvoke('shortcuts-unregister', sanitizedId as string)
      } catch (error) {
        log.error('Failed to unregister shortcut:', error)
        throw new Error('Failed to unregister shortcut')
      }
    },

    /**
     * Check if shortcut is registered.
     */
    isRegistered: async (accelerator: string): Promise<boolean> => {
      if (!accelerator || typeof accelerator !== 'string') {
        throw new Error('Accelerator is required')
      }

      const sanitizedAccelerator = sanitizeData(accelerator)

      try {
        return await typedInvoke(
          'shortcuts-is-registered',
          sanitizedAccelerator as string,
        )
      } catch (error) {
        log.error('Failed to check shortcut registration:', error)
        return false
      }
    },

    /**
     * Enable shortcuts.
     */
    enable: async (): Promise<boolean> => {
      try {
        return await typedInvoke('shortcuts-enable')
      } catch (error) {
        log.error('Failed to enable shortcuts:', error)
        return false
      }
    },

    /**
     * Disable shortcuts.
     */
    disable: async (): Promise<boolean> => {
      try {
        return await typedInvoke('shortcuts-disable')
      } catch (error) {
        log.error('Failed to disable shortcuts:', error)
        return false
      }
    },

    /**
     * Get shortcut statistics.
     */
    getStats: async (): Promise<{
      totalRegistered: number
      isEnabled: boolean
      platform: string
      shortcuts: Record<string, string>
    } | null> => {
      try {
        return await typedInvoke('shortcuts-get-stats')
      } catch (error) {
        log.error('Failed to get shortcut stats:', error)
        return null
      }
    },
  },

  // Authentication management
  auth: {
    /**
     * Get current user.
     */
    getUser: async () => {
      try {
        return await typedInvoke('auth-get-user')
      } catch (error) {
        log.error('Failed to get user:', error)
        return null
      }
    },

    /**
     * Set current user.
     */
    setUser: async (user: ElectronUserData) => {
      try {
        if (!user || typeof user !== 'object') {
          throw new Error('Invalid auth payload: user object is required')
        }
        if (!user.clerkId || typeof user.clerkId !== 'string') {
          throw new Error('Invalid auth payload: clerkId is required')
        }
        // Validate id if present (optional but must be string if provided)
        if (
          'id' in user &&
          user.id !== undefined &&
          typeof user.id !== 'string'
        ) {
          throw new Error('Invalid auth payload: id must be a string')
        }

        const sanitized = sanitizeData(user) as {
          clerkId: string
          emailAddresses?: string[]
          firstName?: string | null
        }
        return await typedInvoke('auth-set-user', sanitized)
      } catch (error) {
        log.error('Failed to set user:', error)
        throw new Error('Failed to set user')
      }
    },

    /**
     * Logout current user.
     */
    logout: async (): Promise<boolean> => {
      try {
        return await typedInvoke('auth-logout')
      } catch (error) {
        log.error('Failed to logout:', error)
        throw new Error('Failed to logout')
      }
    },

    /**
     * Check if user is authenticated.
     */
    isAuthenticated: async (): Promise<boolean> => {
      try {
        return await typedInvoke('auth-is-authenticated')
      } catch (error) {
        log.error('Failed to check authentication:', error)
        return false
      }
    },

    /**
     * Sync authentication state from web version.
     */
    syncFromWeb: async (authData: ElectronUserData): Promise<boolean> => {
      try {
        if (!authData || typeof authData !== 'object') {
          throw new Error('Invalid auth payload: authData object is required')
        }
        if (!authData.clerkId || typeof authData.clerkId !== 'string') {
          throw new Error('Invalid auth payload: clerkId is required')
        }
        // Validate id if present (optional but must be string if provided)
        if (
          'id' in authData &&
          authData.id !== undefined &&
          typeof authData.id !== 'string'
        ) {
          throw new Error('Invalid auth payload: id must be a string')
        }

        const sanitized = sanitizeData(authData) as {
          clerkId: string
          emailAddresses?: string[]
          firstName?: string | null
        }
        return await typedInvoke('auth-sync-from-web', sanitized)
      } catch (error) {
        log.error('Failed to sync auth from web:', error)
        throw new Error('Failed to sync authentication')
      }
    },
  },

  // OAuth management (browser-based OAuth for providers that block WebView)
  oauth: {
    /**
     * Start OAuth flow in system browser.
     * Used for providers like Google that block WebView authentication.
     *
     * @param provider - OAuth provider (e.g., 'google', 'github')
     * @returns Promise with success status and state or error
     */
    start: async (provider: string) => {
      try {
        return await typedInvoke('oauth-start', provider)
      } catch (error) {
        log.error('Failed to start OAuth flow:', error)
        return {
          state: null,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },

    /**
     * Get list of supported OAuth providers.
     */
    getSupportedProviders: async () => {
      try {
        return await typedInvoke('oauth-get-supported-providers')
      } catch (error) {
        log.error('Failed to get supported OAuth providers:', error)
        return []
      }
    },

    /**
     * Cancel pending OAuth flow.
     */
    cancel: async (state?: string | null) => {
      try {
        return await typedInvoke('oauth-cancel', state ?? null)
      } catch (error) {
        log.error('Failed to cancel OAuth flow:', error)
        return false
      }
    },

    /**
     * Register callback for OAuth success.
     */
    onSuccess: (callback: (data: OAuthCallbackData) => void): (() => void) => {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function')
      }

      const wrappedCallback = (
        _event: IpcRendererEvent,
        data: OAuthCallbackData,
      ): void => {
        try {
          callback(sanitizeData(data))
        } catch (error) {
          log.error('Error in OAuth success callback:', error)
        }
      }

      ipcRenderer.on('oauth-success', wrappedCallback)
      return () => ipcRenderer.removeListener('oauth-success', wrappedCallback)
    },

    /**
     * Register callback for OAuth error.
     */
    onError: (callback: (data: OAuthCallbackData) => void): (() => void) => {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function')
      }

      const wrappedCallback = (
        _event: IpcRendererEvent,
        data: OAuthCallbackData,
      ): void => {
        try {
          callback(sanitizeData(data))
        } catch (error) {
          log.error('Error in OAuth error callback:', error)
        }
      }

      ipcRenderer.on('oauth-error', wrappedCallback)
      return () => ipcRenderer.removeListener('oauth-error', wrappedCallback)
    },

    /**
     * Register callback for OAuth code exchange completion.
     * (Used by web app to complete the Clerk session setup)
     */
    onCompleteExchange: (
      callback: (data: OAuthCallbackData) => void,
    ): (() => void) => {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function')
      }

      const wrappedCallback = (
        _event: IpcRendererEvent,
        data: OAuthCallbackData,
      ): void => {
        try {
          callback(sanitizeData(data))
        } catch (error) {
          log.error('Error in OAuth exchange callback:', error)
        }
      }

      ipcRenderer.on('oauth-complete-exchange', wrappedCallback)
      return () =>
        ipcRenderer.removeListener('oauth-complete-exchange', wrappedCallback)
    },

    /**
     * Register callback for Clerk sign-in token from browser OAuth.
     * This token allows the WebView to create its own Clerk session
     * using signIn.create({ strategy: 'ticket', ticket: token }).
     *
     * @param callback - Function called with { token, provider }
     * @returns Cleanup function to remove the listener
     */
    onSignInToken: (
      callback: (data: { token: string; provider: string }) => void,
    ): (() => void) => {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function')
      }

      const wrappedCallback = (
        _event: IpcRendererEvent,
        data: { token: string; provider: string },
      ): void => {
        try {
          callback(sanitizeData(data))
        } catch (error) {
          log.error('Error in OAuth sign-in token callback:', error)
        }
      }

      ipcRenderer.on('clerk-sign-in-token', wrappedCallback)
      return () =>
        ipcRenderer.removeListener('clerk-sign-in-token', wrappedCallback)
    },

    /**
     * Get pending sign-in token (for race condition handling).
     * This is called when the renderer is ready to process tokens,
     * in case it missed the IPC event.
     *
     * @returns Promise with pending token or null
     */
    getPendingToken: async () => {
      try {
        return await typedInvoke('oauth-get-pending-token')
      } catch (error) {
        log.error('Failed to get pending OAuth token:', error)
        return null
      }
    },

    /**
     * Clear pending sign-in token (after successful sign-in).
     */
    clearPendingToken: async () => {
      try {
        return await typedInvoke('oauth-clear-pending-token')
      } catch (error) {
        log.error('Failed to clear pending OAuth token:', error)
        return false
      }
    },
  },

  // Menu management APIs
  menu: {
    /**
     * Trigger menu action.
     */
    triggerAction: async (action: string): Promise<void> => {
      if (!action || typeof action !== 'string') {
        throw new Error('Menu action is required')
      }

      const sanitizedAction = sanitizeData(action)

      try {
        return await typedInvoke('menu-action', sanitizedAction as string)
      } catch (error) {
        log.error('Failed to trigger menu action:', error)
        throw new Error('Failed to trigger menu action')
      }
    },
  },

  // Configuration management APIs
  config: {
    /**
     * Get configuration value by path.
     */
    get: async <T = unknown>(path: string, defaultValue?: T): Promise<T> => {
      if (!path || typeof path !== 'string') {
        throw new Error('Configuration path is required')
      }

      const sanitizedPath = sanitizeData(path)
      const sanitizedDefault = sanitizeData(defaultValue)

      try {
        return (await typedInvoke(
          'config-get',
          sanitizedPath as string,
          sanitizedDefault,
        )) as T
      } catch (error) {
        log.error('Failed to get config value:', error)
        return defaultValue as T
      }
    },

    /**
     * Save configuration to disk.
     *
     * Note: Config auto-persists on every set/update call, so this is
     * effectively a no-op. Returns true to indicate the config is persisted.
     *
     * @returns Always true (config auto-saves on modification)
     */
    save: async (): Promise<boolean> => {
      // Config auto-persists on every set/update operation
      // This method exists for API compatibility but is a no-op
      return true
    },

    /**
     * Load configuration (alias for getAll).
     */
    load: async (): Promise<Record<string, unknown>> => {
      try {
        return await typedInvoke('config-get-all')
      } catch (error) {
        log.error('Failed to load config:', error)
        return {}
      }
    },

    /**
     * Set configuration value by path.
     */
    set: async <T = unknown>(path: string, value: T): Promise<boolean> => {
      if (!path || typeof path !== 'string') {
        throw new Error('Configuration path is required')
      }

      const sanitizedPath = sanitizeData(path)
      const sanitizedValue = sanitizeData(value)

      try {
        return await typedInvoke(
          'config-set',
          sanitizedPath as string,
          sanitizedValue,
        )
      } catch (error) {
        log.error('Failed to set config value:', error)
        throw new Error('Failed to update configuration')
      }
    },

    /**
     * Get entire configuration.
     */
    getAll: async (): Promise<Record<string, unknown>> => {
      try {
        return await typedInvoke('config-get-all')
      } catch (error) {
        log.error('Failed to get all config:', error)
        return {}
      }
    },

    /**
     * Get configuration section.
     */
    getSection: async (
      section: ConfigSection,
    ): Promise<Record<string, unknown>> => {
      if (!section || typeof section !== 'string') {
        throw new Error('Configuration section is required')
      }

      const sanitizedSection = sanitizeData(section) as ConfigSection

      try {
        const result = await typedInvoke('config-get-section', sanitizedSection)
        return result ?? {}
      } catch (error) {
        log.error('Failed to get config section:', error)
        return {}
      }
    },

    /**
     * Update multiple configuration values.
     */
    update: async (updates: Record<string, unknown>): Promise<boolean> => {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Configuration updates must be an object')
      }

      const sanitizedUpdates = sanitizeData(updates) as Record<string, unknown>

      try {
        return await typedInvoke('config-update', sanitizedUpdates)
      } catch (error) {
        log.error('Failed to update config:', error)
        throw new Error('Failed to update configuration')
      }
    },

    /**
     * Reset configuration to defaults.
     */
    reset: async (): Promise<void> => {
      try {
        await typedInvoke('config-reset')
      } catch (error) {
        log.error('Failed to reset config:', error)
        throw new Error('Failed to reset configuration')
      }
    },

    /**
     * Reset specific section to defaults.
     */
    resetSection: async (section: ConfigSection): Promise<void> => {
      if (!section || typeof section !== 'string') {
        throw new Error('Configuration section is required')
      }

      const sanitizedSection = sanitizeData(section) as ConfigSection

      try {
        await typedInvoke('config-reset-section', sanitizedSection)
      } catch (error) {
        log.error('Failed to reset config section:', error)
        throw new Error('Failed to reset configuration section')
      }
    },

    /**
     * Validate configuration.
     */
    validate: async (): Promise<{ isValid: boolean; errors: string[] }> => {
      try {
        return await typedInvoke('config-validate')
      } catch (error) {
        log.error('Failed to validate config:', error)
        return { isValid: false, errors: ['Validation failed'] }
      }
    },

    /**
     * Export configuration to file.
     *
     * The file path is chosen via a main-process save dialog — the renderer
     * cannot supply a path, so a compromised renderer cannot write to
     * arbitrary filesystem locations.
     */
    export: async (): Promise<boolean> => {
      try {
        return await typedInvoke('config-export')
      } catch (error) {
        log.error('Failed to export config:', error)
        throw new Error('Failed to export configuration')
      }
    },

    /**
     * Import configuration from file.
     *
     * The file path is chosen via a main-process open dialog — the renderer
     * cannot supply a path, so a compromised renderer cannot read from
     * arbitrary filesystem locations.
     */
    import: async (): Promise<boolean> => {
      try {
        return await typedInvoke('config-import')
      } catch (error) {
        log.error('Failed to import config:', error)
        throw new Error('Failed to import configuration')
      }
    },

    /**
     * Backup current configuration.
     */
    backup: async (): Promise<string | null> => {
      try {
        return await typedInvoke('config-backup')
      } catch (error) {
        log.error('Failed to backup config:', error)
        return null
      }
    },

    /**
     * Get configuration file paths.
     */
    getPaths: async (): Promise<{
      config: string
      windowState: string
      directory: string
    }> => {
      try {
        return await typedInvoke('config-get-paths')
      } catch (error) {
        log.error('Failed to get config paths:', error)
        return { config: '', windowState: '', directory: '' }
      }
    },
  },

  // Window state management APIs
  windowState: {
    /**
     * Get window state.
     */
    get: async (windowType: 'main' | 'floating') => {
      try {
        return await typedInvoke('window-state-get', windowType)
      } catch (error) {
        log.error('Failed to get window state:', error)
        return null
      }
    },

    /**
     * Set window state properties.
     */
    set: async (
      windowType: 'main' | 'floating',
      properties: Partial<WindowState>,
    ) => {
      try {
        return await typedInvoke('window-state-set', windowType, properties)
      } catch (error) {
        log.error('Failed to set window state:', error)
        throw new Error('Failed to update window state')
      }
    },

    /**
     * Reset window state to defaults.
     */
    reset: async (windowType: 'main' | 'floating') => {
      try {
        return await typedInvoke('window-state-reset', windowType)
      } catch (error) {
        log.error('Failed to reset window state:', error)
        throw new Error('Failed to reset window state')
      }
    },

    /**
     * Get window state statistics.
     */
    getStats: async () => {
      try {
        return await typedInvoke('window-state-get-stats')
      } catch (error) {
        log.error('Failed to get window state stats:', error)
        return null
      }
    },

    /**
     * Move window to specific display.
     */
    moveToDisplay: async (
      windowType: 'main' | 'floating',
      displayId: number,
    ): Promise<boolean> => {
      try {
        return await typedInvoke(
          'window-state-move-to-display',
          windowType,
          displayId,
        )
      } catch (error) {
        log.error('Failed to move window to display:', error)
        throw new Error('Failed to move window to display')
      }
    },

    /**
     * Snap window to edge of current display.
     */
    snapToEdge: async (
      windowType: 'main' | 'floating',
      edge:
        | 'left'
        | 'right'
        | 'top'
        | 'bottom'
        | 'top-left'
        | 'top-right'
        | 'bottom-left'
        | 'bottom-right'
        | 'maximize',
    ): Promise<boolean> => {
      try {
        return await typedInvoke('window-state-snap-to-edge', windowType, edge)
      } catch (error) {
        log.error('Failed to snap window to edge:', error)
        throw new Error('Failed to snap window to edge')
      }
    },

    /**
     * Get display information for a window.
     */
    getDisplay: async (windowType: 'main' | 'floating') => {
      try {
        return await typedInvoke('window-state-get-display', windowType)
      } catch (error) {
        log.error('Failed to get window display:', error)
        return null
      }
    },

    /**
     * Get all available displays.
     */
    getAllDisplays: async () => {
      try {
        return await typedInvoke('window-state-get-all-displays')
      } catch (error) {
        log.error('Failed to get all displays:', error)
        return []
      }
    },
  },

  // App information and controls
  app: {
    /**
     * Get app version.
     */
    getVersion: async (): Promise<string> => {
      try {
        return await typedInvoke('app-version')
      } catch (error) {
        log.error('Failed to get app version:', error)
        return 'unknown'
      }
    },

    /**
     * Quit application.
     */
    quit: async (): Promise<void> => {
      try {
        return await typedInvoke('app-quit')
      } catch (error) {
        log.error('Failed to quit app:', error)
      }
    },
  },

  // Deep linking APIs
  deepLink: {
    /**
     * Generate deep link URL.
     */
    generateUrl: async (
      action: string,
      params: Record<string, unknown> = {},
    ): Promise<string | null> => {
      if (!action || typeof action !== 'string') {
        throw new Error('Action is required')
      }

      const sanitizedAction = sanitizeData(action)
      const sanitizedParams = sanitizeData(params)

      try {
        return await typedInvoke(
          'deep-link-generate',
          sanitizedAction as string,
          sanitizedParams as Record<string, unknown>,
        )
      } catch (error) {
        log.error('Failed to generate deep link:', error)
        return null
      }
    },

    /**
     * Get example deep link URLs.
     */
    getExamples: async (): Promise<DeepLinkExamples | null> => {
      try {
        return await typedInvoke('deep-link-get-examples')
      } catch (error) {
        log.error('Failed to get deep link examples:', error)
        return null
      }
    },

    /**
     * Handle deep link URL manually.
     */
    handleUrl: async (url: string): Promise<boolean> => {
      if (!url || typeof url !== 'string') {
        throw new Error('URL is required')
      }

      const sanitizedUrl = sanitizeData(url)

      try {
        return await typedInvoke('deep-link-handle-url', sanitizedUrl as string)
      } catch (error) {
        log.error('Failed to handle deep link:', error)
        return false
      }
    },
  },

  // Settings APIs
  settings: {
    /**
     * Set hide app icon (Dock visibility) - macOS only.
     */
    setHideAppIcon: async (hide: boolean): Promise<boolean> => {
      if (typeof hide !== 'boolean') {
        throw new Error('Hide must be a boolean')
      }

      try {
        return await typedInvoke('settings:setHideAppIcon', hide)
      } catch (error) {
        log.error('Failed to set hide app icon:', error)
        return false
      }
    },

    /**
     * Set show in menu bar - not yet implemented.
     */
    setShowInMenuBar: async (show: boolean): Promise<boolean> => {
      if (typeof show !== 'boolean') {
        throw new Error('Show must be a boolean')
      }

      try {
        return await typedInvoke('settings:setShowInMenuBar', show)
      } catch (error) {
        log.error('Failed to set show in menu bar:', error)
        return false
      }
    },

    /**
     * Set start at login.
     */
    setStartAtLogin: async (startAtLogin: boolean): Promise<boolean> => {
      if (typeof startAtLogin !== 'boolean') {
        throw new Error('StartAtLogin must be a boolean')
      }

      try {
        return await typedInvoke('settings:setStartAtLogin', startAtLogin)
      } catch (error) {
        log.error('Failed to set start at login:', error)
        return false
      }
    },
  },

  // Secure event listener management
  on: (
    channel: string,
    callback: (event: IpcRendererEvent, ...args: unknown[]) => void,
  ): (() => void) | undefined => {
    if (!validateChannel(channel)) {
      log.error(`Attempted to listen to unauthorized channel: ${channel}`)
      return
    }

    if (typeof callback !== 'function') {
      log.error('Callback must be a function')
      return
    }

    // Wrap callback to sanitize incoming data
    const wrappedCallback = (
      event: IpcRendererEvent,
      ...args: unknown[]
    ): void => {
      try {
        const sanitizedArgs = args.map((arg) => sanitizeData(arg))
        callback(event, ...sanitizedArgs)
      } catch (error) {
        log.error('Error in event callback:', error)
      }
    }

    ipcRenderer.on(channel, wrappedCallback)

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback)
    }
  },

  /**
   * @deprecated Use the cleanup function returned by `on()` instead.
   *
   * This method cannot work correctly because `on()` wraps the callback.
   * The original callback passed here won't match the registered listener.
   *
   * @example
   * // Correct usage:
   * const cleanup = api.on('channel', callback)
   * cleanup() // Removes the listener
   *
   * // Incorrect (won't work):
   * api.removeListener('channel', callback)
   */
  removeListener: (
    channel: string,
    _callback: (...args: unknown[]) => void,
  ): void => {
    if (!validateChannel(channel)) {
      log.error(
        `Attempted to remove listener from unauthorized channel: ${channel}`,
      )
      return
    }

    log.warn(
      `removeListener is deprecated. Use the cleanup function returned by on() instead. Channel: ${channel}`,
    )
  },

  // Remove all listeners for a channel
  removeAllListeners: (channel: string): void => {
    if (!validateChannel(channel)) {
      log.error(
        `Attempted to remove all listeners from unauthorized channel: ${channel}`,
      )
      return
    }

    ipcRenderer.removeAllListeners(channel)
  },

  // Auto-updater operations
  updater: {
    /**
     * Check for application updates.
     */
    checkForUpdates: async () => {
      try {
        return await typedInvoke('updater-check-for-updates')
      } catch (error) {
        log.error('Failed to check for updates:', error)
        return false
      }
    },

    /**
     * Quit and install update.
     */
    quitAndInstall: async () => {
      try {
        return await typedInvoke('updater-quit-and-install')
      } catch (error) {
        log.error('Failed to quit and install update:', error)
        return false
      }
    },

    /**
     * Get update status.
     */
    getStatus: async () => {
      try {
        return await typedInvoke('updater-get-status')
      } catch (error) {
        log.error('Failed to get update status:', error)
        return { updateAvailable: false, updateDownloaded: false }
      }
    },
  },

  // System tray APIs (for testing)
  tray: {
    /**
     * Click tray icon (for testing).
     */
    click: async (): Promise<void> => {
      try {
        await typedInvoke('tray-show-notification', 'Test', 'Tray clicked')
      } catch (error) {
        log.error('Failed to click tray:', error)
      }
    },
  },

  // Display management APIs
  display: {
    /**
     * Get all displays.
     */
    getAllDisplays: async () => {
      try {
        return await typedInvoke('window-state-get-all-displays')
      } catch (error) {
        log.error('Failed to get all displays:', error)
        return []
      }
    },
  },

  // Test utilities (for E2E testing)
  test: {
    /**
     * Simulate network error.
     */
    simulateError: async (errorType: string): Promise<boolean> => {
      try {
        log.info(`Simulating ${errorType} error for testing`)
        return true
      } catch (error) {
        log.error('Failed to simulate error:', error)
        return false
      }
    },

    /**
     * Clear test errors.
     */
    clearErrors: async (): Promise<boolean> => {
      try {
        log.info('Clearing test errors')
        return true
      } catch (error) {
        log.error('Failed to clear errors:', error)
        return false
      }
    },
  },
})

/**
 * Expose environment information to renderer.
 *
 * This provides safe, read-only access to environment details
 * that the renderer might need for:
 * - Platform-specific UI adjustments
 * - Debugging and error reporting
 * - Feature detection
 * - Version compatibility checks
 *
 * Why is this safe to expose?
 * - All values are read-only
 * - No sensitive system information
 * - Can't be used to access Node.js APIs
 * - Useful for conditional rendering based on platform
 */
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true, // Flag to detect Electron environment
  platform: process.platform, // Node's process.platform: 'darwin', 'win32', 'linux', etc.
  versions: {
    node: process.versions.node, // Node.js version
    chrome: process.versions.chrome, // Chromium version
    electron: process.versions.electron, // Electron version
  },
})

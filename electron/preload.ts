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
import {
  createAuthBridge,
  createOAuthBridge,
} from './preload-shared/auth-oauth-bridge'
import type {
  AuxWindowVisibility,
  ConfigSection,
  DeepLinkExamples,
  IPCEventChannel,
  IPCResponse,
  NotificationOptions,
  NotificationPreferences,
  ShortcutDefinition,
  StartupWindowConfig,
  TrayIconState,
  WindowBounds,
  WindowState,
} from './types/ipc'
import { DEFAULT_STARTUP_WINDOW_CONFIG } from './types/ipc'

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

// `ElectronUserData` / `OAuthCallbackData` now live alongside the bridge
// factories in `./preload-shared/auth-oauth-bridge` (single source for every
// window's auth/oauth surface).

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
  'updater-download-progress': true,
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
  // Consumed by the floating window's preload (§6d keep-on-top sync); listed
  // here too because AllowedChannelsMap is exhaustive over IPCEventChannels.
  'floating-window-always-on-top-changed': true,
  'braindump-category-changed': true,
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

  // Window control APIs. The retired main window's minimize/close (T18) are
  // gone; what remains here drives the floating navigator + window bounds.
  window: {
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

    /**
     * Read which auxiliary windows (floating navigator, brain dump) are visible
     * right now, so the settings UI can label a "Try it now" action correctly.
     * @returns Live visibility flags; `{ floating: false, braindump: false }` on error.
     * @example
     * const { floating } = await window.electronAPI.window.getAuxVisibility()
     */
    getAuxVisibility: async (): Promise<AuxWindowVisibility> => {
      try {
        return await typedInvoke('window-get-aux-visibility')
      } catch (error) {
        log.error('Failed to read auxiliary window visibility:', error)
        return { floating: false, braindump: false }
      }
    },
  },

  /**
   * Shared controls for floating utility panels.
   *
   * Settings uses this narrow surface instead of raw config writes so the main
   * process can persist the preference and update already-open BrowserWindows.
   */
  floatingPanels: {
    /** Read whether Floating Navigator and BrainDump follow macOS Spaces. */
    getVisibleOnAllWorkspaces: async (): Promise<boolean> => {
      try {
        return await typedInvoke(
          'floating-window-get-visible-on-all-workspaces',
        )
      } catch (error) {
        log.error('Failed to get floating panels desktop setting:', error)
        return false
      }
    },
    /** Persist and apply the macOS Spaces-following behavior. */
    setVisibleOnAllWorkspaces: async (enabled: boolean): Promise<boolean> => {
      if (typeof enabled !== 'boolean') {
        throw new Error('VisibleOnAllWorkspaces must be a boolean')
      }
      try {
        return await typedInvoke(
          'floating-window-set-visible-on-all-workspaces',
          enabled,
        )
      } catch (error) {
        log.error('Failed to set floating panels desktop setting:', error)
        throw error
      }
    },
    /**
     * Read FloatingNavigator's always-on-top preference (effective state: the
     * live window when open, else the persisted relaunch value).
     */
    getFloatingNavigatorAlwaysOnTop: async (): Promise<boolean> => {
      try {
        return await typedInvoke('floating-window-get-always-on-top')
      } catch (error) {
        log.error('Failed to get floating navigator always-on-top:', error)
        // Floating defaults to pinned — fail to its config default.
        return true
      }
    },
    /** Persist and apply FloatingNavigator's always-on-top preference. */
    setFloatingNavigatorAlwaysOnTop: async (
      enabled: boolean,
    ): Promise<boolean> => {
      if (typeof enabled !== 'boolean') {
        throw new Error('FloatingNavigator alwaysOnTop must be a boolean')
      }
      try {
        return await typedInvoke('floating-window-set-always-on-top', enabled)
      } catch (error) {
        log.error('Failed to set floating navigator always-on-top:', error)
        throw error
      }
    },
    /** Read BrainDump's always-on-top preference (config-backed, default off). */
    getBrainDumpAlwaysOnTop: async (): Promise<boolean> => {
      try {
        return await typedInvoke('braindump-window-get-always-on-top')
      } catch (error) {
        log.error('Failed to get braindump always-on-top:', error)
        // BrainDump defaults to unpinned.
        return false
      }
    },
    /** Persist and apply BrainDump's always-on-top preference. */
    setBrainDumpAlwaysOnTop: async (enabled: boolean): Promise<boolean> => {
      if (typeof enabled !== 'boolean') {
        throw new Error('BrainDump alwaysOnTop must be a boolean')
      }
      try {
        return await typedInvoke('braindump-window-set-always-on-top', enabled)
      } catch (error) {
        log.error('Failed to set braindump always-on-top:', error)
        throw error
      }
    },
    /** Read FloatingNavigator's global toggle accelerator (empty when disabled). */
    getFloatingNavigatorShortcut: async (): Promise<string> => {
      try {
        return await typedInvoke('floating-config-get-shortcut')
      } catch (error) {
        log.error('Failed to get floating navigator shortcut:', error)
        return ''
      }
    },
    /** Persist + register FloatingNavigator's toggle accelerator; false on conflict. */
    setFloatingNavigatorShortcut: async (
      accelerator: string,
    ): Promise<boolean> => {
      if (typeof accelerator !== 'string') {
        throw new Error('FloatingNavigator shortcut must be a string')
      }
      try {
        return await typedInvoke('floating-config-set-shortcut', accelerator)
      } catch (error) {
        log.error('Failed to set floating navigator shortcut:', error)
        throw error
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

  // Authentication management (shared factory — single source for every window)
  auth: createAuthBridge(sanitizeData),

  // OAuth management (shared factory — full browser-based OAuth surface)
  oauth: createOAuthBridge(sanitizeData),

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
     * Show or hide the macOS menu-bar (tray) icon — bridges to
     * `settings:setShowInMenuBar`, which calls SystemTrayManager.setMenuBarVisible.
     * @param show - true creates/keeps the tray icon, false tears it down.
     * @returns Promise<boolean> success; false on a thrown error or when the
     *   handler could not apply the change (e.g. tray creation failed).
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

    /**
     * Read the OS login-item state from the main process.
     *
     * @returns The current login-item settings, or openAtLogin=false on failure.
     * @example
     * const { openAtLogin } = await window.electronAPI.settings.getLoginItemSettings()
     */
    getLoginItemSettings: async (): Promise<
      IPCResponse<'settings:getLoginItemSettings'>
    > => {
      try {
        return await typedInvoke('settings:getLoginItemSettings')
      } catch (error) {
        log.error('Failed to read login item settings:', error)
        return { openAtLogin: false }
      }
    },

    /**
     * Persist which window(s) open at Electron launch (brain dump / floating
     * navigator). The >=1-true invariant is enforced in the main process, so an
     * all-false request is repaired (showFloating forced back on) before
     * saving — this call still resolves true in that case.
     * @param config - The two startup-window booleans.
     * @returns true when persisted; false on IPC/validation failure.
     * @example
     * await window.electronAPI.settings.setStartupConfig({ showBraindump: true, showFloating: false })
     */
    setStartupConfig: async (config: StartupWindowConfig): Promise<boolean> => {
      try {
        // Defense-in-depth: strip forbidden keys / trim strings, then assert both
        // flags are real booleans before crossing the IPC boundary, so a
        // malformed renderer payload can never poison the persisted config.
        const sanitized = sanitizeData(config) as Partial<StartupWindowConfig>
        if (
          typeof sanitized.showBraindump !== 'boolean' ||
          typeof sanitized.showFloating !== 'boolean'
        ) {
          throw new Error('Startup config flags must be booleans')
        }
        return await typedInvoke('settings:setStartupConfig', {
          showBraindump: sanitized.showBraindump,
          showFloating: sanitized.showFloating,
        })
      } catch (error) {
        log.error('Failed to set startup window config:', error)
        return false
      }
    },

    /**
     * Read the persisted startup-window config so the settings UI can show the
     * saved choice. On IPC failure it returns the Floating-only default (which
     * satisfies the >=1-true invariant), so the UI never renders an all-off state.
     * @returns The saved startup-window config, or the Floating-only default on failure.
     * @example
     * const startup = await window.electronAPI.settings.getStartupConfig() // => { showBraindump: false, showFloating: true }
     */
    getStartupConfig: async (): Promise<StartupWindowConfig> => {
      try {
        return await typedInvoke('settings:getStartupConfig')
      } catch (error) {
        log.error('Failed to read startup window config:', error)
        return { ...DEFAULT_STARTUP_WINDOW_CONFIG }
      }
    },

    /**
     * Resets the Settings popover window to default size (360×380) and
     * re-anchors it to the tray icon. Returns false on IPC failure.
     * @returns true on success, false on failure.
     * @example
     * await window.electronAPI.settings.resetPopoverSize()
     */
    resetPopoverSize: async (): Promise<boolean> => {
      try {
        return await typedInvoke('settings:resetPopoverSize')
      } catch (error) {
        log.error('Failed to reset settings popover size:', error)
        return false
      }
    },
  },

  /**
   * BrainDump Note window controls — exposed to the main window's Settings UI.
   *
   * The BrainDump renderer has its own preload (`preload-braindump.ts`) for
   * window-local operations. These methods let the Settings page configure
   * BrainDump from the *main* window without opening it.
   */
  brainDump: {
    /** Toggle BrainDump window visibility. */
    toggle: async (): Promise<void> => {
      try {
        await typedInvoke('braindump-window-toggle')
      } catch (error) {
        // Re-throw so the renderer can react (toast, retry); a swallowed
        // failure leaves the user thinking the toggle worked.
        log.error('Failed to toggle BrainDump:', error)
        throw error
      }
    },
    /** Open the BrainDump window (additive — only shows, never hides). */
    show: async (): Promise<void> => {
      try {
        await typedInvoke('braindump-window-show')
      } catch (error) {
        // Re-throw so a failed "Try it now" surfaces to the user instead of
        // silently doing nothing.
        log.error('Failed to show BrainDump:', error)
        throw error
      }
    },
    /** Read window opacity (clamped 0.30–1.00 in main). */
    getOpacity: async (): Promise<number> => {
      try {
        return await typedInvoke('braindump-window-get-opacity')
      } catch (error) {
        log.error('Failed to get BrainDump opacity:', error)
        return 1.0
      }
    },
    /** Persist + apply window opacity. */
    setOpacity: async (value: number): Promise<number> => {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error('Opacity must be a number')
      }
      try {
        return await typedInvoke('braindump-window-set-opacity', value)
      } catch (error) {
        // Re-throw — returning the requested value masks failure and the
        // Settings UI cannot roll back to the last good opacity.
        log.error('Failed to set BrainDump opacity:', error)
        throw error
      }
    },
    /** Read "follow FloatingNav category" toggle. */
    getSyncMode: async (): Promise<boolean> => {
      try {
        return await typedInvoke('braindump-config-get-sync')
      } catch (error) {
        log.error('Failed to get BrainDump sync mode:', error)
        return true
      }
    },
    /** Update "follow FloatingNav category" toggle. */
    setSyncMode: async (enabled: boolean): Promise<boolean> => {
      if (typeof enabled !== 'boolean') {
        throw new Error('SyncMode must be a boolean')
      }
      try {
        return await typedInvoke('braindump-config-set-sync', enabled)
      } catch (error) {
        log.error('Failed to set BrainDump sync mode:', error)
        throw error
      }
    },
    /** Read global accelerator (empty string disables the shortcut). */
    getShortcut: async (): Promise<string> => {
      try {
        return await typedInvoke('braindump-config-get-shortcut')
      } catch (error) {
        log.error('Failed to get BrainDump shortcut:', error)
        return ''
      }
    },
    /** Persist + register global accelerator. */
    setShortcut: async (accelerator: string): Promise<boolean> => {
      if (typeof accelerator !== 'string') {
        throw new Error('Shortcut must be a string')
      }
      try {
        return await typedInvoke('braindump-config-set-shortcut', accelerator)
      } catch (error) {
        log.error('Failed to set BrainDump shortcut:', error)
        throw error
      }
    },
  },

  // Secure event listener management.
  //
  // Callbacks receive only the sanitized main-process payload — the
  // IpcRendererEvent argument is intentionally dropped so listeners can be
  // written as `(data) => …` to match the typed `on<C>()` contract in
  // `electron-api.d.ts` (`callback: (data: IPCEventData<C>) => void`). This
  // also aligns with the BrainDump preload's behavior.
  on: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ): (() => void) | undefined => {
    if (!validateChannel(channel)) {
      log.error(`Attempted to listen to unauthorized channel: ${channel}`)
      return
    }

    if (typeof callback !== 'function') {
      log.error('Callback must be a function')
      return
    }

    const wrappedCallback = (
      _event: IpcRendererEvent,
      ...args: unknown[]
    ): void => {
      try {
        const sanitizedArgs = args.map((arg) => sanitizeData(arg))
        callback(...sanitizedArgs)
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
        return {
          updateAvailable: false,
          updateDownloaded: false,
          downloadProgress: null,
        }
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

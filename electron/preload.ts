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
 * - Constrain IPC channels at compile time (see `typedInvoke`)
 * - Keep the exposed API surface minimal
 *
 * @module electron/preload
 */

import { contextBridge } from 'electron'

import { typedInvoke } from './ipc/typedInvoke'
import { log } from './logger'
import {
  createAuthBridge,
  createOAuthBridge,
} from './preload-shared/auth-oauth-bridge'
import { sanitizeData } from './preload-shared/sanitize-data'
import type { ConfigSection, IPCResponse } from './types/ipc'

// ============================================================================
// Type Definitions
// ============================================================================

// `ElectronUserData` / `OAuthCallbackData` now live alongside the bridge
// factories in `./preload-shared/auth-oauth-bridge` (single source for every
// window's auth/oauth surface).

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
const electronAPI = {
  /**
   * Note: Todo operations removed - WebView architecture uses oRPC via HTTP.
   * The web app (loaded in WebView) handles all data operations through
   * the same oRPC client used by the browser version.
   */

  /**
   * LiveEditor panel controls. `floatingPanels` is the legacy wire name — frozen
   * preloads expose it and the renderer reads it; do not rename.
   *
   * Settings uses this narrow surface instead of raw config writes so the main
   * process can persist the setting and update already-open BrowserWindows.
   */
  floatingPanels: {
    /** Read whether LiveEditor follows macOS Spaces. */
    getVisibleOnAllWorkspaces: async (): Promise<boolean> => {
      try {
        return await typedInvoke('live-editor-get-visible-on-all-workspaces')
      } catch (error) {
        log.error('Failed to get panel desktop setting:', error)
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
          'live-editor-set-visible-on-all-workspaces',
          enabled,
        )
      } catch (error) {
        log.error('Failed to set panel desktop setting:', error)
        throw error
      }
    },
    /** Read LiveEditor's always-on-top setting (config-backed, default off). */
    getLiveEditorAlwaysOnTop: async (): Promise<boolean> => {
      try {
        return await typedInvoke('live-editor-window-get-always-on-top')
      } catch (error) {
        log.error('Failed to get liveEditor always-on-top:', error)
        // LiveEditor defaults to unpinned.
        return false
      }
    },
    /** Persist and apply LiveEditor's always-on-top setting. */
    setLiveEditorAlwaysOnTop: async (enabled: boolean): Promise<boolean> => {
      if (typeof enabled !== 'boolean') {
        throw new Error('LiveEditor alwaysOnTop must be a boolean')
      }
      try {
        return await typedInvoke(
          'live-editor-window-set-always-on-top',
          enabled,
        )
      } catch (error) {
        log.error('Failed to set liveEditor always-on-top:', error)
        throw error
      }
    },
  },

  // Authentication management (shared factory — single source for every window)
  auth: createAuthBridge(),

  // OAuth management (shared factory — full browser-based OAuth surface)
  oauth: createOAuthBridge(),

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

    /**
     * Open config.json in the default application.
     *
     * The path is resolved in the main process from ConfigManager — the renderer
     * cannot supply a filesystem target.
     */
    open: async (): Promise<boolean> => {
      try {
        return await typedInvoke('config-open')
      } catch (error) {
        log.error('Failed to open config file:', error)
        return false
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
   * LiveEditor Note window controls — exposed to the main window's Settings UI.
   *
   * The LiveEditor renderer has its own preload (`preload-live-editor.ts`) for
   * window-local operations. These methods let the Settings page configure
   * LiveEditor from the *main* window without opening it.
   */
  liveEditor: {
    /** Toggle LiveEditor window visibility. */
    toggle: async (): Promise<void> => {
      try {
        await typedInvoke('live-editor-window-toggle')
      } catch (error) {
        // Re-throw so the renderer can react (toast, retry); a swallowed
        // failure leaves the user thinking the toggle worked.
        log.error('Failed to toggle LiveEditor:', error)
        throw error
      }
    },
    /** Open the LiveEditor window (additive — only shows, never hides). */
    show: async (): Promise<void> => {
      try {
        await typedInvoke('live-editor-window-show')
      } catch (error) {
        // Re-throw so a failed "Try it now" surfaces to the user instead of
        // silently doing nothing.
        log.error('Failed to show LiveEditor:', error)
        throw error
      }
    },
    /** Read window opacity (clamped 0.30–1.00 in main). */
    getOpacity: async (): Promise<number> => {
      try {
        return await typedInvoke('live-editor-window-get-opacity')
      } catch (error) {
        log.error('Failed to get LiveEditor opacity:', error)
        return 1.0
      }
    },
    /** Persist + apply window opacity. */
    setOpacity: async (value: number): Promise<number> => {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error('Opacity must be a number')
      }
      try {
        return await typedInvoke('live-editor-window-set-opacity', value)
      } catch (error) {
        // Re-throw — returning the requested value masks failure and the
        // Settings UI cannot roll back to the last good opacity.
        log.error('Failed to set LiveEditor opacity:', error)
        throw error
      }
    },
    /** Read global accelerator (empty string disables the shortcut). */
    getShortcut: async (): Promise<string> => {
      try {
        return await typedInvoke('live-editor-config-get-shortcut')
      } catch (error) {
        log.error('Failed to get LiveEditor shortcut:', error)
        return ''
      }
    },
    /** Persist + register global accelerator. */
    setShortcut: async (accelerator: string): Promise<boolean> => {
      if (typeof accelerator !== 'string') {
        throw new Error('Shortcut must be a string')
      }
      try {
        return await typedInvoke('live-editor-config-set-shortcut', accelerator)
      } catch (error) {
        log.error('Failed to set LiveEditor shortcut:', error)
        throw error
      }
    },
    /** Read the optional SECOND global accelerator (empty string when unset). */
    getShortcutSecondary: async (): Promise<string> => {
      try {
        return await typedInvoke('live-editor-config-get-shortcut-secondary')
      } catch (error) {
        log.error('Failed to get second LiveEditor shortcut:', error)
        return ''
      }
    },
    /** Persist + register the optional SECOND global accelerator. */
    setShortcutSecondary: async (accelerator: string): Promise<boolean> => {
      if (typeof accelerator !== 'string') {
        throw new Error('Shortcut must be a string')
      }
      try {
        return await typedInvoke(
          'live-editor-config-set-shortcut-secondary',
          accelerator,
        )
      } catch (error) {
        log.error('Failed to set second LiveEditor shortcut:', error)
        throw error
      }
    },
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
}

contextBridge.exposeInMainWorld('electronAPI', {
  ...electronAPI,
  floatingPanels: {
    ...electronAPI.floatingPanels,
    // Method aliases cover an older deployed renderer running immediately
    // after the packaged app updates to the renamed preload.
    getBrainDumpAlwaysOnTop:
      electronAPI.floatingPanels.getLiveEditorAlwaysOnTop,
    setBrainDumpAlwaysOnTop:
      electronAPI.floatingPanels.setLiveEditorAlwaysOnTop,
  },
  // A deployed renderer and installed preload update independently; keep the
  // previous namespace until every supported desktop version has crossed over.
  brainDump: electronAPI.liveEditor,
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
})

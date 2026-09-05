/**
 * @fileoverview Global type declarations for Electron API exposed via contextBridge.
 *
 * This file augments the global Window interface to include the electronAPI
 * object that is exposed by the preload script. These types are available
 * in both Electron renderer process and can be shared with the Next.js app.
 *
 * @module electron/types/electron-api
 */

import type {
  AuthUserPayload,
  OAuthProvider,
  OAuthResult,
  PendingSignInToken,
  ConfigSection,
  UpdaterStatus,
  IPCResponse,
} from './ipc'

/**
 * Electron API exposed to renderer via contextBridge.
 *
 * All methods are async as they communicate with the main process via IPC.
 * Error handling is built into each method - they log errors and return
 * sensible defaults rather than throwing.
 */
export interface ElectronAPI {
  /**
   * Authentication operations.
   */
  auth: {
    /** Get current user */
    getUser: () => Promise<AuthUserPayload | null>
    /** Set current user */
    setUser: (user: AuthUserPayload) => Promise<AuthUserPayload>
    /** Logout current user */
    logout: () => Promise<boolean>
    /** Check if authenticated */
    isAuthenticated: () => Promise<boolean>
    /** Sync auth state from web */
    syncFromWeb: (user: AuthUserPayload) => Promise<boolean>
  }

  /**
   * OAuth browser-based authentication.
   */
  oauth: {
    /** Start OAuth flow in external browser */
    start: (provider: OAuthProvider) => Promise<OAuthResult>
    /** Get supported OAuth providers */
    getSupportedProviders: () => Promise<OAuthProvider[]>
    /** Cancel pending OAuth flow */
    cancel: () => Promise<void>
    /** Listen for OAuth error */
    onError: (
      callback: (data: { provider: OAuthProvider; error: string }) => void,
    ) => () => void
    /** Listen for sign-in token */
    onSignInToken: (
      callback: (data: { token: string; provider: OAuthProvider }) => void,
    ) => () => void
    /** Get pending sign-in token */
    getPendingToken: () => Promise<PendingSignInToken | null>
    /** Clear pending sign-in token */
    clearPendingToken: () => Promise<void>
  }

  /**
   * Configuration management.
   */
  config: {
    /** Get config value by path */
    get: <T = unknown>(path: string) => Promise<T>
    /** Set config value by path */
    set: <T = unknown>(path: string, value: T) => Promise<boolean>
    /** Get all config values */
    getAll: () => Promise<Record<string, unknown>>
    /** Get config section */
    getSection: (
      section: ConfigSection,
    ) => Promise<Record<string, unknown> | null>
    /** Update multiple config values */
    update: (updates: Record<string, unknown>) => Promise<boolean>
    /** Reset all config to defaults */
    reset: () => Promise<boolean>
    /** Reset config section to defaults */
    resetSection: (section: ConfigSection) => Promise<boolean>
    /** Validate config values */
    validate: () => Promise<{ isValid: boolean; errors: string[] }>
    /** Export config — main process shows a save dialog; no path from renderer */
    export: () => Promise<boolean>
    /** Import config — main process shows an open dialog; no path from renderer */
    import: () => Promise<boolean>
    /** Create config backup */
    backup: () => Promise<string | null>
    /** Get config file paths */
    getPaths: () => Promise<{
      config: string
      windowState: string
      directory: string
    }>
    /** Open config.json in the default application (path resolved in main process) */
    open: () => Promise<boolean>
    /** Save config to file (no-op - config auto-persists on modification) */
    save?: () => Promise<boolean>
    /** Load config from file (async via IPC) */
    load?: () => Promise<Record<string, unknown>>
  }

  /**
   * Shared settings for the LiveEditor panel.
   *
   * `floatingPanels` is the legacy wire name — frozen preloads in installed
   * builds expose it under this key; do not rename.
   */
  floatingPanels?: {
    /** Read whether LiveEditor follows macOS Spaces. */
    getVisibleOnAllWorkspaces: () => Promise<boolean>
    /** Persist and apply whether LiveEditor follows macOS Spaces. */
    setVisibleOnAllWorkspaces: (enabled: boolean) => Promise<boolean>
    /** Read LiveEditor's always-on-top setting (config-backed, default off). */
    getLiveEditorAlwaysOnTop: () => Promise<boolean>
    /** Persist and apply LiveEditor's always-on-top setting. */
    setLiveEditorAlwaysOnTop: (enabled: boolean) => Promise<boolean>
    /** @deprecated Pre-rename installed preload method; use `getLiveEditorAlwaysOnTop`. */
    getBrainDumpAlwaysOnTop?: () => Promise<boolean>
    /** @deprecated Pre-rename installed preload method; use `setLiveEditorAlwaysOnTop`. */
    setBrainDumpAlwaysOnTop?: (enabled: boolean) => Promise<boolean>
  }

  /**
   * App operations.
   */
  app: {
    /** Get app version */
    getVersion: () => Promise<string>
    /** Quit app */
    quit: () => Promise<void>
  }

  /**
   * Auto-updater operations.
   */
  updater: {
    /** Check for updates */
    checkForUpdates: () => Promise<boolean>
    /** Quit and install update */
    quitAndInstall: () => Promise<void>
    /** Get current update status */
    getStatus: () => Promise<UpdaterStatus>
    /** Listen for update messages */
    onMessage: (
      callback: (data: {
        type: 'checking' | 'available' | 'downloaded' | 'error'
        message?: string
      }) => void,
    ) => () => void
  }

  /**
   * Electron-specific settings management.
   * Controls app behavior like dock visibility and startup settings.
   */
  settings?: {
    /**
     * Set whether the app icon should be hidden from the dock (macOS).
     * @param hide - true to hide from dock, false to show
     * @returns Promise resolving to success status
     */
    setHideAppIcon: (hide: boolean) => Promise<boolean>
    /**
     * Set whether the app should show in the menu bar.
     * @param show - true to show in menu bar, false to hide
     * @returns Promise resolving to success status
     */
    setShowInMenuBar: (show: boolean) => Promise<boolean>
    /**
     * Set whether the app should start at system login.
     * @param enable - true to enable start at login, false to disable
     * @returns Promise resolving to success status
     */
    setStartAtLogin: (enable: boolean) => Promise<boolean>
    /**
     * Read the current OS login-item settings.
     * @returns Promise resolving to the login-item state
     */
    getLoginItemSettings: () => Promise<
      IPCResponse<'settings:getLoginItemSettings'>
    >
    /**
     * Resets the Settings popover window to default size (360×380) and
     * re-anchors it to the tray icon.
     * @returns Promise resolving to true on success, false on IPC failure.
     */
    resetPopoverSize: () => Promise<boolean>
  }

  /**
   * LiveEditor Note window configuration from the main window's Settings UI.
   *
   * Mirrors the `LiveEditorAPI` exposed inside the LiveEditor window itself
   * (`preload-live-editor.ts`), but only includes the surface a settings page
   * needs (no per-category note CRUD). All methods log + return safe defaults
   * on failure rather than throwing.
   */
  liveEditor?: LiveEditorSettingsAPI
  /** @deprecated Pre-rename installed clients expose this namespace; use `liveEditor`. */
  brainDump?: LiveEditorSettingsAPI
}

/** LiveEditor configuration controls exposed to the main Settings renderer. */
export interface LiveEditorSettingsAPI {
  /** Toggle LiveEditor window visibility. */
  toggle: () => Promise<void>
  /** Open the LiveEditor window (additive — only shows, never hides). */
  show: () => Promise<void>
  /** Read current opacity (already clamped to [0.30, 1.00]). */
  getOpacity: () => Promise<number>
  /** Persist + apply opacity; returns the clamped value the main applied. */
  setOpacity: (value: number) => Promise<number>
  /** Read the global accelerator (empty string when disabled). */
  getShortcut: () => Promise<string>
  /** Persist + register the global accelerator. */
  setShortcut: (accelerator: string) => Promise<boolean>
  /** Read the optional second accelerator; callers must feature-detect for preload skew. */
  getShortcutSecondary?: () => Promise<string>
  /** Persist + register the optional second accelerator. */
  setShortcutSecondary?: (accelerator: string) => Promise<boolean>
}

/**
 * Electron environment information exposed via preload.
 */
export interface ElectronEnv {
  /** Whether running in Electron */
  isElectron: true
  /** Platform identifier */
  platform: NodeJS.Platform
}

/**
 * LiveEditor API exposed via contextBridge in preload-live-editor.ts.
 *
 * Provides:
 * - `window.*` — frameless panel controls (close/toggle/opacity/bounds)
 * - `note.*`   — per-category text persistence
 * - `spaces.*` — macOS Spaces tracking for the panel
 */
export interface LiveEditorAPI {
  window: {
    /** Hide the LiveEditor window (kept in memory for fast re-show). */
    close: () => Promise<void>
    /** Toggle LiveEditor visibility (mirror of the global accelerator). */
    toggle: () => Promise<void>
    /**
     * Set window opacity. Main process clamps to [0.30, 1.00].
     */
    setOpacity: (value: number) => Promise<void>
    /** Get current window opacity (already clamped). */
    getOpacity: () => Promise<number>
    /** Get current window bounds, or null if window is gone. */
    getBounds: () => Promise<{
      x: number
      y: number
      width: number
      height: number
    } | null>
    /** Set window bounds (also persisted via WindowStateManager). */
    setBounds: (bounds: {
      x: number
      y: number
      width: number
      height: number
    }) => Promise<void>
  }
  note: {
    /** Read persisted note text for a category (empty string when none). */
    get: (categoryId: number) => Promise<string>
    /** Persist note text for a category. */
    set: (categoryId: number, text: string) => Promise<void>
  }
  spaces: {
    /** Read whether LiveEditor follows macOS Spaces. */
    getVisibleOnAllWorkspaces: () => Promise<boolean>
    /** Persist and apply whether LiveEditor follows macOS Spaces. */
    setVisibleOnAllWorkspaces: (enabled: boolean) => Promise<boolean>
  }
}

/**
 * LiveEditor environment information exposed via preload-live-editor.ts.
 */
export interface LiveEditorEnv {
  /** Whether running in Electron */
  isElectron: boolean
  /** Whether this is the LiveEditor Note window */
  isLiveEditor: boolean
  /** Platform identifier */
  platform: string
}

// ============================================================================
// Global Window Augmentation
// ============================================================================

declare global {
  interface Window {
    /**
     * Electron API exposed via contextBridge.
     * Only available when running in Electron environment.
     */
    electronAPI?: ElectronAPI

    /**
     * Electron environment information.
     * Only available when running in Electron environment.
     */
    electronEnv?: ElectronEnv

    /**
     * LiveEditor API exposed via contextBridge.
     * Only available when running in the LiveEditor window.
     */
    liveEditorAPI?: LiveEditorAPI

    /** @deprecated Pre-rename installed preload alias; use `liveEditorAPI`. */
    brainDumpAPI?: LiveEditorAPI

    /**
     * LiveEditor environment information.
     * Only available when running in the LiveEditor window.
     */
    liveEditorEnv?: LiveEditorEnv

    /** @deprecated Pre-rename installed preload hint; use `liveEditorEnv`. */
    brainDumpEnv?: {
      isElectron: boolean
      isBrainDump: boolean
      platform: string
    }
  }
}

export {}

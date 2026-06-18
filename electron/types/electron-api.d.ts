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
  AuxWindowVisibility,
  WindowBounds,
  WindowState,
  DisplayInfo,
  NotificationOptions,
  NotificationPreferences,
  TrayIconState,
  OAuthProvider,
  OAuthResult,
  PendingSignInToken,
  ShortcutDefinition,
  StartupWindowConfig,
  ConfigSection,
  DeepLinkExamples,
  UpdaterStatus,
  IPCResponse,
  IPCEventChannel,
  IPCEventData,
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
   * Window control operations.
   */
  window: {
    /** Minimize window to system tray */
    minimize: () => Promise<void>
    /** Close window (minimizes to tray, doesn't quit) */
    close: () => Promise<void>
    /** Toggle floating navigator visibility */
    toggleFloatingNavigator: () => Promise<boolean | undefined>
    /** Show floating navigator */
    showFloatingNavigator: () => Promise<void>
    /** Hide floating navigator */
    hideFloatingNavigator: () => Promise<void>
    /** Get current window bounds */
    getBounds: () => Promise<WindowBounds>
    /** Set window bounds (partial updates supported) */
    setBounds: (bounds: Partial<WindowBounds>) => Promise<void>
    /** Check if window is minimized */
    isMinimized: () => Promise<boolean>
    /** Check if window is always on top */
    isAlwaysOnTop: () => Promise<boolean>
    /** Move window to specific display */
    moveToDisplay: (displayIndex: number) => Promise<void>
    /** Read which auxiliary windows (floating navigator, brain dump) are visible now */
    getAuxVisibility: () => Promise<AuxWindowVisibility>
  }

  /**
   * System integration APIs (tray, notifications).
   */
  system: {
    /** Show native notification */
    showNotification: (
      title: string,
      body: string,
      options?: NotificationOptions,
    ) => Promise<{ id: string } | null>
    /** Update system tray menu with tasks */
    updateTrayMenu: (
      tasks: Array<{ id: string; title: string; completed?: boolean }>,
    ) => Promise<void>
    /** Set system tray tooltip */
    setTrayTooltip: (text: string) => Promise<void>
    /** Set system tray icon state */
    setTrayIconState: (state: TrayIconState) => Promise<boolean>
  }

  /**
   * Notification management.
   */
  notifications: {
    /** Show custom notification */
    show: (
      title: string,
      body: string,
      options?: NotificationOptions,
    ) => Promise<{ id: string } | null>
    /** Get notification preferences */
    getPreferences: () => Promise<NotificationPreferences | null>
    /** Update notification preferences */
    updatePreferences: (
      preferences: Partial<NotificationPreferences>,
    ) => Promise<boolean>
    /** Clear all active notifications */
    clearAll: () => Promise<void>
    /** Clear specific notification */
    clear: (id: string) => Promise<void>
    /** Check if notifications are enabled */
    isEnabled: () => Promise<boolean>
    /** Get active notification count */
    getActiveCount: () => Promise<number>
  }

  /**
   * Keyboard shortcut management.
   */
  shortcuts: {
    /** Get all registered shortcuts */
    getRegistered: () => Promise<ShortcutDefinition[]>
    /** Get default shortcuts */
    getDefaults: () => Promise<ShortcutDefinition[]>
    /** Update shortcut accelerators in one batch (id → accelerator; `''` unbinds). */
    update: (shortcuts: Record<string, string>) => Promise<boolean>
    /** Register new shortcut */
    register: (shortcut: ShortcutDefinition) => Promise<boolean>
    /** Unregister shortcut */
    unregister: (id: string) => Promise<boolean>
    /** Check if shortcut is registered */
    isRegistered: (id: string) => Promise<boolean>
    /** Enable shortcut */
    enable: (id: string) => Promise<boolean>
    /** Disable shortcut */
    disable: (id: string) => Promise<boolean>
    /** Get shortcut statistics */
    getStats: () => Promise<{
      totalRegistered: number
      isEnabled: boolean
      platform: string
      shortcuts: Record<string, string>
    }>
  }

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
    /** Listen for OAuth success */
    onSuccess: (callback: (result: OAuthResult) => void) => () => void
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
   * Menu operations.
   */
  menu: {
    /** Trigger menu action */
    triggerAction: (action: string) => Promise<void>
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
    /** Save config to file (no-op - config auto-persists on modification) */
    save?: () => Promise<boolean>
    /** Load config from file (async via IPC) */
    load?: () => Promise<Record<string, unknown>>
  }

  /**
   * Window state management.
   */
  windowState: {
    /** Get window state */
    get: (windowType: 'main' | 'floating') => Promise<WindowState | null>
    /** Set window state */
    set: (
      windowType: 'main' | 'floating',
      state: Partial<WindowState>,
    ) => Promise<boolean>
    /** Reset window state to defaults */
    reset: (windowType: 'main' | 'floating') => Promise<void>
    /** Get window state statistics */
    getStats: () => Promise<{
      windowCount: number
      lastSaved: number
      saves?: number
      loads?: number
      resets?: number
    }>
    /** Move window to display */
    moveToDisplay: (
      windowType: 'main' | 'floating',
      displayIndex: number,
    ) => Promise<boolean>
    /** Snap window to edge */
    snapToEdge: (
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
    ) => Promise<boolean>
    /** Get current display info */
    getDisplay: (windowType: 'main' | 'floating') => Promise<DisplayInfo | null>
    /** Get all displays */
    getAllDisplays: () => Promise<DisplayInfo[]>
  }

  /**
   * Floating window operations.
   */
  floatingWindow: {
    /** Close floating window */
    close: () => Promise<void>
    /** Minimize floating window */
    minimize: () => Promise<void>
    /** Toggle always on top */
    toggleAlwaysOnTop: () => Promise<boolean>
    /** Get floating window bounds */
    getBounds: () => Promise<WindowBounds>
    /** Set floating window bounds (partial updates supported) */
    setBounds: (bounds: Partial<WindowBounds>) => Promise<void>
    /** Check if always on top */
    isAlwaysOnTop: () => Promise<boolean>
  }

  /**
   * Shared settings for floating utility panels.
   */
  floatingPanels?: {
    /** Read whether Floating Navigator and BrainDump follow macOS Spaces. */
    getVisibleOnAllWorkspaces: () => Promise<boolean>
    /** Persist and apply whether both panels follow macOS Spaces. */
    setVisibleOnAllWorkspaces: (enabled: boolean) => Promise<boolean>
    /** Read FloatingNavigator's always-on-top preference (effective state). */
    getFloatingNavigatorAlwaysOnTop: () => Promise<boolean>
    /** Persist and apply FloatingNavigator's always-on-top preference. */
    setFloatingNavigatorAlwaysOnTop: (enabled: boolean) => Promise<boolean>
    /** Read BrainDump's always-on-top preference (config-backed, default off). */
    getBrainDumpAlwaysOnTop: () => Promise<boolean>
    /** Persist and apply BrainDump's always-on-top preference. */
    setBrainDumpAlwaysOnTop: (enabled: boolean) => Promise<boolean>
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
   * Deep linking operations.
   */
  deepLink: {
    /** Generate deep link URL */
    generateUrl: (
      action: string,
      params?: Record<string, string>,
    ) => Promise<string>
    /** Get example deep link URLs */
    getExamples: () => Promise<DeepLinkExamples | null>
    /** Handle incoming deep link URL */
    handleUrl: (url: string) => Promise<boolean>
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
   * Performance monitoring.
   */
  performance: {
    /** Get performance metrics */
    getMetrics: () => Promise<{
      memoryUsage: NodeJS.MemoryUsage
      uptime: number
      cpuUsage: NodeJS.CpuUsage
    }>
    /** Trigger memory cleanup */
    triggerCleanup: () => Promise<{ freedMemory: number }>
    /** Get startup time */
    getStartupTime: () => Promise<number>
  }

  /**
   * Event listener management.
   * @param channel - Event channel name
   * @param callback - Event handler function
   * @returns Cleanup function to remove the listener
   */
  on: <C extends IPCEventChannel>(
    channel: C,
    callback: (data: IPCEventData<C>) => void,
  ) => () => void

  /**
   * Remove specific event listener.
   * @param channel - Event channel name
   * @param callback - Event handler to remove
   */
  removeListener: <C extends IPCEventChannel>(
    channel: C,
    callback: (data: IPCEventData<C>) => void,
  ) => void

  /**
   * Remove all listeners for a channel.
   * @param channel - Event channel name
   */
  removeAllListeners: (channel: IPCEventChannel) => void

  /**
   * Display management.
   * Note: All methods are async as they use IPC under the hood.
   */
  display?: {
    /** Get all connected displays */
    getAllDisplays?: () => Promise<DisplayInfo[]>
    /** Get primary display */
    getPrimaryDisplay?: () => Promise<DisplayInfo | null>
    /** Get display matching a rectangle */
    getDisplayMatching?: (rect: {
      x: number
      y: number
      width: number
      height: number
    }) => Promise<DisplayInfo | null>
  }

  /**
   * Test utilities (for E2E testing only).
   * These APIs are only available in test builds.
   */
  tray?: {
    /** Simulate tray icon click */
    click?: () => void
  }

  /**
   * Test utilities (for testing only).
   */
  test?: {
    /** Simulate an error for testing */
    simulateError?: (type: string) => void
    /** Get test data */
    getTestData?: () => unknown
    /** Reset test state */
    resetTestState?: () => void
    /** Clear errors */
    clearErrors?: () => void
  }

  /**
   * Electron-specific settings management.
   * Controls app behavior like dock visibility and startup preferences.
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
     * Persist which window(s) open at Electron launch. The >=1-true invariant is
     * enforced in the main process, so an all-false request is repaired before
     * saving and this still resolves true.
     * @param config - The three startup-window booleans (main / brain dump / floating).
     * @returns Promise resolving to success status
     */
    setStartupConfig: (config: StartupWindowConfig) => Promise<boolean>
    /**
     * Read the persisted startup-window config so the settings UI can show the
     * saved choice without consuming the untyped `config.getSection` surface.
     * @returns Promise resolving to the saved config (showMain-only default on failure).
     */
    getStartupConfig: () => Promise<StartupWindowConfig>
    /**
     * Resets the Settings popover window to default size (360×380) and
     * re-anchors it to the tray icon.
     * @returns Promise resolving to true on success, false on IPC failure.
     */
    resetPopoverSize: () => Promise<boolean>
  }

  /**
   * BrainDump Note window configuration from the main window's Settings UI.
   *
   * Mirrors the `BrainDumpAPI` exposed inside the BrainDump window itself
   * (`preload-braindump.ts`), but only includes the surface a settings page
   * needs (no per-category note CRUD). All methods log + return safe defaults
   * on failure rather than throwing.
   */
  brainDump?: {
    /** Toggle BrainDump window visibility. */
    toggle: () => Promise<void>
    /** Open the BrainDump window (additive — only shows, never hides). */
    show: () => Promise<void>
    /** Read current opacity (already clamped to [0.30, 1.00]). */
    getOpacity: () => Promise<number>
    /** Persist + apply opacity; returns the clamped value the main applied. */
    setOpacity: (value: number) => Promise<number>
    /** Read the "follow FloatingNav category" toggle. */
    getSyncMode: () => Promise<boolean>
    /** Update the "follow FloatingNav category" toggle. */
    setSyncMode: (enabled: boolean) => Promise<boolean>
    /** Read the global accelerator (empty string when disabled). */
    getShortcut: () => Promise<string>
    /** Persist + register the global accelerator. */
    setShortcut: (accelerator: string) => Promise<boolean>
  }
}

/**
 * Electron environment information exposed via preload.
 */
export interface ElectronEnv {
  /** Whether running in Electron */
  isElectron: true
  /** Platform identifier */
  platform: NodeJS.Platform
  /** Runtime versions */
  versions: {
    node: string
    chrome: string
    electron: string
  }
}

/**
 * Floating Navigator API exposed via contextBridge in preload-floating.ts.
 * Provides window control APIs for the floating navigator window.
 */
export interface FloatingNavigatorAPI {
  /** Window control operations */
  window: {
    /** Close floating navigator window */
    close: () => Promise<void>
    /** Minimize floating navigator window */
    minimize: () => Promise<void>
    /** Toggle always on top behavior */
    toggleAlwaysOnTop: () => Promise<boolean>
    /** Focus main application window */
    focusMainWindow: () => Promise<void>
    /** Get current window bounds */
    getBounds: () => Promise<{
      x: number
      y: number
      width: number
      height: number
    } | null>
    /** Set window bounds */
    setBounds: (bounds: {
      x?: number
      y?: number
      width?: number
      height?: number
    }) => Promise<void>
    /** Check if window is always on top */
    isAlwaysOnTop: () => Promise<boolean>
  }
  /**
   * BrainDump controls reachable from the floating navigator. Intentionally
   * minimal — only `toggle`, since other BrainDump operations are owned by
   * the BrainDump window itself (`window.brainDumpAPI`).
   */
  brainDump: {
    /** Toggle BrainDump window visibility. */
    toggle: () => Promise<void>
  }
  /**
   * Open the task app's Completed paste-import surface (`/home`) in the user's
   * browser (T14). Added after the original window/brainDump surface, so a
   * renderer must method-guard before calling it (older installed preloads
   * predate it — see the preload-skew fallback in FloatingNavigator).
   */
  openCompletedImport: () => Promise<void>
  /** Subscribe to IPC events */
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  /** @deprecated Use the cleanup function returned by `on()` instead */
  removeListener: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ) => void
}

/**
 * Floating Navigator environment information exposed via preload-floating.ts.
 */
export interface FloatingNavigatorEnv {
  /** Whether running in Electron */
  isElectron: boolean
  /** Whether this is the floating navigator window */
  isFloatingNavigator: boolean
  /** Platform identifier */
  platform: string
}

/**
 * BrainDump API exposed via contextBridge in preload-braindump.ts.
 *
 * Provides:
 * - `window.*` — frameless panel controls (close/toggle/opacity/bounds)
 * - `note.*`   — per-category text persistence
 * - `sync.*`   — toggle for "follow FloatingNav category"
 * - `category.*` — last-active category id used to restore state
 * - `spaces.*` — shared macOS Spaces tracking for utility panels
 * - `on(channel, cb)` — subscribe to whitelisted main-process events
 */
export interface BrainDumpAPI {
  window: {
    /** Hide the BrainDump window (kept in memory for fast re-show). */
    close: () => Promise<void>
    /** Toggle BrainDump visibility (mirror of the global accelerator). */
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
  sync: {
    /** Read the "follow FloatingNav category" toggle. */
    getEnabled: () => Promise<boolean>
    /** Update the "follow FloatingNav category" toggle. */
    setEnabled: (enabled: boolean) => Promise<void>
  }
  category: {
    /** Read the last-active category id (null when never set). */
    getLast: () => Promise<number | null>
    /** Persist the active category id. */
    setLast: (categoryId: number) => Promise<void>
  }
  spaces: {
    /** Read whether BrainDump and Floating Navigator follow macOS Spaces. */
    getVisibleOnAllWorkspaces: () => Promise<boolean>
    /** Persist and apply whether both utility panels follow macOS Spaces. */
    setVisibleOnAllWorkspaces: (enabled: boolean) => Promise<boolean>
  }
  /** Subscribe to a whitelisted event; returns a cleanup function. */
  on: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ) => (() => void) | undefined
}

/**
 * BrainDump environment information exposed via preload-braindump.ts.
 */
export interface BrainDumpEnv {
  /** Whether running in Electron */
  isElectron: boolean
  /** Whether this is the BrainDump Note window */
  isBrainDump: boolean
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
     * Floating Navigator API exposed via contextBridge.
     * Only available when running in floating navigator window.
     */
    floatingNavigatorAPI?: FloatingNavigatorAPI

    /**
     * Floating Navigator environment information.
     * Only available when running in floating navigator window.
     */
    floatingNavigatorEnv?: FloatingNavigatorEnv

    /**
     * BrainDump API exposed via contextBridge.
     * Only available when running in the BrainDump window.
     */
    brainDumpAPI?: BrainDumpAPI

    /**
     * BrainDump environment information.
     * Only available when running in the BrainDump window.
     */
    brainDumpEnv?: BrainDumpEnv
  }
}

export {}

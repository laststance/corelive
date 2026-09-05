// Comprehensive Electron API type definitions

// Reuse the canonical IPC shapes (source of truth lives in electron/) rather
// than re-declaring the booleans here. This file is already a module (see the
// `export type` lines at the bottom), so a top-level import is safe and does
// not affect the `declare global` Window augmentation below.
import type { IPCResponse } from '@/electron/types/ipc'

interface ElectronAuthUser {
  /**
   * Clerk user identifier. Required by the Electron main process to hydrate the
   * Prisma-backed user session.
   */
  clerkId: string
  /** Optional denormalised email address for UI-only display */
  email?: string | null
  /** Optional denormalised name for UI-only display */
  name?: string | null
}

interface ElectronAPI {
  // Authentication
  auth?: {
    getUser: () => Promise<any>
    setUser: (user: ElectronAuthUser) => Promise<any>
    logout: () => Promise<boolean>
    isAuthenticated: () => Promise<boolean>
    syncFromWeb: (authData: any) => Promise<boolean>
  }

  // OAuth (browser-based OAuth for providers that block WebView)
  oauth?: {
    /**
     * Start OAuth flow in system browser.
     * Used for providers like Google that block WebView authentication.
     */
    start: (
      provider: 'google' | 'github' | 'apple',
    ) => Promise<{ success: boolean; state?: string; error?: string }>
    /** Get list of supported OAuth providers */
    getSupportedProviders: () => Promise<string[]>
    /** Cancel pending OAuth flow */
    cancel: (state?: string | null) => Promise<boolean>
    /** Register callback for OAuth error */
    onError: (callback: (data: { error: string }) => void) => () => void
    /**
     * Register callback for Clerk sign-in token from browser OAuth.
     * This token allows the WebView to create its own Clerk session
     * using signIn.create({ strategy: 'ticket', ticket: token }).
     */
    onSignInToken: (
      callback: (data: { token: string; provider: string }) => void,
    ) => () => void
    /**
     * Get pending sign-in token (for race condition handling).
     * This is called when the renderer is ready to process tokens,
     * in case it missed the IPC event.
     */
    getPendingToken: () => Promise<{ token: string; provider: string } | null>
    /**
     * Clear pending sign-in token (after successful sign-in).
     */
    clearPendingToken: () => Promise<boolean>
  }

  // Configuration
  config?: {
    get: (path: string, defaultValue?: any) => Promise<any>
    set: (path: string, value: any) => Promise<boolean>
    getAll: () => Promise<any>
    getSection: (section: string) => Promise<any>
    update: (updates: any) => Promise<boolean>
    reset: () => Promise<boolean>
    resetSection: (section: string) => Promise<boolean>
    validate: () => Promise<{ isValid: boolean; errors: string[] }>
    export: (filePath: string) => Promise<boolean>
    import: (filePath: string) => Promise<boolean>
    backup: () => Promise<string | null>
    getPaths: () => Promise<any>
    save: () => boolean
    load: () => any
  }

  /**
   * LiveEditor panel controls. `floatingPanels` is the legacy wire name —
   * frozen preloads expose it and the renderer reads it; do not rename.
   */
  floatingPanels?: {
    /** Read whether LiveEditor follows macOS Spaces */
    getVisibleOnAllWorkspaces: () => Promise<boolean>
    /** Persist and apply whether LiveEditor follows macOS Spaces */
    setVisibleOnAllWorkspaces: (enabled: boolean) => Promise<boolean>
  }

  // App information
  app?: {
    getVersion: () => Promise<string>
    quit: () => Promise<void>
  }

  /**
   * Electron-specific settings management.
   * Controls app behavior like dock visibility and login items.
   *
   * Note: Canonical type definition is in /electron/types/electron-api.d.ts
   * Keep this in sync with ElectronAPIInterface.settings
   */
  settings?: {
    /** Set whether the app icon should be hidden from the dock (macOS) */
    setHideAppIcon: (hide: boolean) => Promise<boolean>
    /** Set whether the app should show in the menu bar */
    setShowInMenuBar: (show: boolean) => Promise<boolean>
    /** Set whether the app should start at system login */
    setStartAtLogin: (enable: boolean) => Promise<boolean>
    /** Read the current OS login-item settings */
    getLoginItemSettings: () => Promise<
      IPCResponse<'settings:getLoginItemSettings'>
    >
  }

  /**
   * LiveEditor window controls exposed to the Settings window's UI.
   *
   * Minimal renderer-side mirror; the canonical surface lives in
   * /electron/types/electron-api.d.ts. Only includes what the settings page
   * needs (e.g. a "Try it now" open action).
   */
  liveEditor?: {
    /** Open the LiveEditor window (additive — only shows, never hides). */
    show: () => Promise<void>
  }
  /** @deprecated Pre-rename installed preload namespace; use `liveEditor`. */
  brainDump?: {
    /** Open the LiveEditor window (additive — only shows, never hides). */
    show: () => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    electronEnv?: {
      isElectron: boolean
      platform: string
    }
  }
}

export type { ElectronAPI }
export type { ElectronAuthUser }

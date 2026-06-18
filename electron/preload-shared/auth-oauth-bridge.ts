/**
 * @fileoverview Shared Auth + OAuth contextBridge factories
 *
 * The native-OAuth sign-in flow (system browser → `corelive://oauth` deep link →
 * Clerk ticket) must be drivable from ANY Electron window that hosts the React
 * app, not just the (now-retired) main window. `ElectronAuthProvider` lives in
 * the root layout, so it renders in every panel — but it can only act where the
 * preload has exposed `window.electronAPI.{auth,oauth}`. These factories are that
 * single source of truth, consumed by both `preload.ts` and `preload-floating.ts`
 * so the bridge never skews between windows.
 *
 * `sanitizeData` is dependency-injected rather than imported so each preload keeps
 * its own isolated sanitizer instance (the context-isolation boundary is
 * per-preload); the bridge logic itself stays DRY.
 *
 * @module electron/preload-shared/auth-oauth-bridge
 */

import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import { typedInvoke } from '../ipc/typedInvoke'
import { log } from '../logger'

/** User data payload pushed from the renderer to the main process. */
export interface ElectronUserData {
  clerkId: string
  [key: string]: unknown
}

/** OAuth callback payload delivered to renderer event listeners. */
export interface OAuthCallbackData {
  [key: string]: unknown
}

/**
 * Deep-trim sanitizer signature. Injected by each preload so the bridge reuses
 * the caller's already-isolated `sanitizeData` instead of importing a third copy.
 */
export type SanitizeData = <T>(data: T) => T

/**
 * Build the `auth` bridge — the renderer↔main auth-sync surface (Clerk user push,
 * logout, auth-state reads). Identical in every window; exposed wherever
 * `ElectronAuthProvider` needs to mirror sign-in state to the main process.
 *
 * @param sanitizeData - The host preload's deep-trim sanitizer.
 * @returns The `auth` object exposed at `window.electronAPI.auth`.
 * @example
 * contextBridge.exposeInMainWorld('electronAPI', { auth: createAuthBridge(sanitizeData) })
 */
export function createAuthBridge(sanitizeData: SanitizeData) {
  return {
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
  }
}

/**
 * Build the `oauth` bridge — the browser-based OAuth surface for providers (e.g.
 * Google) that block WebView auth. Exposes the FULL surface (start/cancel, the
 * success/error/exchange/sign-in-token listeners, and the pending-token
 * store/clear) so a panel can both START a flow and RECEIVE its ticket without a
 * main window in the loop.
 *
 * @param sanitizeData - The host preload's deep-trim sanitizer.
 * @returns The `oauth` object exposed at `window.electronAPI.oauth`.
 * @example
 * contextBridge.exposeInMainWorld('electronAPI', { oauth: createOAuthBridge(sanitizeData) })
 */
export function createOAuthBridge(sanitizeData: SanitizeData) {
  return {
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
  }
}

/**
 * @fileoverview OAuth Manager for Browser-Based OAuth with Deep Link Callback
 *
 * This module handles OAuth authentication flows that require system browser
 * due to restrictions on WebView-based OAuth (e.g., Google OAuth).
 *
 * @module electron/OAuthManager
 */

import crypto from 'crypto'

import { BrowserWindow, shell } from 'electron'
import type { WebContents } from 'electron'

import { typedSend } from './ipc/typedSend'
import { log } from './logger'
import type { NotificationManager } from './NotificationManager'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** Route that starts the browser-side OAuth flow. */
const OAUTH_START_PATH = '/oauth/start'

/** PKCE code pair */
interface PKCEPair {
  verifier: string
  challenge: string
}

/** Pending OAuth state data */
interface PendingStateData {
  provider: string
  createdAt: number
  verifier?: string
  /**
   * The renderer that started this flow. The one-time sign-in ticket is pushed
   * back to THIS webContents only (single recipient → no cross-window
   * double-consumption); undefined when the flow had no identifiable initiator.
   */
  initiator?: WebContents
}

/** Pending sign-in token */
interface PendingSignInToken {
  token: string
  provider: string
  createdAt: number
  /**
   * `webContents.id` of the window that STARTED this flow. The PULL fallback
   * (`getPendingSignInToken`) releases the one-time ticket only to this window,
   * so a non-initiating renderer can't consume it first. Undefined when the
   * flow had no identifiable initiator (legacy / main-window push) → unscoped.
   */
  initiatorId?: number
}

/** OAuth flow result */
interface OAuthFlowResult {
  state: string | null
  success: boolean
  error?: string
}

/** OAuth callback result */
interface OAuthCallbackResult {
  success: boolean
  provider?: string
  token?: string
  user?: unknown
  error?: string
}

// ============================================================================
// OAuth Manager Class
// ============================================================================

/**
 * Manages OAuth authentication flows with system browser.
 */
export class OAuthManager {
  /** Window manager reference */
  private windowManager: WindowManager

  /** Notification manager reference */
  private notificationManager: NotificationManager | null

  /** Pending OAuth states */
  private pendingStates: Map<string, PendingStateData>

  /** State TTL in milliseconds (10 minutes) */
  private stateTTL: number

  /** Pending sign-in token */
  private pendingSignInToken: PendingSignInToken | null

  /** Cleanup interval handle */
  private cleanupInterval: ReturnType<typeof setInterval> | null

  /**
   * Creates a new OAuthManager instance.
   *
   * @param windowManager - Manages application windows
   * @param notificationManager - Shows native notifications
   */
  constructor(
    windowManager: WindowManager,
    notificationManager: NotificationManager | null = null,
  ) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager

    this.pendingStates = new Map()
    this.stateTTL = 10 * 60 * 1000
    this.pendingSignInToken = null

    this.cleanupInterval = setInterval(() => this.cleanupExpiredStates(), 60000)
  }

  /**
   * Generates PKCE code verifier and challenge.
   *
   * @returns PKCE pair
   */
  generatePKCE(): PKCEPair {
    const verifier = crypto.randomBytes(32).toString('base64url').slice(0, 64)

    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')

    return { verifier, challenge }
  }

  /**
   * Generates a cryptographically secure state parameter.
   *
   * @returns Random hex string
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Builds the OAuth start URL using the currently loaded web app origin.
   *
   * Using the same origin as the BrowserWindow keeps Clerk environment
   * selection aligned in both development and production. This prevents
   * development Electron from creating OAuth state on production pages and
   * later trying to consume the returned sign-in ticket with development keys.
   *
   * @param provider - OAuth provider selected in the Electron login screen.
   * @param state - State parameter for CSRF protection
   * @returns Application URL that starts browser OAuth on the matching environment.
   */
  buildOAuthURL(provider: string, state: string): string {
    const params = new URLSearchParams({
      provider,
      state,
    })

    return `${this.getWebAppOrigin()}${OAUTH_START_PATH}?${params.toString()}`
  }

  /**
   * Resolves the web app origin from the current BrowserWindow URL.
   *
   * @returns
   * - The current app origin, such as `http://localhost:4991` in development.
   * - The production origin fallback when no window URL is available.
   * @example
   * // Dev BrowserWindow URL: http://localhost:4991/login
   * // => 'http://localhost:4991'
   * @example
   * // Production BrowserWindow URL: https://corelive.app/home
   * // => 'https://corelive.app'
   */
  private getWebAppOrigin(): string {
    // Origin is window-agnostic — delegate to WindowManager, which derives it
    // from the configured server URL. The main window was retired, so reading a
    // live window URL is no longer viable (and during a cold OAuth callback a
    // panel may not even exist yet).
    return this.windowManager.getWebAppOrigin()
  }

  /**
   * Starts the OAuth flow by opening system browser.
   *
   * @param provider - OAuth provider (e.g., 'google', 'github')
   * @param initiator - The renderer that started the flow; the resulting sign-in
   *   ticket is pushed back to it (single recipient). Omit when unknown.
   * @returns Result with state for tracking
   */
  async startOAuthFlow(
    provider: string,
    initiator?: WebContents,
  ): Promise<OAuthFlowResult> {
    try {
      log.info(`Starting OAuth flow for provider: ${provider}`)

      const state = this.generateState()

      this.pendingStates.set(state, {
        provider,
        createdAt: Date.now(),
        initiator,
      })

      const oauthUrl = this.buildOAuthURL(provider, state)

      log.debug('Opening OAuth URL in system browser', {
        provider,
        state: state.slice(0, 8) + '...',
      })

      await shell.openExternal(oauthUrl)

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In',
          'Sign in with your account in the browser, then return to CoreLive.',
          { type: 'info' },
        )
      }

      return { state, success: true }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      log.error('Failed to start OAuth flow:', error)

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In Error',
          'Failed to open browser for sign-in. Please try again.',
          { type: 'error' },
        )
      }

      return { state: null, success: false, error: errorMessage }
    }
  }

  /**
   * Handles OAuth callback from deep link.
   *
   * @param url - Parsed deep link URL
   * @returns Result with success status
   */
  async handleOAuthCallback(url: URL): Promise<OAuthCallbackResult> {
    // Hoisted to function scope so the catch can route an unexpected failure to
    // the window that started the flow. Assigned once the pending flow resolves.
    let flowInitiator: WebContents | undefined
    try {
      const state = url.searchParams.get('state')
      const token = url.searchParams.get('token')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      log.info('Handling OAuth callback', {
        hasState: !!state,
        hasToken: !!token,
        error,
      })

      if (error) {
        log.error('OAuth error:', { error, errorDescription })
        // Route the failure to the window that STARTED the flow (Phase 1: falls
        // back to the main renderer) so a floating-initiated sign-in can't hang
        // forever on "Opening browser…" after a provider denial/error.
        const initiator = state
          ? this.pendingStates.get(state)?.initiator
          : undefined
        if (state) {
          this.pendingStates.delete(state)
        }
        this.sendOAuthError(errorDescription || error, initiator)
        return { success: false, error: errorDescription || error }
      }

      if (!state) {
        log.error('Missing state in OAuth callback')
        this.sendOAuthError('Invalid OAuth callback: missing state parameter')
        return { success: false, error: 'Missing state' }
      }

      if (!token) {
        log.error('Missing token in OAuth callback')
        // `state` is present here (checked above); route to its initiator.
        const initiator = this.pendingStates.get(state)?.initiator
        this.pendingStates.delete(state)
        this.sendOAuthError(
          'Invalid OAuth callback: missing authentication token',
          initiator,
        )
        return { success: false, error: 'Missing token' }
      }

      const pendingFlow = this.pendingStates.get(state)
      if (!pendingFlow) {
        log.error('Invalid or expired OAuth state')
        this.sendOAuthError('OAuth session expired. Please try again.')
        return { success: false, error: 'Invalid or expired state' }
      }

      if (Date.now() - pendingFlow.createdAt > this.stateTTL) {
        log.error('OAuth state expired')
        const { initiator } = pendingFlow
        this.pendingStates.delete(state)
        this.sendOAuthError(
          'OAuth session expired. Please try again.',
          initiator,
        )
        return { success: false, error: 'State expired' }
      }

      this.pendingStates.delete(state)

      log.info('OAuth state validated, sending sign-in token to WebView')

      // Bring the window that STARTED sign-in back to the front so the in-place
      // re-render is visible. The initiator is the sole target now that the main
      // window is retired (T18); a missed push is covered by the PULL store.
      flowInitiator = pendingFlow.initiator
      if (flowInitiator && !flowInitiator.isDestroyed()) {
        const initiatorWindow = BrowserWindow.fromWebContents(flowInitiator)
        initiatorWindow?.show()
        initiatorWindow?.focus()
      }

      this.sendSignInToken(token, pendingFlow.provider, flowInitiator)

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Signing In',
          'Completing authentication...',
          { type: 'info' },
        )
      }

      return { success: true, provider: pendingFlow.provider, token }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      log.error('Failed to handle OAuth callback:', error)
      this.sendOAuthError(
        'Failed to complete sign-in. Please try again.',
        flowInitiator,
      )
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Sends the sign-in token to the WebView for session creation.
   *
   * Stores the token for PULL retrieval (window-agnostic, serialized → atomic)
   * AND pushes it to a SINGLE recipient — the initiating window — so two windows
   * never race to consume the one-time ticket. When no live initiator exists
   * (a cold-boot callback that arrives before any panel paints), the PULL store
   * is the sole delivery path: the renderer pulls it on mount.
   *
   * @param token - Clerk sign-in token
   * @param provider - OAuth provider
   * @param initiator - The renderer that started the flow; receives the push.
   */
  sendSignInToken(
    token: string,
    provider: string,
    initiator?: WebContents,
  ): void {
    log.info('[OAuth] Sending sign-in token to WebView', {
      provider,
      tokenPrefix: token.slice(0, 10) + '...',
      hasInitiator: !!(initiator && !initiator.isDestroyed()),
    })

    // PULL store — durable fallback for any window that missed the push, scoped
    // to the initiator so a non-initiating window can't pull the one-time ticket
    // first (the PUSH below targets the initiator; the PULL must match it).
    this.pendingSignInToken = {
      token,
      provider,
      createdAt: Date.now(),
      initiatorId:
        initiator && !initiator.isDestroyed() ? initiator.id : undefined,
    }
    log.debug('[OAuth] Stored pending sign-in token for retrieval')

    // PUSH to the single initiating window when one is live. A signed-out
    // cold-boot callback can arrive before any panel paints, leaving no
    // initiator — that window pulls the token from the PULL store on mount, so a
    // missed push is not a lost sign-in (and never a double-consume race).
    if (initiator && !initiator.isDestroyed()) {
      typedSend(initiator, 'clerk-sign-in-token', { token, provider })
      log.debug('[OAuth] Sign-in token pushed to initiator')
    } else {
      log.debug('[OAuth] No live initiator; token left in PULL store for mount')
    }
  }

  /**
   * Retrieves and clears the pending sign-in token, scoped to the initiator.
   *
   * @param requester - The window asking for the ticket. When the stored ticket
   *   is bound to an initiator, only that window receives it (others get null,
   *   leaving the ticket intact); an unbound ticket is returned to any caller.
   * @returns The pending token, or null when absent, expired, or claimed by a
   *   non-initiator window.
   */
  getPendingSignInToken(
    requester?: WebContents,
  ): { token: string; provider: string } | null {
    if (!this.pendingSignInToken) {
      log.debug('[OAuth] No pending sign-in token')
      return null
    }

    // Scope the PULL to the initiator: a ticket bound to a specific window is
    // released only to that window. A non-initiator pull returns null and
    // leaves the ticket for the rightful initiator. An unbound ticket
    // (initiatorId undefined) stays window-agnostic — preserves the Phase-1
    // main-window flow and any legacy push.
    const { initiatorId } = this.pendingSignInToken
    if (
      initiatorId !== undefined &&
      (!requester || requester.isDestroyed() || requester.id !== initiatorId)
    ) {
      log.debug('[OAuth] Pending sign-in token requested by non-initiator')
      return null
    }

    const age = Date.now() - this.pendingSignInToken.createdAt
    if (age > 60 * 1000) {
      log.debug('[OAuth] Pending sign-in token expired', { ageMs: age })
      this.pendingSignInToken = null
      return null
    }

    const { token, provider } = this.pendingSignInToken
    this.pendingSignInToken = null
    log.info('[OAuth] Returning pending sign-in token', {
      provider,
      tokenPrefix: token.slice(0, 10) + '...',
      ageMs: age,
    })
    return { token, provider }
  }

  /**
   * Clears the pending sign-in token.
   */
  clearPendingSignInToken(): void {
    if (this.pendingSignInToken) {
      log.debug('[OAuth] Clearing pending sign-in token')
      this.pendingSignInToken = null
    }
  }

  /**
   * Sends OAuth error event to the renderer that started the flow.
   *
   * Routes the failure to the initiating window when known (so a
   * floating-initiated flow surfaces its own error instead of hanging). With the
   * main window retired (T18) there is no default renderer, so an initiator-less
   * error (callback with no/expired state, or a pre-flow failure) can only be
   * logged. The renderer covers the stranded case itself: `ElectronOAuthButtons`
   * re-arms its "Opening browser…" CTA via a timeout backstop
   * (`OAUTH_OPENING_BROWSER_TIMEOUT_MS`) when an abandoned flow fires no event, so
   * an initiator-less error here is non-fatal — the user is never dead-ended.
   *
   * @param error - Error message
   * @param initiator - The renderer that started the flow; receives the error
   *   when present and alive. Omit when no initiator is identifiable.
   */
  sendOAuthError(error: string, initiator?: WebContents): void {
    if (initiator && !initiator.isDestroyed()) {
      typedSend(initiator, 'oauth-error', { error })
      return
    }
    log.warn('[OAuth] OAuth error with no initiator to surface it', { error })
  }

  /**
   * Cleans up expired pending OAuth states.
   */
  cleanupExpiredStates(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [state, data] of this.pendingStates.entries()) {
      if (now - data.createdAt > this.stateTTL) {
        this.pendingStates.delete(state)
        cleaned++
      }
    }

    if (cleaned > 0) {
      log.debug(`Cleaned up ${cleaned} expired OAuth states`)
    }
  }

  /**
   * Gets the list of supported OAuth providers.
   *
   * @returns Array of provider names
   */
  getSupportedProviders(): string[] {
    return ['google', 'github', 'apple']
  }

  /**
   * Checks if a provider is supported.
   *
   * @param provider - Provider name
   * @returns True if supported
   */
  isProviderSupported(provider: string): boolean {
    return this.getSupportedProviders().includes(provider)
  }

  /**
   * Cancels any pending OAuth flow.
   *
   * @param state - State to cancel (optional, cancels all if not provided)
   */
  cancelPendingFlow(state: string | null = null): void {
    if (state) {
      this.pendingStates.delete(state)
    } else {
      this.pendingStates.clear()
    }
  }

  /**
   * Cleanup method called on app shutdown.
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.pendingStates.clear()
  }
}

export default OAuthManager

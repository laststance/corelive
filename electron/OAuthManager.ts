/**
 * @fileoverview OAuth Manager for Browser-Based OAuth with Deep Link Callback
 *
 * This module handles OAuth authentication flows that require system browser
 * due to restrictions on WebView-based OAuth (e.g., Google OAuth).
 *
 * @module electron/OAuthManager
 */

import crypto from 'crypto'

import { shell } from 'electron'

import { log } from './logger'
import type { NotificationManager } from './NotificationManager'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

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
}

/** Pending sign-in token */
interface PendingSignInToken {
  token: string
  provider: string
  createdAt: number
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

/** Code exchange result */
interface CodeExchangeResult {
  success: boolean
  pendingWebExchange?: boolean
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
   * Builds the OAuth start URL using Clerk's hosted Account Portal.
   *
   * @param provider - OAuth provider (currently unused as user selects on Clerk's UI)
   * @param state - State parameter for CSRF protection
   * @returns Clerk hosted sign-in URL with redirect callback
   */
  buildOAuthURL(_provider: string, state: string): string {
    const accountsUrl = 'https://accounts.corelive.app/sign-in'
    const callbackUrl = `https://corelive.app/oauth/callback?state=${encodeURIComponent(state)}`

    const params = new URLSearchParams({
      redirect_url: callbackUrl,
    })

    return `${accountsUrl}?${params.toString()}`
  }

  /**
   * Starts the OAuth flow by opening system browser.
   *
   * @param provider - OAuth provider (e.g., 'google', 'github')
   * @returns Result with state for tracking
   */
  async startOAuthFlow(provider: string): Promise<OAuthFlowResult> {
    try {
      log.info(`Starting OAuth flow for provider: ${provider}`)

      const state = this.generateState()

      this.pendingStates.set(state, {
        provider,
        createdAt: Date.now(),
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
        this.sendOAuthError(errorDescription || error)
        return { success: false, error: errorDescription || error }
      }

      if (!state) {
        log.error('Missing state in OAuth callback')
        this.sendOAuthError('Invalid OAuth callback: missing state parameter')
        return { success: false, error: 'Missing state' }
      }

      if (!token) {
        log.error('Missing token in OAuth callback')
        this.sendOAuthError(
          'Invalid OAuth callback: missing authentication token',
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
        this.pendingStates.delete(state)
        this.sendOAuthError('OAuth session expired. Please try again.')
        return { success: false, error: 'State expired' }
      }

      this.pendingStates.delete(state)

      log.info('OAuth state validated, sending sign-in token to WebView')

      if (this.windowManager && this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow?.show()
        mainWindow?.focus()
      }

      this.sendSignInToken(token, pendingFlow.provider)

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
      this.sendOAuthError('Failed to complete sign-in. Please try again.')
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Sends the sign-in token to the WebView for session creation.
   *
   * @param token - Clerk sign-in token
   * @param provider - OAuth provider
   */
  sendSignInToken(token: string, provider: string): void {
    log.info('[OAuth] Sending sign-in token to WebView', {
      provider,
      tokenPrefix: token.slice(0, 10) + '...',
      hasMainWindow: !!(
        this.windowManager && this.windowManager.hasMainWindow()
      ),
    })

    this.pendingSignInToken = {
      token,
      provider,
      createdAt: Date.now(),
    }
    log.debug('[OAuth] Stored pending sign-in token for retrieval')

    this.sendToRenderer('clerk-sign-in-token', { token, provider })
    log.debug('[OAuth] Sign-in token sent via IPC')
  }

  /**
   * Retrieves and clears the pending sign-in token.
   *
   * @returns The pending token or null
   */
  getPendingSignInToken(): { token: string; provider: string } | null {
    if (!this.pendingSignInToken) {
      log.debug('[OAuth] No pending sign-in token')
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
   * Exchanges authorization code for session using Clerk API.
   *
   * @param code - Authorization code from OAuth callback
   * @param verifier - PKCE code verifier
   * @param provider - OAuth provider
   * @returns Exchange result
   */
  async exchangeCodeForSession(
    code: string,
    verifier: string,
    provider: string,
  ): Promise<CodeExchangeResult> {
    try {
      log.info('Exchanging authorization code for session')

      this.sendToRenderer('oauth-complete-exchange', {
        code,
        verifier,
        provider,
      })

      return { success: true, pendingWebExchange: true }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      log.error('Failed to exchange code for session:', error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Sends OAuth success event to renderer.
   *
   * @param user - User data
   */
  sendOAuthSuccess(user: unknown): void {
    this.sendToRenderer('oauth-success', { user })
  }

  /**
   * Sends OAuth error event to renderer.
   *
   * @param error - Error message
   */
  sendOAuthError(error: string): void {
    this.sendToRenderer('oauth-error', { error })
  }

  /**
   * Sends event to renderer process.
   *
   * @param channel - IPC channel name
   * @param data - Data to send
   */
  sendToRenderer(channel: string, data: unknown): void {
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow?.webContents.send(channel, data)
    }
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

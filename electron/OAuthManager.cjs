/**
 * @fileoverview OAuth Manager for Browser-Based OAuth with Deep Link Callback
 *
 * This module handles OAuth authentication flows that require system browser
 * due to restrictions on WebView-based OAuth (e.g., Google OAuth).
 *
 * Why browser-based OAuth?
 * - Google blocks OAuth in WebViews with 403: disallowed_useragent
 * - Security best practice for desktop apps (RFC 8252)
 * - Consistent with apps like Linear, Figma, VSCode, Slack
 *
 * Flow:
 * 1. Generate PKCE (Proof Key for Code Exchange) parameters
 * 2. Open system browser with OAuth URL
 * 3. User authenticates in browser
 * 4. Browser redirects to web app callback
 * 5. Web app redirects to deep link (corelive://oauth/callback)
 * 6. Electron handles deep link, exchanges code for session
 *
 * Security measures:
 * - PKCE (S256) prevents authorization code interception
 * - State parameter prevents CSRF attacks
 * - One-time codes with TTL prevent replay attacks
 *
 * @module electron/OAuthManager
 */

const crypto = require('crypto')

const { shell } = require('electron')

const { log } = require('./logger.cjs')

/**
 * Manages OAuth authentication flows with system browser.
 *
 * Handles:
 * - PKCE code generation and verification
 * - State management for CSRF protection
 * - OAuth URL construction
 * - Authorization code exchange
 * - Session synchronization with renderer
 */
class OAuthManager {
  /**
   * Creates a new OAuthManager instance.
   *
   * @param {WindowManager} windowManager - Manages application windows
   * @param {NotificationManager|null} notificationManager - Shows native notifications
   */
  constructor(windowManager, notificationManager = null) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager

    /**
     * Pending OAuth states.
     * Maps state string to { verifier, provider, createdAt }
     * @type {Map<string, {verifier: string, provider: string, createdAt: number}>}
     */
    this.pendingStates = new Map()

    /**
     * State TTL in milliseconds (10 minutes).
     * OAuth flows should complete within this time.
     */
    this.stateTTL = 10 * 60 * 1000

    // Cleanup expired states periodically
    this.cleanupInterval = setInterval(() => this.cleanupExpiredStates(), 60000)
  }

  /**
   * Generates PKCE code verifier and challenge.
   *
   * PKCE (Proof Key for Code Exchange) prevents authorization code
   * interception attacks. The verifier is stored locally, and the
   * challenge is sent to the OAuth server. On token exchange, the
   * verifier must be provided to prove ownership.
   *
   * @returns {{verifier: string, challenge: string}} PKCE pair
   */
  generatePKCE() {
    // Code verifier: 43-128 characters, URL-safe random string
    const verifier = crypto.randomBytes(32).toString('base64url').slice(0, 64)

    // Code challenge: SHA256 hash of verifier, base64url encoded
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')

    return { verifier, challenge }
  }

  /**
   * Generates a cryptographically secure state parameter.
   *
   * State parameter prevents CSRF attacks by ensuring the callback
   * came from a flow we initiated.
   *
   * @returns {string} Random hex string
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Builds the OAuth start URL using Clerk's hosted Account Portal.
   *
   * Uses Clerk's hosted sign-in page which handles all OAuth flows reliably.
   * This approach is more reliable than custom OAuth initialization because:
   * - Clerk handles CAPTCHA, rate limiting, and bot protection
   * - Session context is properly managed by Clerk
   * - Works reliably in any browser context (including fresh system browser)
   *
   * Flow:
   * 1. User is redirected to Clerk's hosted sign-in page
   * 2. User clicks "Continue with Google/GitHub" on Clerk's UI
   * 3. OAuth completes and Clerk redirects to our callback
   * 4. Callback redirects to deep link
   *
   * @param {string} provider - OAuth provider (e.g., 'google', 'github') - currently unused
   *                           as user selects provider on Clerk's UI
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} Clerk hosted sign-in URL with redirect callback
   */
  buildOAuthURL(provider, state) {
    // Use Clerk's hosted Account Portal for sign-in
    // This is more reliable than custom OAuth initialization
    const accountsUrl = 'https://accounts.corelive.app/sign-in'

    // After sign-in, Clerk will redirect to this URL
    const callbackUrl = `https://corelive.app/oauth/callback?state=${encodeURIComponent(state)}`

    const params = new URLSearchParams({
      redirect_url: callbackUrl,
    })

    return `${accountsUrl}?${params.toString()}`
  }

  /**
   * Starts the OAuth flow by opening system browser.
   *
   * @param {string} provider - OAuth provider (e.g., 'google', 'github')
   * @returns {Promise<{state: string, success: boolean}>} Result with state for tracking
   */
  async startOAuthFlow(provider) {
    try {
      log.info(`🔐 Starting OAuth flow for provider: ${provider}`)

      // Generate state for CSRF protection
      // Note: PKCE is now handled by Clerk's SDK on the web app side
      const state = this.generateState()

      // Store pending state for verification on callback
      this.pendingStates.set(state, {
        provider,
        createdAt: Date.now(),
      })

      // Build OAuth URL (points to web app's /oauth/start page)
      const oauthUrl = this.buildOAuthURL(provider, state)

      log.debug('🔐 Opening OAuth URL in system browser', {
        provider,
        state: state.slice(0, 8) + '...',
      })

      // Open system browser
      await shell.openExternal(oauthUrl)

      // Show notification to guide user
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In',
          'Sign in with your account in the browser, then return to CoreLive.',
          { type: 'info' },
        )
      }

      return { state, success: true }
    } catch (error) {
      log.error('❌ Failed to start OAuth flow:', error)

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In Error',
          'Failed to open browser for sign-in. Please try again.',
          { type: 'error' },
        )
      }

      return { state: null, success: false, error: error.message }
    }
  }

  /**
   * Handles OAuth callback from deep link.
   *
   * Called when app receives corelive://oauth/callback?state=...&token=...
   *
   * The token is a Clerk sign-in token that allows the WebView to create
   * its own session (since browser and WebView have separate cookie storage).
   *
   * @param {URL} url - Parsed deep link URL
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async handleOAuthCallback(url) {
    try {
      const state = url.searchParams.get('state')
      const token = url.searchParams.get('token')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      log.info('🔐 Handling OAuth callback', {
        hasState: !!state,
        hasToken: !!token,
        error,
      })

      // Check for OAuth error
      if (error) {
        log.error('❌ OAuth error:', { error, errorDescription })
        this.sendOAuthError(errorDescription || error)
        return { success: false, error: errorDescription || error }
      }

      // Validate required parameters
      if (!state) {
        log.error('❌ Missing state in OAuth callback')
        this.sendOAuthError('Invalid OAuth callback: missing state parameter')
        return { success: false, error: 'Missing state' }
      }

      if (!token) {
        log.error('❌ Missing token in OAuth callback')
        this.sendOAuthError(
          'Invalid OAuth callback: missing authentication token',
        )
        return { success: false, error: 'Missing token' }
      }

      // Validate state and get pending flow data
      const pendingFlow = this.pendingStates.get(state)
      if (!pendingFlow) {
        log.error('❌ Invalid or expired OAuth state')
        this.sendOAuthError('OAuth session expired. Please try again.')
        return { success: false, error: 'Invalid or expired state' }
      }

      // Check TTL
      if (Date.now() - pendingFlow.createdAt > this.stateTTL) {
        log.error('❌ OAuth state expired')
        this.pendingStates.delete(state)
        this.sendOAuthError('OAuth session expired. Please try again.')
        return { success: false, error: 'State expired' }
      }

      // Remove state (one-time use)
      this.pendingStates.delete(state)

      log.info('🔐 OAuth state validated, sending sign-in token to WebView')

      // Focus the main window to bring app back to foreground
      if (this.windowManager && this.windowManager.hasMainWindow()) {
        const mainWindow = this.windowManager.getMainWindow()
        mainWindow.show()
        mainWindow.focus()
      }

      // Send the sign-in token to the WebView
      // The WebView will use signIn.create({ strategy: 'ticket', ticket: token })
      // to create a session in its own cookie storage
      this.sendSignInToken(token, pendingFlow.provider)

      // Show notification (session completion happens in WebView)
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Signing In',
          'Completing authentication...',
          { type: 'info' },
        )
      }

      return { success: true, provider: pendingFlow.provider, token }
    } catch (error) {
      log.error('❌ Failed to handle OAuth callback:', error)
      this.sendOAuthError('Failed to complete sign-in. Please try again.')
      return { success: false, error: error.message }
    }
  }

  /**
   * Sends the sign-in token to the WebView for session creation.
   *
   * The WebView will use Clerk's ticket strategy to create a session:
   * signIn.create({ strategy: 'ticket', ticket: token })
   *
   * @param {string} token - Clerk sign-in token (sit_xxx)
   * @param {string} provider - OAuth provider (google, github)
   */
  sendSignInToken(token, provider) {
    this.sendToRenderer('clerk-sign-in-token', { token, provider })
  }

  /**
   * Exchanges authorization code for session using Clerk API.
   *
   * @param {string} code - Authorization code from OAuth callback
   * @param {string} verifier - PKCE code verifier
   * @param {string} provider - OAuth provider
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async exchangeCodeForSession(code, verifier, provider) {
    try {
      log.info('🔐 Exchanging authorization code for session')

      // For Clerk, the code exchange happens on the web app side
      // The Electron app receives the final session token via the web app
      //
      // Current approach: Send code to web app to complete exchange
      // The web app uses Clerk's SDK to handle the token exchange securely

      // Send message to renderer to complete the OAuth flow
      // The web app (running in WebView) will use Clerk SDK to exchange code
      this.sendToRenderer('oauth-complete-exchange', {
        code,
        verifier,
        provider,
      })

      // Note: The actual token exchange is completed by the web app
      // The result will be received via the existing auth sync mechanism
      // (ElectronAuthProvider already watches useUser() and syncs to main)

      return { success: true, pendingWebExchange: true }
    } catch (error) {
      log.error('❌ Failed to exchange code for session:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Sends OAuth success event to renderer.
   *
   * @param {object} user - User data
   */
  sendOAuthSuccess(user) {
    this.sendToRenderer('oauth-success', { user })
  }

  /**
   * Sends OAuth error event to renderer.
   *
   * @param {string} error - Error message
   */
  sendOAuthError(error) {
    this.sendToRenderer('oauth-error', { error })
  }

  /**
   * Sends event to renderer process.
   *
   * @param {string} channel - IPC channel name
   * @param {object} data - Data to send
   */
  sendToRenderer(channel, data) {
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * Cleans up expired pending OAuth states.
   *
   * Called periodically to prevent memory leaks from abandoned flows.
   */
  cleanupExpiredStates() {
    const now = Date.now()
    let cleaned = 0

    for (const [state, data] of this.pendingStates.entries()) {
      if (now - data.createdAt > this.stateTTL) {
        this.pendingStates.delete(state)
        cleaned++
      }
    }

    if (cleaned > 0) {
      log.debug(`🔐 Cleaned up ${cleaned} expired OAuth states`)
    }
  }

  /**
   * Gets the list of supported OAuth providers.
   *
   * @returns {string[]} Array of provider names
   */
  getSupportedProviders() {
    return ['google', 'github', 'apple']
  }

  /**
   * Checks if a provider is supported.
   *
   * @param {string} provider - Provider name
   * @returns {boolean} True if supported
   */
  isProviderSupported(provider) {
    return this.getSupportedProviders().includes(provider)
  }

  /**
   * Cancels any pending OAuth flow.
   *
   * @param {string} state - State to cancel (optional, cancels all if not provided)
   */
  cancelPendingFlow(state = null) {
    if (state) {
      this.pendingStates.delete(state)
    } else {
      this.pendingStates.clear()
    }
  }

  /**
   * Cleanup method called on app shutdown.
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.pendingStates.clear()
  }
}

module.exports = OAuthManager

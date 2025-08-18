import { http, HttpResponse } from 'msw'

// =============================================================================
// AUTHENTICATION STATE MANAGEMENT
// =============================================================================

/**
 * Global authentication state tracker
 * Used by all handlers to determine if user is authenticated
 * Persisted in localStorage for development
 */
let isAuthenticated =
  typeof window !== 'undefined'
    ? localStorage.getItem('msw_auth') === 'true'
    : false

// Helper function to persist auth state
const setAuthState = (authenticated: boolean) => {
  isAuthenticated = authenticated
  if (typeof window !== 'undefined') {
    localStorage.setItem('msw_auth', authenticated.toString())
  }
}

// =============================================================================
// MOCK DATA FACTORIES
// =============================================================================

/**
 * Creates a mock sign-in attempt response for Clerk
 * Used when OAuth flow completes successfully
 */
const createMockSignInResponse = () => ({
  object: 'sign_in_attempt',
  id: 'sia_mock_signin_attempt_id',
  status: 'complete',
  created_session_id: 'sess_mock_session_id',
  user_data: {
    id: 'user_mock_user_id',
    email_addresses: [
      {
        email_address: 'test@example.com',
        verification: {
          status: 'verified',
        },
      },
    ],
    first_name: 'Test',
    last_name: 'User',
    image_url: 'https://via.placeholder.com/150',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  created_at: Date.now(),
  updated_at: Date.now(),
  abandon_at: null,
})

/**
 * Creates a mock active session response for Clerk
 * Used to represent authenticated user session state
 */
const createMockSessionResponse = () => ({
  object: 'session',
  id: 'sess_mock_session_id',
  status: 'active',
  user: {
    id: 'user_mock_user_id',
    email_addresses: [
      {
        email_address: 'test@example.com',
        verification: {
          status: 'verified',
        },
      },
    ],
    first_name: 'Test',
    last_name: 'User',
    image_url: 'https://via.placeholder.com/150',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  created_at: Date.now(),
  updated_at: Date.now(),
  last_active_at: Date.now(),
})

// =============================================================================
// CLERK CORE API HANDLERS
// =============================================================================

/**
 * Main Clerk client endpoint handler
 * WHEN: Called by Clerk's client-side SDK on page load and state changes
 * PURPOSE: Returns current authentication state and active sessions
 * SUPPORTS: Test utilities for auth state management via URL parameters
 */
const clerkClientHandler = http.get(
  'https://*.clerk.accounts.dev/v1/client',
  ({ request }) => {
    const url = new URL(request.url)

    // Test utility: Reset authentication state
    if (url.searchParams.has('__MSW_RESET_AUTH__')) {
      setAuthState(false)
      console.log('[MSW] Authentication state reset for testing')
    }

    // Test utility: Set authentication state
    if (url.searchParams.has('__MSW_SET_AUTH__')) {
      setAuthState(true)
      console.log('[MSW] 🔐 Authentication state SET to true for testing')
    }

    console.log('[MSW] Clerk client request - authenticated:', isAuthenticated)

    return HttpResponse.json({
      sessions: isAuthenticated ? [createMockSessionResponse()] : [],
      sign_in: null,
      sign_up: null,
    })
  },
)

/**
 * Clerk sessions collection endpoint handler
 * WHEN: Called when checking for active user sessions
 * PURPOSE: Returns list of active sessions for authenticated users
 */
const clerkSessionsHandler = http.get(
  'https://*.clerk.accounts.dev/v1/client/sessions',
  () => {
    console.log(
      '[MSW] Clerk sessions request - authenticated:',
      isAuthenticated,
    )
    return HttpResponse.json({
      data: isAuthenticated ? [createMockSessionResponse()] : [],
    })
  },
)

/**
 * Clerk individual session endpoint handler
 * WHEN: Called when fetching specific session details by ID
 * PURPOSE: Returns session data or 404 if not authenticated
 */
const clerkSessionByIdHandler = http.get(
  'https://*.clerk.accounts.dev/v1/client/sessions/:sessionId',
  ({ params }) => {
    console.log('[MSW] Clerk session by ID request:', params.sessionId)
    if (!isAuthenticated) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json(createMockSessionResponse())
  },
)

/**
 * Clerk user profile endpoint handler
 * WHEN: Called when fetching authenticated user's profile information
 * PURPOSE: Returns user data or 401 if not authenticated
 */
const clerkUserHandler = http.get('https://*.clerk.accounts.dev/v1/me', () => {
  console.log('[MSW] Clerk user info request - authenticated:', isAuthenticated)
  if (!isAuthenticated) {
    return new HttpResponse(null, { status: 401 })
  }
  return HttpResponse.json({
    id: 'user_mock_user_id',
    email_addresses: [
      {
        email_address: 'test@example.com',
        verification: {
          status: 'verified',
        },
      },
    ],
    first_name: 'Test',
    last_name: 'User',
    image_url: 'https://via.placeholder.com/150',
    created_at: Date.now(),
    updated_at: Date.now(),
  })
})

/**
 * Clerk sign-out endpoint handler
 * WHEN: Called when user signs out of their session
 * PURPOSE: Ends the session and updates authentication state
 */
const clerkSignOutHandler = http.post(
  'https://*.clerk.accounts.dev/v1/client/sessions/:sessionId/end',
  ({ params }) => {
    console.log('[MSW] Clerk sign out request:', params.sessionId)
    setAuthState(false)
    return HttpResponse.json({
      object: 'session',
      id: params.sessionId,
      status: 'ended',
    })
  },
)

// =============================================================================
// CLERK OAUTH FLOW HANDLERS
// =============================================================================

/**
 * Clerk sign-in creation endpoint handler
 * WHEN: Called when user initiates OAuth sign-in (e.g., clicks "Continue with Google")
 * PURPOSE: Creates a new sign-in attempt and sets authenticated state
 */
const clerkSignInHandler = http.post(
  'https://*.clerk.accounts.dev/v1/client/sign_ins',
  ({ request }) => {
    console.log('[MSW] Clerk sign-in creation request:', request.url)
    setAuthState(true)
    return HttpResponse.json(createMockSignInResponse())
  },
)

/**
 * Clerk third-party OAuth attempt handler
 * WHEN: Called during OAuth flow when handling third-party provider response
 * PURPOSE: Processes OAuth callback and completes authentication
 */
const clerkThirdPartyAttemptHandler = http.post(
  'https://*.clerk.accounts.dev/v1/client/sign_ins/:signInId/attempt_third_party',
  ({ params }) => {
    console.log(
      '[MSW] Clerk third-party OAuth attempt request:',
      params.signInId,
    )
    setAuthState(true)
    return HttpResponse.json(createMockSignInResponse())
  },
)

/**
 * Clerk OAuth callback handler (primary pattern)
 * WHEN: Called when OAuth provider redirects back to Clerk with authorization code
 * PURPOSE: Completes OAuth flow and redirects to application home page
 */
const clerkOAuthCallbackHandler = http.get(
  'https://*.clerk.shared.lcl.dev/v1/oauth_callback',
  ({ request }) => {
    console.log('[MSW] 🎯 Clerk OAuth callback intercepted!')
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    console.log('[MSW] OAuth callback - code:', code, 'state:', state)

    if (code) {
      setAuthState(true)
      console.log('[MSW] ✅ OAuth callback successful - user authenticated')
      console.log('[MSW] ↪️ Redirecting to home page')
      return HttpResponse.redirect('http://localhost:3000/home', 302)
    }

    console.log('[MSW] ❌ OAuth callback failed - missing authorization code')
    return new HttpResponse(null, { status: 400 })
  },
)

/**
 * Clerk OAuth callback handler (alternative pattern)
 * WHEN: Called for alternative Clerk OAuth callback URL patterns
 * PURPOSE: Same as primary callback handler, handles different URL formats
 */
const clerkOAuthCallbackAlternativeHandler = http.get(
  'https://clerk.shared.lcl.dev/v1/oauth_callback',
  ({ request }) => {
    console.log('[MSW] 🎯 Clerk OAuth callback (alternative URL) intercepted!')
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    console.log('[MSW] OAuth callback - code:', code, 'state:', state)

    if (code) {
      setAuthState(true)
      console.log('[MSW] ✅ OAuth callback successful - user authenticated')
      console.log('[MSW] ↪️ Redirecting to home page')
      return HttpResponse.redirect('http://localhost:3000/home', 302)
    }

    console.log('[MSW] ❌ OAuth callback failed - missing authorization code')
    return new HttpResponse(null, { status: 400 })
  },
)

// =============================================================================
// GOOGLE OAUTH API HANDLERS (Prevent Real OAuth Redirects)
// =============================================================================

/**
 * Google OAuth authorization endpoint handler
 * WHEN: Called when user is redirected to Google for OAuth authorization
 * PURPOSE: Prevents actual redirect to Google, simulates successful OAuth callback
 */
const googleOAuthAuthorizationHandler = http.get(
  'https://accounts.google.com/o/oauth2/v2/auth',
  ({ request }) => {
    console.log('[MSW] Google OAuth authorization request intercepted')
    const url = new URL(request.url)
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')

    if (redirectUri && state) {
      // Simulate successful OAuth callback with authorization code
      const callbackUrl = `${redirectUri}?code=mock_auth_code_12345&state=${state}`
      console.log(
        '[MSW] Simulating OAuth success, redirecting to:',
        callbackUrl,
      )
      return HttpResponse.redirect(callbackUrl, 302)
    }

    console.log('[MSW] Invalid OAuth request - missing required parameters')
    return new HttpResponse(null, { status: 400 })
  },
)

/**
 * Google OAuth token exchange endpoint handler
 * WHEN: Called when exchanging authorization code for access tokens
 * PURPOSE: Returns mock tokens instead of making real API calls to Google
 */
const googleTokenExchangeHandler = http.post(
  'https://oauth2.googleapis.com/token',
  () => {
    console.log('[MSW] Google token exchange request intercepted')
    return HttpResponse.json({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
      id_token: 'mock_id_token.payload.signature',
    })
  },
)

/**
 * Google user info endpoint handler
 * WHEN: Called when fetching user profile information from Google
 * PURPOSE: Returns mock user data instead of making real API calls to Google
 */
const googleUserInfoHandler = http.get(
  'https://www.googleapis.com/oauth2/v2/userinfo',
  () => {
    console.log('[MSW] Google userinfo request intercepted')
    return HttpResponse.json({
      id: 'mock_google_user_id',
      email: 'test@example.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://via.placeholder.com/150',
    })
  },
)

// =============================================================================
// TEST UTILITY HANDLERS
// =============================================================================

/**
 * Direct auth state setter handler for testing
 * WHEN: Called by test code to manually set authentication state
 * PURPOSE: Allows tests to bypass OAuth flow and directly set auth state
 * USAGE: POST to /__msw_set_auth__ with { authenticated: boolean }
 */
const testAuthStateSetterHandler = http.post(
  'http://localhost:3000/__msw_set_auth__',
  async ({ request }) => {
    console.log('[MSW] 🧪 Test auth state setter called!')

    try {
      const body = await request.json()
      const { authenticated } = body as { authenticated: boolean }

      console.log('[MSW] 🔐 Setting authentication state to:', authenticated)
      setAuthState(authenticated)

      console.log('[MSW] ✅ Authentication state updated successfully!')
      return HttpResponse.json({
        success: true,
        authenticated: isAuthenticated,
      })
    } catch (error) {
      console.log('[MSW] ❌ Error setting auth state:', error)
      return HttpResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 },
      )
    }
  },
)

// =============================================================================
// EXPORTED HANDLERS ARRAY
// =============================================================================

export const handlers = [
  // Clerk Core API Handlers
  clerkClientHandler,
  clerkSessionsHandler,
  clerkSessionByIdHandler,
  clerkUserHandler,
  clerkSignOutHandler,

  // Clerk OAuth Flow Handlers
  clerkSignInHandler,
  clerkThirdPartyAttemptHandler,
  clerkOAuthCallbackHandler,
  clerkOAuthCallbackAlternativeHandler,

  // Google OAuth API Handlers (Prevent Real Redirects)
  googleOAuthAuthorizationHandler,
  googleTokenExchangeHandler,
  googleUserInfoHandler,

  // Test Utility Handlers
  testAuthStateSetterHandler,
]

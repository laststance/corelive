import { http, HttpResponse } from 'msw'

// Track authentication state
let isAuthenticated = false

// Mock successful Google OAuth sign-in response for Clerk
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

// Mock successful session response for Clerk
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

export const handlers = [
  // Mock Clerk client endpoint - returns session based on auth state
  http.get('https://*.clerk.accounts.dev/v1/client', ({ request }) => {
    // Check if this is a reset request
    const url = new URL(request.url)
    if (url.searchParams.has('__MSW_RESET_AUTH__')) {
      isAuthenticated = false
      console.log('[MSW] Authentication state reset')
    }

    // Check if this is a set auth request
    if (url.searchParams.has('__MSW_SET_AUTH__')) {
      isAuthenticated = true
      console.log(
        '[MSW] 🔐 Authentication state SET to true via Clerk client endpoint',
      )
    }

    console.log(
      '[MSW] Intercepting Clerk client request - authenticated:',
      isAuthenticated,
    )
    return HttpResponse.json({
      sessions: isAuthenticated ? [createMockSessionResponse()] : [],
      sign_in: null,
      sign_up: null,
    })
  }),

  // Mock Clerk sign-in endpoint for Google OAuth
  http.post(
    'https://*.clerk.accounts.dev/v1/client/sign_ins',
    ({ request }) => {
      console.log('[MSW] Intercepting Clerk sign-in request:', request.url)
      isAuthenticated = true // Set authentication state on login
      return HttpResponse.json(createMockSignInResponse())
    },
  ),

  // Mock Clerk session endpoint
  http.get('https://*.clerk.accounts.dev/v1/client/sessions', () => {
    console.log(
      '[MSW] Intercepting Clerk sessions request - authenticated:',
      isAuthenticated,
    )
    return HttpResponse.json({
      data: isAuthenticated ? [createMockSessionResponse()] : [],
    })
  }),

  // Mock Clerk session by ID endpoint
  http.get(
    'https://*.clerk.accounts.dev/v1/client/sessions/:sessionId',
    ({ params }) => {
      console.log(
        '[MSW] Intercepting Clerk session by ID request:',
        params.sessionId,
      )
      if (!isAuthenticated) {
        return new HttpResponse(null, { status: 404 })
      }
      return HttpResponse.json(createMockSessionResponse())
    },
  ),

  // Mock Clerk user endpoint
  http.get('https://*.clerk.accounts.dev/v1/me', () => {
    console.log(
      '[MSW] Intercepting Clerk user info request - authenticated:',
      isAuthenticated,
    )
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
  }),

  // Additional OAuth callback endpoints that might be needed
  http.post(
    'https://*.clerk.accounts.dev/v1/client/sign_ins/:signInId/attempt_third_party',
    ({ params }) => {
      console.log(
        '[MSW] Intercepting Clerk third-party attempt request:',
        params.signInId,
      )
      isAuthenticated = true
      return HttpResponse.json(createMockSignInResponse())
    },
  ),

  // Mock sign out endpoint
  http.post(
    'https://*.clerk.accounts.dev/v1/client/sessions/:sessionId/end',
    ({ params }) => {
      console.log(
        '[MSW] Intercepting Clerk sign out request:',
        params.sessionId,
      )
      isAuthenticated = false
      return HttpResponse.json({
        object: 'session',
        id: params.sessionId,
        status: 'ended',
      })
    },
  ),

  // Mock Google OAuth endpoints to prevent actual redirection to Google
  http.get('https://accounts.google.com/o/oauth2/v2/auth', ({ request }) => {
    console.log('[MSW] Intercepting Google OAuth authorization request')
    const url = new URL(request.url)
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')

    if (redirectUri && state) {
      // Simulate successful OAuth callback
      const callbackUrl = `${redirectUri}?code=mock_auth_code_12345&state=${state}`
      console.log('[MSW] Redirecting to callback URL:', callbackUrl)

      // Return a redirect response to the callback URL
      return HttpResponse.redirect(callbackUrl, 302)
    }

    return new HttpResponse(null, { status: 400 })
  }),

  // Mock Google OAuth token exchange
  http.post('https://oauth2.googleapis.com/token', () => {
    console.log('[MSW] Intercepting Google token exchange')
    return HttpResponse.json({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
      id_token: 'mock_id_token.payload.signature',
    })
  }),

  // Mock Google userinfo endpoint
  http.get('https://www.googleapis.com/oauth2/v2/userinfo', () => {
    console.log('[MSW] Intercepting Google userinfo request')
    return HttpResponse.json({
      id: 'mock_google_user_id',
      email: 'test@example.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://via.placeholder.com/150',
    })
  }),

  // Mock Clerk OAuth callback handling - ENHANCED with better logging
  http.get(
    'https://*.clerk.shared.lcl.dev/v1/oauth_callback',
    ({ request }) => {
      console.log('[MSW] 🎯 Intercepting Clerk OAuth callback!')
      const url = new URL(request.url)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      console.log('[MSW] 📋 OAuth callback - code:', code, 'state:', state)

      if (code) {
        isAuthenticated = true
        console.log(
          '[MSW] ✅ OAuth callback successful - setting authenticated=true',
        )
        console.log('[MSW] ↪️ Redirecting to home page')
        // Redirect back to the application home page
        return HttpResponse.redirect('http://localhost:3000/home', 302)
      }

      console.log('[MSW] ❌ OAuth callback failed - missing code parameter')
      return new HttpResponse(null, { status: 400 })
    },
  ),

  // Also handle the alternative callback URL pattern
  http.get('https://clerk.shared.lcl.dev/v1/oauth_callback', ({ request }) => {
    console.log(
      '[MSW] 🎯 Intercepting Clerk OAuth callback (alternative pattern)!',
    )
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    console.log('[MSW] 📋 OAuth callback - code:', code, 'state:', state)

    if (code) {
      isAuthenticated = true
      console.log(
        '[MSW] ✅ OAuth callback successful - setting authenticated=true',
      )
      console.log('[MSW] ↪️ Redirecting to home page')
      return HttpResponse.redirect('http://localhost:3000/home', 302)
    }

    console.log('[MSW] ❌ OAuth callback failed - missing code parameter')
    return new HttpResponse(null, { status: 400 })
  }),

  // DIRECT AUTH STATE SETTER - for Playwright tests to set authentication directly
  http.post('http://localhost:3000/__msw_set_auth__', async ({ request }) => {
    console.log('[MSW] 🎯 Direct auth state setter called!')

    try {
      const body = await request.json()
      const { authenticated } = body as { authenticated: boolean }

      console.log('[MSW] 🔐 Setting authentication state to:', authenticated)
      isAuthenticated = authenticated

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
  }),
]

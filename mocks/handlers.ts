import { http, HttpResponse } from 'msw'

let webhookSent = false

// Google OAuth Mock Handlers
export const handlers = [
  // Mock Google OAuth v3 signin identifier endpoint (newer endpoint)
  http.get(
    'https://accounts.google.com/v3/signin/identifier',
    ({ request }) => {
      console.log('[MSW] Intercepted Google OAuth v3 signin identifier request')
      const url = new URL(request.url)
      const state = url.searchParams.get('state')
      const redirectUri = url.searchParams.get('redirect_uri')

      if (redirectUri) {
        // Simulate OAuth redirect with mock authorization code directly to Clerk callback
        const callbackUrl = new URL(redirectUri)
        callbackUrl.searchParams.set('code', 'mock_auth_code_123')
        if (state) {
          callbackUrl.searchParams.set('state', state)
        }

        console.log(
          '[MSW] Redirecting to Clerk callback:',
          callbackUrl.toString(),
        )

        // Return a redirect response to Clerk's OAuth callback
        return new Response(null, {
          status: 302,
          headers: {
            Location: callbackUrl.toString(),
          },
        })
      }

      return new HttpResponse(null, { status: 400 })
    },
  ),

  // Mock any Google accounts.google.com requests (catch-all for v3 endpoints)
  http.get('https://accounts.google.com/*', ({ request }) => {
    console.log('[MSW] Intercepted Google accounts request:', request.url)
    const url = new URL(request.url)
    const state = url.searchParams.get('state')
    const clientId = url.searchParams.get('client_id')
    const redirectUri = url.searchParams.get('redirect_uri')

    // If this looks like an OAuth authorization request
    if (redirectUri && clientId) {
      // Simulate OAuth redirect with mock authorization code directly to Clerk callback
      const callbackUrl = new URL(redirectUri)
      callbackUrl.searchParams.set('code', 'mock_auth_code_123')
      if (state) {
        callbackUrl.searchParams.set('state', state)
      }

      console.log(
        '[MSW] Redirecting OAuth request to Clerk callback:',
        callbackUrl.toString(),
      )

      // Return a redirect response to Clerk's OAuth callback
      return new Response(null, {
        status: 302,
        headers: {
          Location: callbackUrl.toString(),
        },
      })
    }

    // For non-OAuth requests, let them pass through
    return undefined
  }),

  // Mock Clerk OAuth initiation endpoints that trigger the Google OAuth flow
  http.post(
    'https://*.clerk.accounts.dev/v1/client/sign_ins/:signInId/authenticator/oauth_google',
    ({ params }) => {
      console.log('[MSW] Intercepted Clerk Google OAuth initiation', params)

      // Instead of redirecting to Google, simulate immediate success
      return HttpResponse.json({
        response: {
          id: params.signInId,
          status: 'needs_verification',
          supported_external_accounts: [],
          external_account: {
            id: 'ext_mock_123',
            provider: 'oauth_google',
            verification: {
              status: 'verified',
              strategy: 'oauth_google',
            },
          },
        },
      })
    },
  ),

  // Mock Clerk OAuth strategy creation
  http.post(
    'https://*.clerk.accounts.dev/v1/client/sign_ins',
    async ({ request }) => {
      console.log('[MSW] Intercepted Clerk sign-in creation')
      const body = await request.text()

      if (body.includes('oauth_google')) {
        // Simulate immediate OAuth success and redirect to home
        console.log(
          '[MSW] Simulating successful Google OAuth, redirecting to /home',
        )

        // Instead of trying to set cookies from a cross-origin request, redirect the browser
        // to a local endpoint that can set first-party cookies reliably.
        return HttpResponse.json(
          {
            response: {
              id: 'sign_in_mock_123',
              status: 'complete',
              created_session_id: 'sess_mock_123',
            },
          },
          {
            headers: {
              // Hint clients to navigate to our local cookie setter endpoint
              'X-Mock-Redirect': 'http://localhost:3000/api/mock-auth',
            },
          },
        )
      }

      return HttpResponse.json({
        response: {
          id: 'sign_in_mock_123',
          status: 'needs_verification',
        },
      })
    },
  ),

  // Mock Google OAuth authorization endpoint (v2 - fallback)
  http.get('https://accounts.google.com/o/oauth2/v2/auth', ({ request }) => {
    console.log('[MSW] Intercepted Google OAuth authorization request')
    const url = new URL(request.url)
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')

    if (redirectUri) {
      // Simulate OAuth redirect with mock authorization code
      const callbackUrl = new URL(redirectUri)
      callbackUrl.searchParams.set('code', 'mock_auth_code_123')
      if (state) {
        callbackUrl.searchParams.set('state', state)
      }

      // Return a redirect response
      return new Response(null, {
        status: 302,
        headers: {
          Location: callbackUrl.toString(),
        },
      })
    }

    return new HttpResponse(null, { status: 400 })
  }),

  // Mock Google OAuth token exchange endpoint
  http.post('https://oauth2.googleapis.com/token', async ({ request }) => {
    console.log('[MSW] Intercepted Google OAuth token exchange request')
    const body = await request.text()
    const params = new URLSearchParams(body)
    const code = params.get('code')

    if (code === 'mock_auth_code_123') {
      return HttpResponse.json({
        access_token: 'mock_access_token_abc123',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock_refresh_token_xyz789',
        scope: 'openid email profile',
        id_token: 'mock_id_token_jwt',
      })
    }

    return HttpResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      },
      { status: 400 },
    )
  }),

  // Mock Google userinfo endpoint
  http.get('https://www.googleapis.com/oauth2/v2/userinfo', ({ request }) => {
    console.log('[MSW] Intercepted Google userinfo request')
    const authHeader = request.headers.get('authorization')

    if (authHeader === 'Bearer mock_access_token_abc123') {
      return HttpResponse.json({
        id: '123456789',
        email: 'testuser@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://lh3.googleusercontent.com/a/default-user',
        locale: 'en',
      })
    }

    return HttpResponse.json({ error: 'invalid_token' }, { status: 401 })
  }),

  // Mock Clerk OAuth endpoints (if Clerk is handling OAuth)
  http.post('https://api.clerk.com/v1/oauth/authorize', () => {
    console.log('[MSW] Intercepted Clerk OAuth authorize request')
    return HttpResponse.json({
      auth_session_id: 'mock_session_123',
      redirect_url:
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&redirect_uri=http://localhost:3000/login&state=mock_state',
    })
  }),

  // Mock Clerk OAuth callback
  http.post('https://api.clerk.com/v1/oauth/callback', async ({ request }) => {
    console.log('[MSW] Intercepted Clerk OAuth callback request')
    const body = (await request.json()) as { code?: string; state?: string }

    if (body.code === 'mock_auth_code_123') {
      // Fire a mock Clerk webhook to our Next.js endpoint to create a test user in Postgres
      fetch('http://localhost:3000/api/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Signal our server to bypass Svix verification in mock mode
          'X-MSW-Mock': 'true',
        },
        body: JSON.stringify({
          type: 'user.created',
          data: {
            id: 'user_mock_123',
            username: 'test.user',
            first_name: 'Test',
            last_name: 'User',
            email_addresses: [
              { id: 'email_mock_123', email_address: 'testuser@example.com' },
            ],
          },
        }),
      }).catch((err) => {
        console.warn('[MSW] Failed to post mock webhook to /api/webhooks', err)
      })

      return HttpResponse.json({
        session_id: 'sess_mock_123',
        user_id: 'user_mock_123',
        status: 'complete',
        user: {
          id: 'user_mock_123',
          email: 'testuser@example.com',
          first_name: 'Test',
          last_name: 'User',
          profile_image_url: 'https://lh3.googleusercontent.com/a/default-user',
        },
      })
    }

    return HttpResponse.json(
      { error: 'invalid_authorization_code' },
      { status: 400 },
    )
  }),

  // Mock Clerk session endpoint
  http.get('https://api.clerk.com/v1/sessions/:sessionId', ({ params }) => {
    console.log('[MSW] Intercepted Clerk session request', params)

    if (params.sessionId === 'sess_mock_123') {
      return HttpResponse.json({
        id: 'sess_mock_123',
        user_id: 'user_mock_123',
        status: 'active',
        last_active_at: new Date().toISOString(),
        expire_at: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
      })
    }

    return HttpResponse.json({ error: 'session_not_found' }, { status: 404 })
  }),

  // Mock Clerk user endpoint
  http.get('https://api.clerk.com/v1/users/:userId', ({ params }) => {
    console.log('[MSW] Intercepted Clerk user request', params)

    if (params.userId === 'user_mock_123') {
      return HttpResponse.json({
        id: 'user_mock_123',
        email_addresses: [
          {
            id: 'email_mock_123',
            email_address: 'testuser@example.com',
            verification: {
              status: 'verified',
              strategy: 'oauth_google',
            },
          },
        ],
        first_name: 'Test',
        last_name: 'User',
        profile_image_url: 'https://lh3.googleusercontent.com/a/default-user',
        external_accounts: [
          {
            id: 'ext_mock_123',
            provider: 'oauth_google',
            provider_user_id: '123456789',
            email_address: 'testuser@example.com',
            first_name: 'Test',
            last_name: 'User',
            image_url: 'https://lh3.googleusercontent.com/a/default-user',
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    return HttpResponse.json({ error: 'user_not_found' }, { status: 404 })
  }),

  // Mock Clerk OAuth callback endpoint (handles the redirect from Google OAuth)
  http.get('https://clerk.shared.lcl.dev/v1/oauth_callback', ({ request }) => {
    console.log('[MSW] Intercepted Clerk OAuth callback request')
    const url = new URL(request.url)
    const code = url.searchParams.get('code')

    if (code === 'mock_auth_code_123') {
      console.log(
        '[MSW] Processing mock OAuth callback, setting session cookies and redirecting to /home',
      )

      // Create a mock Clerk session token (JWT-like structure)
      const mockSessionToken =
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjbGVyay5sb2NhbCIsInN1YiI6InVzZXJfbW9ja18xMjMiLCJleHAiOjE3NTQ3Nzk3MTIsImlhdCI6MTc1NDY5MzMxMiwic2lkIjoic2Vzc19tb2NrXzEyMyJ9.mock_signature'

      // Set Clerk session cookies and redirect to /home
      return new Response(null, {
        status: 302,
        headers: {
          Location: 'http://localhost:3000/home',
          'Set-Cookie': [
            `__session=${mockSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
            `__clerk_db_jwt=${mockSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
            `clerk-session=${mockSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          ].join(', '),
        },
      })
    }

    // If invalid code, redirect back to login with error
    return new Response(null, {
      status: 302,
      headers: {
        Location: 'http://localhost:3000/login?error=oauth_callback_error',
      },
    })
  }),

  // Mock Clerk client-side auth check endpoint
  http.get('https://*.clerk.accounts.dev/v1/client', () => {
    console.log('[MSW] Intercepted Clerk client auth check')
    if (!webhookSent) {
      webhookSent = true
      // Fire a mock Clerk webhook to our Next.js endpoint to create a test user in Postgres
      fetch('http://localhost:3000/api/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MSW-Mock': 'true',
        },
        body: JSON.stringify({
          type: 'user.created',
          data: {
            id: 'user_mock_123',
            username: 'test.user',
            first_name: 'Test',
            last_name: 'User',
            email_addresses: [
              { id: 'email_mock_123', email_address: 'testuser@example.com' },
            ],
          },
        }),
      }).catch((err) => {
        console.warn(
          '[MSW] Failed to post mock webhook to /api/webhooks from client handler',
          err,
        )
      })
    }
    return HttpResponse.json({
      response: {
        id: 'client_mock_123',
        sessions: [
          {
            id: 'sess_mock_123',
            status: 'active',
            user: {
              id: 'user_mock_123',
              email_addresses: [
                {
                  email_address: 'testuser@example.com',
                  verification: { status: 'verified' },
                },
              ],
              first_name: 'Test',
              last_name: 'User',
              profile_image_url:
                'https://lh3.googleusercontent.com/a/default-user',
            },
          },
        ],
        sign_in: null,
        sign_up: null,
      },
    })
  }),
]

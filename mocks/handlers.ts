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

    const response = {
      sessions: isAuthenticated ? [createMockSessionResponse()] : [],
      sign_in: null,
      sign_up: null,
      user: isAuthenticated ? createMockSessionResponse().user : null,
      last_active_session_id: isAuthenticated ? 'sess_mock_session_id' : null,
    }

    // If authenticated, ensure Clerk knows about the authentication
    if (isAuthenticated) {
      console.log('[MSW] ✅ Returning authenticated session to Clerk')
    }

    return HttpResponse.json(response)
  },
)

// =============================================================================
// EXPORTED HANDLERS ARRAY
// =============================================================================

export const handlers = [
  // Clerk Core API Handlers
  clerkClientHandler,
]

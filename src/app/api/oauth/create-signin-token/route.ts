import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/oauth/create-signin-token
 *
 * Creates a one-time sign-in token for the authenticated user.
 * This is used in the Electron OAuth flow:
 *
 * 1. User completes OAuth in system browser (Clerk creates session)
 * 2. Browser calls this API to get a sign-in token
 * 3. Browser redirects to Electron via deep link with the token
 * 4. Electron WebView uses the token to create its own session
 *
 * Security:
 * - Token expires in 60 seconds (very short-lived)
 * - Token can only be used once
 * - Only authenticated users can create tokens
 *
 * @returns {Promise<NextResponse>} JSON with token or error
 */
export async function POST() {
  try {
    // Get the authenticated user from the browser session
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in first.' },
        { status: 401 },
      )
    }

    // Create a sign-in token using Clerk's backend API
    const client = await clerkClient()
    const expiresInSeconds = 60
    const signInToken = await client.signInTokens.createSignInToken({
      userId,
      expiresInSeconds,
    })

    return NextResponse.json({
      token: signInToken.token,
      expiresInSeconds,
      expiresAt: signInToken.createdAt
        ? signInToken.createdAt + expiresInSeconds * 1000
        : Date.now() + expiresInSeconds * 1000,
    })
  } catch (error) {
    console.error('Failed to create sign-in token:', error)
    return NextResponse.json(
      { error: 'Failed to create authentication token' },
      { status: 500 },
    )
  }
}

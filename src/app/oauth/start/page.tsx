'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import type { OAuthStrategy } from '@clerk/shared/types'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

/**
 * OAuth Start Page - System Browser Entry Point for Electron OAuth
 *
 * This page is opened in the system browser by Electron when the user
 * clicks "Continue with Google/GitHub" in the desktop app.
 *
 * Flow:
 * 1. Electron opens: https://corelive.app/oauth/start?provider=google&state=xxx
 * 2. This page uses Clerk's authenticateWithRedirect() to start OAuth
 * 3. Clerk redirects to OAuth provider (Google/GitHub)
 * 4. Provider redirects back to Clerk
 * 5. Clerk redirects to /oauth/sso-callback first so Clerk can finalize the browser session
 * 6. Clerk then redirects to /oauth/callback to create the one-time Electron sign-in token
 * 6. /oauth/callback page redirects to corelive:// deep link
 *
 * Why is this needed?
 * - Google OAuth blocks WebView authentication (403: disallowed_useragent)
 * - Clerk doesn't expose a direct /v1/oauth_authorize endpoint
 * - We need to use Clerk's SDK to initiate the OAuth flow properly
 */

type StartStatus = 'loading' | 'starting' | 'error'

/** Browser callback route that hosts Clerk's redirect callback component. */
const OAUTH_CALLBACK_ROUTE = '/oauth/sso-callback'

/** Final route that creates the one-time Electron sign-in token. */
const OAUTH_COMPLETE_ROUTE = '/oauth/callback'

function OAuthStartContent() {
  const searchParams = useSearchParams()
  const { client } = useClerk()
  const { isLoaded: isUserLoaded, user } = useUser()
  const [status, setStatus] = useState<StartStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const hasStartedOAuth = useRef(false)

  const provider = searchParams.get('provider') as 'google' | 'github' | null
  const state = searchParams.get('state')

  useEffect(() => {
    const signIn = client?.signIn

    // Wait for Clerk to load
    if (!signIn) return

    // Validate parameters
    if (!provider || !['google', 'github'].includes(provider)) {
      setStatus('error')
      setErrorMessage('Invalid provider. Please try again from the app.')
      return
    }

    if (!state) {
      setStatus('error')
      setErrorMessage('Missing state parameter. Please try again from the app.')
      return
    }

    if (hasStartedOAuth.current) {
      return
    }

    const oauthCompleteUrl = buildOAuthCompleteUrl(state)

    // If the browser already has a Clerk session, skip restarting OAuth and
    // continue straight to the token-creation bridge page.
    if (isUserLoaded && user) {
      hasStartedOAuth.current = true
      setStatus('starting')
      window.location.replace(oauthCompleteUrl)
      return
    }

    // Start OAuth flow
    const startOAuth = async () => {
      setStatus('starting')
      hasStartedOAuth.current = true

      try {
        const strategy: OAuthStrategy = `oauth_${provider}`
        const redirectUrl = buildOAuthCallbackUrl(state)

        // Use Clerk's documented browser redirect flow for OAuth.
        // redirectUrl hosts <AuthenticateWithRedirectCallback />, while
        // redirectUrlComplete is our own page that bridges the browser
        // session into Electron using a one-time sign-in token.
        await signIn.authenticateWithRedirect({
          strategy,
          redirectUrl,
          redirectUrlComplete: oauthCompleteUrl,
        })
      } catch (err) {
        console.error('OAuth start error:', err)
        if (isAlreadySignedInError(err)) {
          window.location.replace(oauthCompleteUrl)
          return
        }
        setStatus('error')
        setErrorMessage(getOAuthStartErrorMessage(err))
      }
    }

    void startOAuth()
  }, [client, isUserLoaded, provider, state, user])

  return (
    <div className="bg-linear-to-b flex min-h-screen flex-col items-center justify-center from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        {(status === 'loading' || status === 'starting') && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
              {status === 'loading'
                ? 'Preparing Authentication'
                : `Connecting to ${provider === 'google' ? 'Google' : 'GitHub'}`}
            </h1>
            <p className="text-center text-gray-600">
              {status === 'loading'
                ? 'Please wait...'
                : 'You will be redirected to sign in...'}
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-8 w-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
              Authentication Error
            </h1>
            <p className="mb-4 text-center text-gray-600">{errorMessage}</p>
            <div className="flex justify-center">
              <button
                onClick={() => window.close()}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition hover:bg-gray-200"
              >
                Close this window
              </button>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        CoreLive - Task Management for Productivity
      </p>
    </div>
  )
}

/**
 * Extracts a human-readable OAuth start error from Clerk failures.
 *
 * @param error - Unknown error returned by Clerk's redirect flow.
 * @returns
 * - A specific Clerk error message when present.
 * - A safe fallback message for unexpected failures.
 * @example
 * getOAuthStartErrorMessage({ errors: [{ longMessage: 'Redirect URL is invalid' }] })
 * // => 'Redirect URL is invalid'
 */
function getOAuthStartErrorMessage(error: unknown): string {
  const clerkError = error as {
    errors?: Array<{ longMessage?: string; message?: string }>
    message?: string
  }

  return (
    clerkError?.errors?.[0]?.longMessage ||
    clerkError?.errors?.[0]?.message ||
    clerkError?.message ||
    'Failed to start authentication. Please try again from the app.'
  )
}

/**
 * Returns whether Clerk rejected OAuth start because the browser session
 * already belongs to an authenticated user.
 *
 * @param error - Unknown Clerk redirect error.
 * @returns
 * - `true` when Clerk says the browser is already signed in.
 * - `false` for all other failures.
 * @example
 * isAlreadySignedInError({ errors: [{ message: \"You're already signed in.\" }] }) // => true
 */
function isAlreadySignedInError(error: unknown): boolean {
  const normalizedMessage = getOAuthStartErrorMessage(error).toLowerCase()
  return normalizedMessage.includes('already signed in')
}

/**
 * Builds the Clerk callback route that hosts `<AuthenticateWithRedirectCallback />`.
 *
 * @param state - OAuth state token that must survive the browser redirect.
 * @returns Path to the Clerk callback route.
 * @example
 * buildOAuthCallbackUrl('state_123') // => '/oauth/sso-callback?state=state_123'
 */
function buildOAuthCallbackUrl(state: string): string {
  return `${OAUTH_CALLBACK_ROUTE}?state=${encodeURIComponent(state)}`
}

/**
 * Builds the completion route that exchanges the browser session for an
 * Electron one-time sign-in token.
 *
 * @param state - OAuth state token that must be passed back to Electron.
 * @returns Path to the Electron bridge callback route.
 * @example
 * buildOAuthCompleteUrl('state_123') // => '/oauth/callback?state=state_123'
 */
function buildOAuthCompleteUrl(state: string): string {
  return `${OAUTH_COMPLETE_ROUTE}?state=${encodeURIComponent(state)}`
}

/**
 * OAuth Start Page with Suspense wrapper.
 *
 * useSearchParams() requires Suspense boundary in Next.js App Router.
 */
export default function OAuthStartPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        </div>
      }
    >
      <OAuthStartContent />
    </Suspense>
  )
}

'use client'

import { useSignIn, useSignUp } from '@clerk/nextjs'
import type { OAuthStrategy } from '@clerk/types'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/**
 * OAuth Start Page - System Browser Entry Point for Electron OAuth
 *
 * This page is opened in the system browser by Electron when the user
 * clicks "Continue with Google/GitHub" in the desktop app.
 *
 * Flow:
 * 1. Electron opens: https://corelive.app/oauth/start?provider=google&state=xxx
 * 2. This page uses Clerk's signIn.authenticateWithRedirect() to start OAuth
 * 3. Clerk redirects to OAuth provider (Google/GitHub)
 * 4. Provider redirects back to Clerk
 * 5. Clerk redirects to /oauth/callback (specified in redirectUrl)
 * 6. /oauth/callback page redirects to corelive:// deep link
 *
 * Why is this needed?
 * - Google OAuth blocks WebView authentication (403: disallowed_useragent)
 * - Clerk doesn't expose a direct /v1/oauth_authorize endpoint
 * - We need to use Clerk's SDK to initiate the OAuth flow properly
 */

type StartStatus = 'loading' | 'starting' | 'error'

function OAuthStartContent() {
  const searchParams = useSearchParams()
  const { signIn, isLoaded: isSignInLoaded } = useSignIn()
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp()
  const [status, setStatus] = useState<StartStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const provider = searchParams.get('provider') as 'google' | 'github' | null
  const state = searchParams.get('state')

  useEffect(() => {
    // Wait for Clerk to load
    if (!isSignInLoaded || !isSignUpLoaded) return

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

    // Start OAuth flow
    const startOAuth = async () => {
      setStatus('starting')

      try {
        const strategy: OAuthStrategy = `oauth_${provider}`

        // Use Clerk's authenticateWithRedirect to start the OAuth flow
        // The redirectUrl is where Clerk will send the user after OAuth completes
        // We include the state parameter in the URL so we can pass it back to Electron
        await signIn?.authenticateWithRedirect({
          strategy,
          redirectUrl: `/oauth/sso-callback?state=${encodeURIComponent(state)}`,
          redirectUrlComplete: `/oauth/callback?state=${encodeURIComponent(state)}`,
        })
      } catch (err) {
        console.error('OAuth start error:', err)

        // If sign-in fails, try sign-up (user might not exist yet)
        try {
          const strategy: OAuthStrategy = `oauth_${provider}`

          await signUp?.authenticateWithRedirect({
            strategy,
            redirectUrl: `/oauth/sso-callback?state=${encodeURIComponent(state)}`,
            redirectUrlComplete: `/oauth/callback?state=${encodeURIComponent(state)}`,
          })
        } catch (signUpErr) {
          console.error('OAuth sign-up error:', signUpErr)
          setStatus('error')
          setErrorMessage(
            'Failed to start authentication. Please try again from the app.',
          )
        }
      }
    }

    void startOAuth()
  }, [isSignInLoaded, isSignUpLoaded, provider, state, signIn, signUp])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
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

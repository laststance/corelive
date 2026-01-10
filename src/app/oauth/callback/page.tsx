'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/**
 * OAuth Callback Page - Browser-to-Electron Bridge with Sign-In Token
 *
 * This page is loaded in the system browser after Clerk completes OAuth.
 * It fetches a sign-in token and passes it to Electron via deep link.
 *
 * Flow:
 * 1. User completes OAuth in browser → Clerk creates session in browser
 * 2. This page calls /api/oauth/create-signin-token to get a one-time token
 * 3. Token is passed to Electron via deep link: corelive://oauth/callback?token=xxx
 * 4. Electron WebView uses token with signIn.create({ strategy: 'ticket', ticket: token })
 * 5. WebView now has its own authenticated session
 *
 * Why is this needed?
 * - Google OAuth blocks WebView authentication (403: disallowed_useragent)
 * - Clerk session in browser cannot be shared with Electron WebView (separate cookie storage)
 * - Sign-in tokens allow creating a new session in the WebView
 */

type CallbackStatus =
  | 'loading'
  | 'creating-token'
  | 'redirecting'
  | 'success'
  | 'error'

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle OAuth error from Clerk
    if (error) {
      setStatus('error')
      setErrorMessage(errorDescription || error || 'Authentication failed')
      return
    }

    // Validate required parameters
    if (!state) {
      setStatus('error')
      setErrorMessage('Missing state parameter. Please try again.')
      return
    }

    // Fetch sign-in token and redirect to Electron
    const createTokenAndRedirect = async () => {
      try {
        setStatus('creating-token')

        // Call server API to create a sign-in token
        const response = await fetch('/api/oauth/create-signin-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to create authentication token')
        }

        const { token } = await response.json()

        if (!token) {
          throw new Error('No token received from server')
        }

        // Build deep link with both state (for validation) and token (for sign-in)
        const deepLink = `corelive://oauth/callback?state=${encodeURIComponent(state)}&token=${encodeURIComponent(token)}`

        setStatus('redirecting')

        // Redirect to Electron app via deep link
        // Small delay to show UI update
        setTimeout(() => {
          window.location.href = deepLink
        }, 100)

        // After a short delay, show success message
        // (User may need to manually return to app if deep link doesn't auto-focus)
        setTimeout(() => {
          setStatus('success')
        }, 2000)
      } catch (err) {
        console.error('OAuth callback error:', err)
        setStatus('error')
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to complete authentication',
        )
      }
    }

    void createTokenAndRedirect()
  }, [searchParams])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        {(status === 'loading' || status === 'creating-token') && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
              {status === 'loading'
                ? 'Processing Authentication'
                : 'Creating Session'}
            </h1>
            <p className="text-center text-gray-600">
              {status === 'loading'
                ? 'Please wait while we complete your sign-in...'
                : 'Preparing secure token for the app...'}
            </p>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="h-12 w-12 animate-pulse rounded-full bg-blue-100">
                <svg
                  className="h-12 w-12 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
              Returning to CoreLive
            </h1>
            <p className="text-center text-gray-600">
              Opening the desktop app...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
              Authentication Complete
            </h1>
            <p className="mb-4 text-center text-gray-600">
              You can now return to the CoreLive desktop app.
            </p>
            <p className="text-center text-sm text-gray-500">
              If the app didn&apos;t open automatically, please switch to it
              manually.
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
              Authentication Failed
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
 * OAuth Callback Page with Suspense wrapper.
 *
 * useSearchParams() requires Suspense boundary in Next.js App Router.
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  )
}

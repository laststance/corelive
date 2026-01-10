'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/**
 * OAuth Callback Page - Browser-to-Deep-Link Bridge
 *
 * This page is loaded in the system browser after OAuth authentication completes.
 * It extracts the authorization code and state from URL parameters and redirects
 * to the Electron app via deep link.
 *
 * Flow:
 * 1. Clerk OAuth redirects here after Google authentication
 * 2. This page extracts code + state from URL
 * 3. Redirects to: corelive://oauth/callback?code=...&state=...
 * 4. Electron's DeepLinkManager receives and processes the callback
 *
 * Why is this needed?
 * - Google OAuth blocks WebView authentication
 * - OAuth must complete in system browser
 * - Deep link bridges browser back to Electron app
 */

type CallbackStatus = 'loading' | 'redirecting' | 'success' | 'error'

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle OAuth error
    if (error) {
      setStatus('error')
      setErrorMessage(errorDescription || error || 'Authentication failed')
      return
    }

    // Validate required parameters
    if (!code || !state) {
      setStatus('error')
      setErrorMessage('Missing authentication parameters. Please try again.')
      return
    }

    // Construct deep link
    const deepLink = `corelive://oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`

    setStatus('redirecting')

    // Attempt to redirect to Electron app via deep link
    // Use timeout to allow UI to update before redirect
    const redirectTimeout = setTimeout(() => {
      window.location.href = deepLink
    }, 100)

    // After a short delay, show success message
    // (User may need to manually return to app if deep link doesn't auto-focus)
    const successTimeout = setTimeout(() => {
      setStatus('success')
    }, 2000)

    return () => {
      clearTimeout(redirectTimeout)
      clearTimeout(successTimeout)
    }
  }, [searchParams])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        {status === 'loading' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
              Processing Authentication
            </h1>
            <p className="text-center text-gray-600">
              Please wait while we complete your sign-in...
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

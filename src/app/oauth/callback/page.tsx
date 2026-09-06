'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { OAuthError } from '@/components/auth/OAuthError'
import { useCycleEffect } from '@/hooks/use-cycle-effect'

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
  'loading' | 'creating-token' | 'redirecting' | 'success' | 'error'

const OAuthCallbackContent = function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useCycleEffect(() => {
    let isMounted = true
    let redirectTimer: number | undefined
    let successTimer: number | undefined

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
        if (!isMounted) return

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
        // eslint-disable-next-line browser-security/no-credentials-in-query-params -- Desktop sign-in uses a state-bound, short-lived Clerk token in its custom-protocol callback.
        const deepLink = `corelive://oauth/callback?state=${encodeURIComponent(state)}&token=${encodeURIComponent(token)}`

        if (!isMounted) return

        setStatus('redirecting')

        // Redirect to Electron app via deep link
        // Small delay to show UI update
        redirectTimer = window.setTimeout(() => {
          window.location.href = deepLink
        }, 100)

        // After a short delay, show success message
        // (User may need to manually return to app if deep link doesn't auto-focus)
        successTimer = window.setTimeout(() => {
          if (!isMounted) return
          setStatus('success')
        }, 2000)
      } catch (err) {
        if (!isMounted) return

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

    return () => {
      isMounted = false
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer)
      if (successTimer !== undefined) window.clearTimeout(successTimer)
    }
  }, [state, error, errorDescription])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg">
        {(status === 'loading' || status === 'creating-token') && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="h-12 w-12 rounded-full border-4 border-border border-t-primary motion-safe:animate-spin" />
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold text-foreground">
              {status === 'loading'
                ? 'Processing Authentication'
                : 'Creating Session'}
            </h1>
            <p className="text-center text-muted-foreground">
              {status === 'loading'
                ? 'Please wait while we complete your sign-in...'
                : 'Preparing secure token for the app...'}
            </p>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="bg-primary/10 h-12 w-12 rounded-full motion-safe:animate-pulse">
                <svg
                  className="h-12 w-12 text-primary"
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
            <h1 className="mb-2 text-center text-xl font-semibold text-foreground">
              Returning to CoreLive
            </h1>
            <p className="text-center text-muted-foreground">
              Opening the desktop app...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                <svg
                  className="h-8 w-8 text-primary"
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
            <h1 className="mb-2 text-center text-xl font-semibold text-foreground">
              Authentication Complete
            </h1>
            <p className="mb-4 text-center text-muted-foreground">
              You can now return to the CoreLive desktop app.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              If the app didn&apos;t open automatically, please switch to it
              manually.
            </p>
          </>
        )}

        {status === 'error' && (
          <OAuthError
            title="Authentication Failed"
            errorMessage={errorMessage}
          />
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
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
const OAuthCallbackPage = function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 rounded-full border-4 border-border border-t-primary motion-safe:animate-spin" />
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  )
}

export default OAuthCallbackPage

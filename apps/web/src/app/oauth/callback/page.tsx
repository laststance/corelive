'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useRef, useState } from 'react'

import { OAuthError } from '@/components/auth/OAuthError'
import { Button } from '@/components/ui/button'
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
  | 'loading'
  | 'creating-token'
  | 'redirecting'
  | 'success'
  | 'error'
  | 'return-error'

/**
 * Requests a fresh native sign-in ticket for the automatic callback or explicit browser retry.
 * Keeps the short-lived return URL out of DOM attributes and logs.
 * @param state - The native OAuth attempt that must receive this ticket.
 * @returns A private state-bound URL and local deadlines for a synchronous native return.
 * @throws When the server cannot issue a usable sign-in ticket.
 * @example const returnUrl = await requestDesktopReturn('pending-oauth-state')
 */
async function requestDesktopReturn(
  state: string,
): Promise<{ url: string; validUntil: number; wallClockDeadline: number }> {
  // Count network time against the ticket lifetime without comparing different machines' clocks.
  const requestedAt = performance.now()
  const requestedAtWallClock = Date.now()
  const response = await fetch('/api/oauth/create-signin-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  // Keep issuance failures visible as recoverable browser errors.
  if (!response.ok) {
    // An expired browser session needs a new sign-in, not repeated ticket requests.
    if (response.status === 401) {
      throw new Error(
        'Your browser sign-in expired. Start sign-in again from CoreLive.',
        { cause: 401 },
      )
    }
    throw new Error(
      'Could not prepare your return to CoreLive. Please try again.',
    )
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    throw new Error(
      'Could not prepare your return to CoreLive. Please try again.',
    )
  }
  const token = 'token' in payload ? payload.token : undefined
  const expiresInSeconds =
    'expiresInSeconds' in payload ? payload.expiresInSeconds : undefined
  // Reject malformed tickets before attempting the custom protocol.
  if (
    typeof token !== 'string' ||
    token === '' ||
    typeof expiresInSeconds !== 'number' ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds <= 0 ||
    expiresInSeconds > 60
  ) {
    throw new Error('No token received from server')
  }
  const validUntil = requestedAt + expiresInSeconds * 1000
  // macOS browsers can pause the monotonic clock during sleep; either local clock may expire the ticket.
  const wallClockDeadline = requestedAtWallClock + expiresInSeconds * 1000
  // A very slow request can consume the ticket before it is safe to return to the app.
  if (
    validUntil <= performance.now() + 5000 ||
    wallClockDeadline <= Date.now() + 5000
  ) {
    throw new Error('The return ticket expired. Please try again.')
  }
  // Desktop sign-in requires a short-lived ticket bound to the pending native OAuth attempt.
  return {
    // eslint-disable-next-line browser-security/no-credentials-in-query-params -- State-bound Clerk ticket is consumed only by the app's custom protocol.
    url: `corelive://oauth/callback?state=${encodeURIComponent(state)}&token=${encodeURIComponent(token)}`,
    validUntil,
    wallClockDeadline,
  }
}

const OAuthCallbackContent = function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [returnRefreshed, setReturnRefreshed] = useState(false)
  const recoveryContent = useRef<HTMLDivElement>(null)
  const preparedReturn = useRef<Awaited<
    ReturnType<typeof requestDesktopReturn>
  > | null>(null)

  // Restore keyboard position after a retry replaces the loading state.
  useCycleEffect(() => {
    if (
      status === 'return-error' ||
      (status === 'success' && returnRefreshed)
    ) {
      recoveryContent.current
        ?.querySelector<HTMLButtonElement>('button')
        ?.focus()
    }
  }, [status, returnRefreshed])

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

        const desktopReturn = await requestDesktopReturn(state)

        if (!isMounted) return

        preparedReturn.current = desktopReturn
        setStatus('redirecting')

        // Redirect to Electron app via deep link
        // Small delay to show UI update
        redirectTimer = window.setTimeout(() => {
          window.location.assign(desktopReturn.url)
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
        setStatus(
          err instanceof Error && err.cause === 401 ? 'error' : 'return-error',
        )
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

  // External-protocol navigation must happen directly inside the click gesture.
  const reopenDesktopApp = () => {
    if (!state) return
    const desktopReturn = preparedReturn.current
    // A still-valid ticket avoids awaiting network work before native navigation.
    if (
      desktopReturn &&
      desktopReturn.validUntil > performance.now() + 5000 &&
      desktopReturn.wallClockDeadline > Date.now() + 5000
    ) {
      window.location.assign(desktopReturn.url)
      return
    }

    setStatus('creating-token')
    // An expired ticket needs another explicit click after its replacement is ready.
    void requestDesktopReturn(state)
      .then((freshReturn) => {
        preparedReturn.current = freshReturn
        setReturnRefreshed(true)
        setStatus('success')
      })
      .catch((retryError: unknown) => {
        setErrorMessage(
          retryError instanceof Error
            ? retryError.message
            : 'Failed to open CoreLive',
        )
        setStatus(
          retryError instanceof Error && retryError.cause === 401
            ? 'error'
            : 'return-error',
        )
      })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div
        ref={recoveryContent}
        aria-live="polite"
        className="w-full max-w-md rounded-lg border border-border bg-card p-8"
      >
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
            <p className="mb-4 text-center text-sm text-muted-foreground">
              {returnRefreshed
                ? 'A fresh secure return is ready. Select Open CoreLive.'
                : "If CoreLive didn't open, try the button below."}
            </p>
            <Button type="button" className="w-full" onClick={reopenDesktopApp}>
              Open CoreLive
            </Button>
          </>
        )}

        {(status === 'error' || status === 'return-error') && (
          <OAuthError
            title={
              status === 'return-error'
                ? 'Could not return to CoreLive'
                : 'Authentication Failed'
            }
            errorMessage={errorMessage}
            onRetry={status === 'return-error' ? reopenDesktopApp : undefined}
          />
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        CoreLive — Every small effort counts.
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

'use client'

import { useUser } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import { memo, useCallback, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useReducerState } from '@/hooks/useReducerState'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'

type OAuthState = {
  isLoading: boolean
  error: string | null
}

type OAuthAction =
  | { type: 'START_LOADING' }
  | { type: 'SUCCESS' }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }

/**
 * Reduces the native-OAuth start gesture's transient UI state (one provider:
 * Google). START_LOADING on click, SUCCESS/ERROR from the main-process events.
 * @param state - Current loading/error state.
 * @param action - Lifecycle event for the in-flight sign-in.
 * @returns The next state.
 * @example
 * oauthReducer({ isLoading: false, error: null }, { type: 'START_LOADING' })
 * // => { isLoading: true, error: null }
 */
function oauthReducer(state: OAuthState, action: OAuthAction): OAuthState {
  switch (action.type) {
    case 'START_LOADING':
      return { isLoading: true, error: null }
    case 'SUCCESS':
      return { isLoading: false, error: null }
    case 'ERROR':
      return { isLoading: false, error: action.error }
    case 'RESET':
      return { isLoading: false, error: null }
    default:
      return state
  }
}

/**
 * The signed-out Floating front door's sign-in CTA — a single amber "Sign in
 * with Google" button that launches the system-browser OAuth flow.
 *
 * Why Google-only: Google blocks OAuth inside a WebView, so Electron opens the
 * system browser, receives the `corelive://` deep-link callback, and completes
 * the sign-in in-process (Clerk re-renders the panel in place — no navigation).
 * The Electron login forms are already Google-only, so this matches that
 * convention and the approved single-CTA design. It is the ONLY consumer of
 * this module; the capability hook below decides whether to render it at all.
 *
 * @returns The amber sign-in button plus a calm trust/error line beneath it.
 * @example
 * <ElectronOAuthButtons />
 */
export const ElectronOAuthButtons = memo(function ElectronOAuthButtons() {
  const [state, dispatch] = useReducerState(oauthReducer, {
    isLoading: false,
    error: null,
  })
  const { user } = useUser()

  // Clear transient state the instant Clerk reports a signed-in user (the token
  // exchange completed) — the card is about to swap to the live navigator.
  const isLoading = user ? false : state.isLoading
  const error = user ? null : state.error

  useCycleEffect(() => {
    if (!isElectronEnvironment()) return

    // Main-process OAuth outcome events (success/error) drive the button back
    // out of its loading state.
    const unsubscribeSuccess = window.electronAPI?.oauth?.onSuccess?.(() => {
      dispatch({ type: 'SUCCESS' })
    })

    const unsubscribeError = window.electronAPI?.oauth?.onError?.((data) => {
      dispatch({ type: 'ERROR', error: data.error || 'Authentication failed' })
    })

    // The renderer-side provider re-dispatches token-exchange failures through
    // this custom event (D2's second error source).
    const handleCustomError = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      dispatch({
        type: 'ERROR',
        error: customEvent.detail || 'Authentication failed',
      })
    }
    window.addEventListener('electron-oauth-error', handleCustomError)

    return () => {
      unsubscribeSuccess?.()
      unsubscribeError?.()
      window.removeEventListener('electron-oauth-error', handleCustomError)
    }
  }, [])

  // Sync, stable click handler (the Button needs a stable useCallback ref) that
  // fires the async native-OAuth start as fire-and-forget.
  const handleGoogleClick = useCallback(() => {
    void (async () => {
      if (!window.electronAPI?.oauth) {
        dispatch({ type: 'ERROR', error: 'OAuth not available' })
        return
      }

      dispatch({ type: 'START_LOADING' })

      try {
        const result = await window.electronAPI.oauth.start('google')
        if (!result.success) {
          dispatch({
            type: 'ERROR',
            error: result.error || 'Failed to start authentication',
          })
        }
        // On success the system browser opens; the onSuccess/onError events (and
        // the in-place Clerk re-render) take over from here.
      } catch {
        dispatch({ type: 'ERROR', error: 'Failed to start authentication' })
      }
    })()
  }, [])

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        className="w-full gap-2"
        onClick={handleGoogleClick}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleMark />
        )}
        <span>{isLoading ? 'Opening browser…' : 'Sign in with Google'}</span>
      </Button>

      {error ? (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Opens securely in your browser.
        </p>
      )}
    </div>
  )
})

/**
 * Google "G" glyph as a single-color mark (inherits `currentColor`, so it reads
 * as paper-white on the amber button instead of clashing Google brand colors
 * against Warm Cathedral).
 * @returns A 16px monochrome Google logo SVG, hidden from the a11y tree.
 * @example
 * <GoogleMark />
 */
const GoogleMark = memo(function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
})

/**
 * Store for Electron OAuth availability detection.
 * Uses useSyncExternalStore for SSR-safe hydration.
 *
 * The subscribe function triggers a callback after mount to force React
 * to re-read the snapshot. This is necessary because:
 * 1. SSR returns false (no window.electronAPI on server)
 * 2. Client hydration needs to re-check after mount
 * 3. Without this, React won't re-read the snapshot after hydration
 */
function subscribeToElectronOAuth(callback: () => void): () => void {
  // Schedule a microtask to notify React after hydration completes
  // This forces React to re-read the snapshot on the client
  if (typeof window !== 'undefined') {
    queueMicrotask(callback)
  }
  return () => {}
}

function getElectronOAuthSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return isElectronEnvironment() && !!window.electronAPI?.oauth
}

function getServerSnapshot(): boolean {
  return false // SSR always returns false
}

/**
 * Hook to check if we should show Electron OAuth buttons.
 * Uses useSyncExternalStore for SSR-safe hydration.
 *
 * @returns true if running in Electron and OAuth API is available
 */
export function useShowElectronOAuth(): boolean {
  return useSyncExternalStore(
    subscribeToElectronOAuth,
    getElectronOAuthSnapshot,
    getServerSnapshot,
  )
}

'use client'

import { useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useReducer, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'

type OAuthState = {
  isLoading: string | null
  error: string | null
}

type OAuthAction =
  | { type: 'START_LOADING'; provider: string }
  | { type: 'SUCCESS' }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }

function oauthReducer(state: OAuthState, action: OAuthAction): OAuthState {
  switch (action.type) {
    case 'START_LOADING':
      return { isLoading: action.provider, error: null }
    case 'SUCCESS':
      return { isLoading: null, error: null }
    case 'ERROR':
      return { isLoading: null, error: action.error }
    case 'RESET':
      return { isLoading: null, error: null }
    default:
      return state
  }
}

/**
 * OAuth buttons for Electron environment.
 *
 * Google OAuth blocks WebView authentication, so in Electron we need to:
 * 1. Open system browser for OAuth
 * 2. Receive callback via deep link
 * 3. Complete authentication in Electron
 *
 * This component provides buttons that trigger the browser-based OAuth flow.
 */
export function ElectronOAuthButtons() {
  const [state, dispatch] = useReducer(oauthReducer, {
    isLoading: null,
    error: null,
  })
  const { user } = useUser()

  // When user becomes signed in (from Clerk), reset loading state
  // This handles successful sign-in via the token exchange
  const isLoading = user ? null : state.isLoading
  const error = user ? null : state.error

  useEffect(() => {
    if (!isElectronEnvironment()) return

    // Register OAuth event listeners
    const unsubscribeSuccess = window.electronAPI?.oauth?.onSuccess?.(() => {
      dispatch({ type: 'SUCCESS' })
    })

    const unsubscribeError = window.electronAPI?.oauth?.onError?.((data) => {
      dispatch({ type: 'ERROR', error: data.error || 'Authentication failed' })
    })

    // Listen for custom error event from ElectronAuthProvider
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

  const handleOAuthClick = useCallback(
    async (provider: 'google' | 'github' | 'apple') => {
      if (!window.electronAPI?.oauth) {
        dispatch({ type: 'ERROR', error: 'OAuth not available' })
        return
      }

      dispatch({ type: 'START_LOADING', provider })

      try {
        const result = await window.electronAPI.oauth.start(provider)
        if (!result.success) {
          dispatch({
            type: 'ERROR',
            error: result.error || 'Failed to start authentication',
          })
        }
        // If successful, browser will open and user will complete OAuth there
        // The success/error callbacks will handle the result
      } catch {
        dispatch({ type: 'ERROR', error: 'Failed to start authentication' })
      }
    },
    [],
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-gray-500">
        Sign in with your preferred provider
      </p>

      <Button
        variant="outline"
        className="flex w-full items-center justify-center gap-2"
        onClick={() => void handleOAuthClick('google')}
        disabled={isLoading !== null}
      >
        {isLoading === 'google' ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
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
        )}
        <span>
          {isLoading === 'google'
            ? 'Opening browser...'
            : 'Continue with Google'}
        </span>
      </Button>

      <Button
        variant="outline"
        className="flex w-full items-center justify-center gap-2"
        onClick={() => void handleOAuthClick('github')}
        disabled={isLoading !== null}
      >
        {isLoading === 'github' ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        )}
        <span>
          {isLoading === 'github'
            ? 'Opening browser...'
            : 'Continue with GitHub'}
        </span>
      </Button>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-gray-400">
        Authentication will open in your browser for security.
      </p>
    </div>
  )
}

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

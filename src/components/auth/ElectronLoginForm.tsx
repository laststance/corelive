'use client'

import { useSignIn, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useRef, useSyncExternalStore } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useReducerState } from '@/hooks/useReducerState'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'

import { ElectronCredentialsForm } from './ElectronCredentialsForm'
import {
  reduceElectronCredentials,
  type ElectronCredentialAction,
} from './electronCredentialState'
import { ElectronGoogleOAuth } from './ElectronGoogleOAuth'
type FormState = {
  email: string
  password: string
  isLoading: boolean
  isGoogleLoading: boolean
  error: string | null
  showPassword: boolean
}

type FormAction =
  | ElectronCredentialAction
  | { type: 'START_LOADING' }
  | { type: 'START_GOOGLE_LOADING' }
  | { type: 'STOP_GOOGLE_LOADING' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET_ERROR' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_EMAIL':
    case 'SET_PASSWORD':
    case 'TOGGLE_PASSWORD_VISIBILITY':
      return reduceElectronCredentials(state, action)
    case 'START_LOADING':
      return { ...state, isLoading: true, error: null }
    case 'START_GOOGLE_LOADING':
      return { ...state, isGoogleLoading: true, error: null }
    case 'STOP_GOOGLE_LOADING':
      return { ...state, isGoogleLoading: false }
    case 'SET_ERROR':
      return {
        ...state,
        isLoading: false,
        isGoogleLoading: false,
        error: action.error,
      }
    case 'RESET_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

/**
 * Email/Password login form for Electron environment.
 *
 * Unlike OAuth, email/password authentication works directly in Electron's
 * WebView without needing to open a system browser. This provides a smoother
 * user experience for desktop users.
 *
 * @returns Login form with email/password fields and optional Google OAuth fallback
 */
export const ElectronLoginForm = function ElectronLoginForm() {
  const { signIn, fetchStatus } = useSignIn()
  const { user } = useUser()
  const router = useRouter()
  const [state, dispatch] = useReducerState(formReducer, {
    email: '',
    password: '',
    isLoading: false,
    isGoogleLoading: false,
    error: null,
    showPassword: false,
  })
  const googleLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  // Listen for OAuth errors from ElectronAuthProvider to reset loading state
  useCycleEffect(() => {
    const handleOAuthError = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      dispatch({
        type: 'SET_ERROR',
        error: detail || 'Google sign-in failed',
      })
    }

    window.addEventListener('electron-oauth-error', handleOAuthError)
    return () => {
      window.removeEventListener('electron-oauth-error', handleOAuthError)
    }
  }, [])

  // Safety timeout: reset Google loading after 60s
  useCycleEffect(() => {
    if (state.isGoogleLoading) {
      googleLoadingTimeoutRef.current = setTimeout(() => {
        dispatch({
          type: 'SET_ERROR',
          error: 'Google sign-in timed out. Please try again.',
        })
      }, 60_000)
    } else if (googleLoadingTimeoutRef.current) {
      clearTimeout(googleLoadingTimeoutRef.current)
      googleLoadingTimeoutRef.current = null
    }

    return () => {
      if (googleLoadingTimeoutRef.current) {
        clearTimeout(googleLoadingTimeoutRef.current)
      }
    }
  }, [state.isGoogleLoading])

  // Reset Google loading if user becomes authenticated
  useCycleEffect(() => {
    if (user && state.isGoogleLoading) {
      dispatch({ type: 'STOP_GOOGLE_LOADING' })
    }
  }, [user, state.isGoogleLoading])

  // Reset loading if user becomes authenticated
  const isLoading = user ? false : state.isLoading
  const isGoogleLoading = user ? false : state.isGoogleLoading
  const error = user ? null : state.error

  /**
   * Handle email/password form submission.
   * Uses Clerk v7 signIn.password() with emailAddress + password in a single call.
   * @example
   * // User submits form → signIn.password() → finalize() → redirect to /home
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!signIn) {
      dispatch({ type: 'SET_ERROR', error: 'Authentication not ready' })
      return
    }

    dispatch({ type: 'START_LOADING' })

    try {
      // Clerk v7: single-step sign-in with email + password
      const { error: passwordError } = await signIn.password({
        emailAddress: state.email,
        password: state.password,
      })

      if (passwordError) {
        dispatch({
          type: 'SET_ERROR',
          error: passwordError.message ?? 'Invalid email or password',
        })
        return
      }

      if (signIn.status === 'complete') {
        // Clerk v7 requires a navigate callback for session activation
        const { error: finalizeError } = await signIn.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              // Handle pending session tasks (e.g., mandatory password change)
              return
            }
            const url = decorateUrl('/home')
            if (url.startsWith('http')) {
              window.location.href = url
            } else {
              router.push(url)
            }
          },
        })
        if (finalizeError) {
          dispatch({
            type: 'SET_ERROR',
            error: finalizeError.message ?? 'Failed to complete sign-in',
          })
          return
        }
      } else if (signIn.status === 'needs_second_factor') {
        dispatch({
          type: 'SET_ERROR',
          error:
            'Multi-factor authentication is required. Please use browser sign-in.',
        })
      } else if (signIn.status === 'needs_client_trust') {
        dispatch({
          type: 'SET_ERROR',
          error: 'Device verification is required. Please use browser sign-in.',
        })
      } else {
        dispatch({
          type: 'SET_ERROR',
          error: 'Sign-in incomplete. Please try again.',
        })
      }
    } catch (err) {
      const clerkError = err as {
        errors?: Array<{ message?: string; longMessage?: string }>
      }
      const errorMessage =
        clerkError?.errors?.[0]?.longMessage ||
        clerkError?.errors?.[0]?.message ||
        'Invalid email or password'
      dispatch({ type: 'SET_ERROR', error: errorMessage })
    }
  }

  /**
   * Handle Google OAuth click.
   * Opens system browser for OAuth flow (required by Google).
   */
  const handleGoogleClick = async () => {
    if (!window.electronAPI?.oauth) {
      dispatch({ type: 'SET_ERROR', error: 'OAuth not available' })
      return
    }

    dispatch({ type: 'START_GOOGLE_LOADING' })

    try {
      const result = await window.electronAPI.oauth.start('google')
      if (!result.success) {
        dispatch({
          type: 'SET_ERROR',
          error: result.error || 'Failed to start Google sign-in',
        })
      }
      // If successful, browser opens and callback handles the rest
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Failed to start Google sign-in' })
    }
  }

  const isFormDisabled =
    isLoading || isGoogleLoading || fetchStatus === 'fetching'

  return (
    <div className="flex flex-col gap-6">
      {/* Email/Password Form */}
      <ElectronCredentialsForm
        state={state}
        dispatch={dispatch}
        disabled={isFormDisabled}
        isLoading={isLoading}
        error={error}
        onSubmit={(event) => void handleSubmit(event)}
        flow="sign-in"
      />

      <ElectronGoogleOAuth
        flow="sign-in"
        isGoogleLoading={isGoogleLoading}
        disabled={isFormDisabled}
        onClick={() => void handleGoogleClick()}
      />
    </div>
  )
}

/**
 * Store for Electron environment detection.
 * Uses useSyncExternalStore for SSR-safe hydration.
 */
function subscribeToElectron(callback: () => void): () => void {
  if (typeof window !== 'undefined') {
    queueMicrotask(callback)
  }
  return () => {}
}

function getElectronSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return isElectronEnvironment()
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * Hook to check if running in Electron environment.
 * Uses useSyncExternalStore for SSR-safe hydration.
 *
 * @returns true if running in Electron
 */
export function useIsElectron(): boolean {
  return useSyncExternalStore(
    subscribeToElectron,
    getElectronSnapshot,
    getServerSnapshot,
  )
}

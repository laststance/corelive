'use client'

import { useSignIn, useUser } from '@clerk/nextjs'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useReducer, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isElectronEnvironment } from '@/lib/orpc/electron-client'

type FormState = {
  email: string
  password: string
  isLoading: boolean
  error: string | null
  showPassword: boolean
}

type FormAction =
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'START_LOADING' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET_ERROR' }
  | { type: 'TOGGLE_PASSWORD_VISIBILITY' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_EMAIL':
      return { ...state, email: action.email, error: null }
    case 'SET_PASSWORD':
      return { ...state, password: action.password, error: null }
    case 'START_LOADING':
      return { ...state, isLoading: true, error: null }
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.error }
    case 'RESET_ERROR':
      return { ...state, error: null }
    case 'TOGGLE_PASSWORD_VISIBILITY':
      return { ...state, showPassword: !state.showPassword }
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
export function ElectronLoginForm() {
  const { isLoaded, signIn, setActive } = useSignIn()
  const { user } = useUser()
  const router = useRouter()
  const [state, dispatch] = useReducer(formReducer, {
    email: '',
    password: '',
    isLoading: false,
    error: null,
    showPassword: false,
  })
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Reset loading if user becomes authenticated
  const isLoading = user ? false : state.isLoading
  const error = user ? null : state.error

  /**
   * Handle email/password form submission.
   * Uses Clerk's signIn.create with identifier/password strategy.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!isLoaded || !signIn || !setActive) {
        dispatch({ type: 'SET_ERROR', error: 'Authentication not ready' })
        return
      }

      dispatch({ type: 'START_LOADING' })

      try {
        const result = await signIn.create({
          identifier: state.email,
          password: state.password,
        })

        if (result.status === 'complete' && result.createdSessionId) {
          await setActive({ session: result.createdSessionId })
          router.push('/home')
        } else if (result.status === 'needs_second_factor') {
          // MFA is required - for now, show error with guidance
          dispatch({
            type: 'SET_ERROR',
            error:
              'Multi-factor authentication is required. Please use browser sign-in.',
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
    },
    [isLoaded, signIn, setActive, state.email, state.password, router],
  )

  /**
   * Handle Google OAuth click.
   * Opens system browser for OAuth flow (required by Google).
   */
  const handleGoogleClick = useCallback(async () => {
    if (!window.electronAPI?.oauth) {
      dispatch({ type: 'SET_ERROR', error: 'OAuth not available' })
      return
    }

    setIsGoogleLoading(true)

    try {
      const result = await window.electronAPI.oauth.start('google')
      if (!result.success) {
        dispatch({
          type: 'SET_ERROR',
          error: result.error || 'Failed to start Google sign-in',
        })
        setIsGoogleLoading(false)
      }
      // If successful, browser opens and callback handles the rest
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Failed to start Google sign-in' })
      setIsGoogleLoading(false)
    }
  }, [])

  const isFormDisabled = isLoading || isGoogleLoading
  const canSubmit =
    state.email.trim() && state.password.trim() && !isFormDisabled

  return (
    <div className="flex flex-col gap-6">
      {/* Email/Password Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-gray-700">
            Email
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={state.email}
              onChange={(e) =>
                dispatch({ type: 'SET_EMAIL', email: e.target.value })
              }
              disabled={isFormDisabled}
              className="pl-10"
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-gray-700">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={state.showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={state.password}
              onChange={(e) =>
                dispatch({ type: 'SET_PASSWORD', password: e.target.value })
              }
              disabled={isFormDisabled}
              className="pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => dispatch({ type: 'TOGGLE_PASSWORD_VISIBILITY' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              tabIndex={-1}
              aria-label={
                state.showPassword ? 'Hide password' : 'Show password'
              }
            >
              {state.showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" disabled={!canSubmit} className="mt-2 w-full">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-400">or continue with</span>
        </div>
      </div>

      {/* Google OAuth */}
      <Button
        variant="outline"
        className="flex w-full items-center justify-center gap-2"
        onClick={() => void handleGoogleClick()}
        disabled={isFormDisabled}
      >
        {isGoogleLoading ? (
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
          {isGoogleLoading ? 'Opening browser...' : 'Continue with Google'}
        </span>
      </Button>

      <p className="text-center text-xs text-gray-400">
        Google sign-in opens in your browser for security.
      </p>
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

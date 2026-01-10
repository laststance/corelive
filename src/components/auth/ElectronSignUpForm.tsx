'use client'

import { useSignUp, useUser } from '@clerk/nextjs'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useReducer, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = {
  email: string
  password: string
  isLoading: boolean
  error: string | null
  showPassword: boolean
  pendingVerification: boolean
  code: string
}

type FormAction =
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'SET_CODE'; code: string }
  | { type: 'START_LOADING' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET_ERROR' }
  | { type: 'TOGGLE_PASSWORD_VISIBILITY' }
  | { type: 'SET_PENDING_VERIFICATION' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_EMAIL':
      return { ...state, email: action.email, error: null }
    case 'SET_PASSWORD':
      return { ...state, password: action.password, error: null }
    case 'SET_CODE':
      return { ...state, code: action.code, error: null }
    case 'START_LOADING':
      return { ...state, isLoading: true, error: null }
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.error }
    case 'RESET_ERROR':
      return { ...state, error: null }
    case 'TOGGLE_PASSWORD_VISIBILITY':
      return { ...state, showPassword: !state.showPassword }
    case 'SET_PENDING_VERIFICATION':
      return { ...state, isLoading: false, pendingVerification: true }
    default:
      return state
  }
}

/**
 * Email/Password sign-up form for Electron environment.
 *
 * Handles the complete sign-up flow:
 * 1. Collect email and password
 * 2. Send verification code
 * 3. Verify email and complete registration
 *
 * @returns Sign-up form with email/password fields and optional Google OAuth fallback
 */
export function ElectronSignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp()
  const { user } = useUser()
  const router = useRouter()
  const [state, dispatch] = useReducer(formReducer, {
    email: '',
    password: '',
    code: '',
    isLoading: false,
    error: null,
    showPassword: false,
    pendingVerification: false,
  })
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Reset loading if user becomes authenticated
  const isLoading = user ? false : state.isLoading
  const error = user ? null : state.error

  /**
   * Handle sign-up form submission.
   * Creates account and sends email verification.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!isLoaded || !signUp) {
        dispatch({ type: 'SET_ERROR', error: 'Sign-up not ready' })
        return
      }

      dispatch({ type: 'START_LOADING' })

      try {
        await signUp.create({
          emailAddress: state.email,
          password: state.password,
        })

        // Send email verification code
        await signUp.prepareEmailAddressVerification({
          strategy: 'email_code',
        })

        dispatch({ type: 'SET_PENDING_VERIFICATION' })
      } catch (err) {
        const clerkError = err as {
          errors?: Array<{ message?: string; longMessage?: string }>
        }
        const errorMessage =
          clerkError?.errors?.[0]?.longMessage ||
          clerkError?.errors?.[0]?.message ||
          'Failed to create account'
        dispatch({ type: 'SET_ERROR', error: errorMessage })
      }
    },
    [isLoaded, signUp, state.email, state.password],
  )

  /**
   * Handle email verification code submission.
   */
  const handleVerification = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!isLoaded || !signUp || !setActive) {
        dispatch({ type: 'SET_ERROR', error: 'Verification not ready' })
        return
      }

      dispatch({ type: 'START_LOADING' })

      try {
        const result = await signUp.attemptEmailAddressVerification({
          code: state.code,
        })

        if (result.status === 'complete' && result.createdSessionId) {
          await setActive({ session: result.createdSessionId })
          router.push('/home')
        } else {
          dispatch({
            type: 'SET_ERROR',
            error: 'Verification incomplete. Please try again.',
          })
        }
      } catch (err) {
        const clerkError = err as {
          errors?: Array<{ message?: string; longMessage?: string }>
        }
        const errorMessage =
          clerkError?.errors?.[0]?.longMessage ||
          clerkError?.errors?.[0]?.message ||
          'Invalid verification code'
        dispatch({ type: 'SET_ERROR', error: errorMessage })
      }
    },
    [isLoaded, signUp, setActive, state.code, router],
  )

  /**
   * Handle Google OAuth click.
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
          error: result.error || 'Failed to start Google sign-up',
        })
        setIsGoogleLoading(false)
      }
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Failed to start Google sign-up' })
      setIsGoogleLoading(false)
    }
  }, [])

  const isFormDisabled = isLoading || isGoogleLoading

  // Verification code form
  if (state.pendingVerification) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <p className="text-sm text-gray-600">
            We&apos;ve sent a verification code to
          </p>
          <p className="font-medium text-gray-900">{state.email}</p>
        </div>

        <form
          onSubmit={(e) => void handleVerification(e)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="code" className="text-gray-700">
              Verification Code
            </Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={state.code}
              onChange={(e) =>
                dispatch({ type: 'SET_CODE', code: e.target.value })
              }
              disabled={isLoading}
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={!state.code.trim() || isLoading}
            className="mt-2 w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              'Verify Email'
            )}
          </Button>
        </form>
      </div>
    )
  }

  // Sign-up form
  const canSubmit =
    state.email.trim() && state.password.trim() && !isFormDisabled

  return (
    <div className="flex flex-col gap-6">
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
              placeholder="Create a password"
              value={state.password}
              onChange={(e) =>
                dispatch({ type: 'SET_PASSWORD', password: e.target.value })
              }
              disabled={isFormDisabled}
              className="pr-10"
              autoComplete="new-password"
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

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" disabled={!canSubmit} className="mt-2 w-full">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            'Create account'
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
        Google sign-up opens in your browser for security.
      </p>
    </div>
  )
}

'use client'

import { useSignUp, useUser } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useReducerState } from '@/hooks/useReducerState'

import { ElectronCredentialsForm } from './ElectronCredentialsForm'
import {
  reduceElectronCredentials,
  type ElectronCredentialAction,
} from './electronCredentialState'
import { ElectronGoogleOAuth } from './ElectronGoogleOAuth'
import { getClerkFormError } from './getClerkFormError'
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
  | ElectronCredentialAction
  | { type: 'SET_CODE'; code: string }
  | { type: 'START_LOADING' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET_ERROR' }
  | { type: 'SET_PENDING_VERIFICATION' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_EMAIL':
    case 'SET_PASSWORD':
    case 'TOGGLE_PASSWORD_VISIBILITY':
      return reduceElectronCredentials(state, action)
    case 'SET_CODE':
      return { ...state, code: action.code, error: null }
    case 'START_LOADING':
      return { ...state, isLoading: true, error: null }
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.error }
    case 'RESET_ERROR':
      return { ...state, error: null }
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
export const ElectronSignUpForm = function ElectronSignUpForm() {
  const { signUp, fetchStatus } = useSignUp()
  const { user } = useUser()
  const router = useRouter()
  const [state, dispatch] = useReducerState(formReducer, {
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
   * Creates account with email, sets password, and sends email verification.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!signUp) {
      dispatch({ type: 'SET_ERROR', error: 'Sign-up not ready' })
      return
    }

    dispatch({ type: 'START_LOADING' })

    try {
      // Create sign-up with email
      const { error: createError } = await signUp.create({
        emailAddress: state.email,
      })

      if (createError) {
        dispatch({
          type: 'SET_ERROR',
          error: createError.message ?? 'Failed to create account',
        })
        return
      }

      // Set password
      const { error: passwordError } = await signUp.password({
        password: state.password,
      })

      if (passwordError) {
        dispatch({
          type: 'SET_ERROR',
          error: passwordError.message ?? 'Failed to set password',
        })
        return
      }

      // Send email verification code
      const { error: sendCodeError } =
        await signUp.verifications.sendEmailCode()

      if (sendCodeError) {
        dispatch({
          type: 'SET_ERROR',
          error: sendCodeError.message ?? 'Failed to send verification code',
        })
        return
      }

      dispatch({ type: 'SET_PENDING_VERIFICATION' })
    } catch (err) {
      const errorMessage = getClerkFormError(err, 'Failed to create account')
      dispatch({ type: 'SET_ERROR', error: errorMessage })
    }
  }

  /**
   * Handle email verification code submission.
   */
  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!signUp) {
      dispatch({ type: 'SET_ERROR', error: 'Verification not ready' })
      return
    }

    dispatch({ type: 'START_LOADING' })

    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode(
        {
          code: state.code,
        },
      )

      if (verifyError) {
        dispatch({
          type: 'SET_ERROR',
          error: verifyError.message ?? 'Invalid verification code',
        })
        return
      }

      if (signUp.status === 'complete') {
        const { error: finalizeError } = await signUp.finalize()
        if (finalizeError) {
          dispatch({
            type: 'SET_ERROR',
            error: finalizeError.message ?? 'Failed to complete registration',
          })
          return
        }
        router.push('/home')
      } else {
        dispatch({
          type: 'SET_ERROR',
          error: 'Verification incomplete. Please try again.',
        })
      }
    } catch (err) {
      const errorMessage = getClerkFormError(err, 'Invalid verification code')
      dispatch({ type: 'SET_ERROR', error: errorMessage })
    }
  }

  /**
   * Handle Google OAuth click.
   */
  const handleGoogleClick = async () => {
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
  }

  const isFormDisabled =
    isLoading || isGoogleLoading || fetchStatus === 'fetching'

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_CODE', code: event.target.value })
  }

  // Verification code form
  if (state.pendingVerification) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent a verification code to
          </p>
          <p className="font-medium text-foreground">{state.email}</p>
        </div>

        <form
          onSubmit={(e) => void handleVerification(e)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="code" className="text-foreground">
              Verification Code
            </Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={state.code}
              onChange={handleCodeChange}
              disabled={isLoading}
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-destructive/10 rounded-md px-3 py-2 text-sm text-destructive">
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
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
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

  return (
    <div className="flex flex-col gap-6">
      <ElectronCredentialsForm
        state={state}
        dispatch={dispatch}
        disabled={isFormDisabled}
        isLoading={isLoading}
        error={error}
        onSubmit={(event) => void handleSubmit(event)}
        flow="sign-up"
      />

      <ElectronGoogleOAuth
        flow="sign-up"
        isGoogleLoading={isGoogleLoading}
        disabled={isFormDisabled}
        onClick={() => void handleGoogleClick()}
      />
    </div>
  )
}

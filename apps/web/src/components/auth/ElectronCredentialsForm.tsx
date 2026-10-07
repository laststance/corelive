import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type {
  ElectronCredentialAction,
  ElectronCredentialState,
} from './electronCredentialState'

interface ElectronCredentialsFormProps {
  state: ElectronCredentialState
  dispatch: React.Dispatch<ElectronCredentialAction>
  disabled: boolean
  isLoading: boolean
  error: string | null
  flow: 'sign-in' | 'sign-up'
  onSubmit: React.FormEventHandler<HTMLFormElement>
}

/** Renders the shared credential fields for Electron sign-in and sign-up without owning authentication state.
 * @param props - Controlled fields, submission state, and flow-specific labels.
 * @returns The email/password form with visibility and loading controls.
 * @example <ElectronCredentialsForm {...props} />
 */
export function ElectronCredentialsForm({
  state,
  dispatch,
  disabled,
  isLoading,
  error,
  flow,
  onSubmit,
}: ElectronCredentialsFormProps) {
  const { email, password, showPassword } = state
  const isSignUp = flow === 'sign-up'
  const passwordPlaceholder = isSignUp
    ? 'Create a password'
    : 'Enter your password'
  const passwordAutoComplete = isSignUp ? 'new-password' : 'current-password'
  const submitLabel = isSignUp ? 'Create account' : 'Sign in'
  const loadingLabel = isSignUp ? 'Creating account...' : 'Signing in...'
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-foreground">
          Email
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) =>
              dispatch({ type: 'SET_EMAIL', email: event.target.value })
            }
            disabled={disabled}
            className="pl-10"
            autoComplete="email"
            autoFocus
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-foreground">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder={passwordPlaceholder}
            value={password}
            onChange={(event) =>
              dispatch({ type: 'SET_PASSWORD', password: event.target.value })
            }
            disabled={disabled}
            className="pr-10"
            autoComplete={passwordAutoComplete}
          />

          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_PASSWORD_VISIBILITY' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-destructive/10 rounded-md px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={!email.trim() || !password.trim() || disabled}
        className="mt-2 w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
            <span>{loadingLabel}</span>
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  )
}

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { afterEach, expect, test } from 'vitest'

import { ElectronCredentialsForm } from './ElectronCredentialsForm'
import { reduceElectronCredentials } from './electronCredentialState'

afterEach(cleanup)

/** Drives the shared fields with their real reducer without creating an account or calling an auth SDK.
 * @param props - Auth flow whose labels and autocomplete behavior are under test.
 * @returns A local-only interactive credential form.
 * @example <CredentialsHarness flow="sign-in" />
 */
function CredentialsHarness({ flow }: { flow: 'sign-in' | 'sign-up' }) {
  const [state, dispatch] = useReducer(reduceElectronCredentials, {
    email: '',
    password: '',
    showPassword: false,
    error: null,
  })
  return (
    <ElectronCredentialsForm
      state={state}
      dispatch={dispatch}
      flow={flow}
      disabled={false}
      isLoading={false}
      error={null}
      onSubmit={(event) => event.preventDefault()}
    />
  )
}

test('Electron sign-in enables submission only after both credential fields are filled and can reveal the password', async () => {
  // Arrange
  const user = userEvent.setup()
  render(<CredentialsHarness flow="sign-in" />)
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()

  // Act
  await user.type(
    screen.getByLabelText('Email', { exact: true }),
    'reader@example.com',
  )
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'Example-passphrase',
  )
  await user.click(screen.getByRole('button', { name: 'Show password' }))

  // Assert
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  )
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue(
    'Example-passphrase',
  )
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'current-password',
  )
})

test('Electron sign-up retains account-creation copy and new-password autocomplete', () => {
  // Arrange + Act
  render(<CredentialsHarness flow="sign-up" />)

  // Assert
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  expect(screen.getByPlaceholderText('Create a password')).toHaveAttribute(
    'autocomplete',
    'new-password',
  )
  expect(screen.getByPlaceholderText('Create a password')).toHaveAttribute(
    'type',
    'password',
  )
})

test('Electron password visibility is reachable and reversible from the keyboard', async () => {
  // Arrange
  const user = userEvent.setup()
  render(<CredentialsHarness flow="sign-in" />)
  const passwordField = screen.getByLabelText('Password', { exact: true })
  passwordField.focus()

  // Act
  await user.tab()

  // Assert
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()
  await user.keyboard(' ')
  expect(passwordField).toHaveAttribute('type', 'text')
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveFocus()
  await user.keyboard(' ')
  expect(passwordField).toHaveAttribute('type', 'password')
})

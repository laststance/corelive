export interface ElectronCredentialState {
  email: string
  password: string
  showPassword: boolean
  error: string | null
}

export type ElectronCredentialAction =
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'TOGGLE_PASSWORD_VISIBILITY' }

/** Updates shared input fields for both Electron auth reducers while preserving each flow's extra state.
 * @param state - Current credentials plus flow-specific loading or verification state.
 * @param action - An edit or visibility toggle emitted by the shared form.
 * @returns Updated credentials without changing authentication progress.
 * @example reduceElectronCredentials(state, { type: 'SET_EMAIL', email: 'reader@example.com' })
 */
export function reduceElectronCredentials<T extends ElectronCredentialState>(
  state: T,
  action: ElectronCredentialAction,
): T {
  switch (action.type) {
    case 'SET_EMAIL':
      return { ...state, email: action.email, error: null }
    case 'SET_PASSWORD':
      return { ...state, password: action.password, error: null }
    case 'TOGGLE_PASSWORD_VISIBILITY':
      return { ...state, showPassword: !state.showPassword }
  }
}

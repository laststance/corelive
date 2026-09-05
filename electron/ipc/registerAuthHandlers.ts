/**
 * @fileoverview Auth IPC handlers — the only bridge between a panel's Clerk
 * session and the native login → LiveEditor handoff.
 *
 * @module electron/ipc/registerAuthHandlers
 */

import { log } from '../logger'
import type { AuthUserPayload } from '../types/ipc'
import type { WindowManager } from '../WindowManager'

import { typedHandle } from './typedHandle'

/**
 * Main-process seams the auth handlers need; accessors, so main.ts keeps
 * owning `activeUser` and the lazily built {@link WindowManager}.
 */
export interface AuthHandlerDeps {
  getActiveUser: () => AuthUserPayload | null
  setActiveUser: (user: AuthUserPayload) => Promise<AuthUserPayload>
  clearActiveUser: () => void
  getWindowManager: () => WindowManager | null
}

/**
 * Registers the five `auth-*` IPC channels; `auth-set-user` also runs {@link WindowManager.completeLogin} for its sender.
 * Called once from `setupIPCHandlers` in main.ts.
 * @param deps - Accessors for the active user and the (possibly not yet built) WindowManager.
 * @example
 * registerAuthHandlers({ getActiveUser: () => activeUser, setActiveUser, clearActiveUser, getWindowManager: () => windowManager })
 */
export function registerAuthHandlers(deps: AuthHandlerDeps): void {
  typedHandle('auth-get-user', () => deps.getActiveUser())

  typedHandle('auth-set-user', async (event, user) => {
    try {
      const storedUser = await deps.setActiveUser(user)
      // WindowManager ignores every sender but the login window's own
      // webContents, so this is safe to call for any panel that signs in.
      deps.getWindowManager()?.completeLogin(event.sender)
      return storedUser
    } catch (error) {
      log.error('Failed to set active user:', error)
      throw error
    }
  })

  typedHandle('auth-logout', () => {
    deps.clearActiveUser()
    // Drop a pending login → LiveEditor handoff so the next sign-in hands off again.
    deps.getWindowManager()?.clearLoginHandoff()
    return true
  })

  typedHandle('auth-is-authenticated', () => Boolean(deps.getActiveUser()))

  // Web-originated sync never hands off: its sender is not the login window.
  typedHandle('auth-sync-from-web', async (_event, authData) => {
    try {
      await deps.setActiveUser(authData)
      return true
    } catch (error) {
      log.error('Failed to sync auth from web:', error)
      return false
    }
  })
}

/**
 * @fileoverview Auth IPC handlers — the only bridge between a panel's Clerk
 * session and the native login → LiveEditor handoff.
 *
 * @module electron/ipc/registerAuthHandlers
 */

import type { AuthUserPayload } from '@corelive/desktop-contract/ipc'
import type { IpcMainInvokeEvent } from 'electron'

import { log } from '../logger'
import type { WindowManager } from '../WindowManager'

import { typedHandle } from './typedHandle'

/**
 * Main-process seams the auth handlers need; accessors, so main.ts keeps
 * owning `activeUser` and the lazily built {@link WindowManager}.
 */
export interface AuthHandlerDeps {
  getActiveUser: () => AuthUserPayload | null
  setActiveUser: (
    user: AuthUserPayload,
    event: IpcMainInvokeEvent,
  ) => Promise<AuthUserPayload>
  clearActiveUser: () => Promise<boolean>
  sessionUnavailable: () => void
  authorize: (event: IpcMainInvokeEvent) => boolean
  getWindowManager: () => WindowManager | null
}

/**
 * Registers the five `auth-*` IPC channels; `auth-set-user` also runs {@link WindowManager.completeLogin} for its sender.
 * Called once from {@link setupIPCHandlers} in main.ts.
 * @param deps - Accessors for the active user and the (possibly not yet built) WindowManager.
 * @returns Nothing; the five channels are registered on `ipcMain` as a side effect.
 * @example
 * registerAuthHandlers({ getActiveUser: () => activeUser, setActiveUser, clearActiveUser, getWindowManager: () => windowManager })
 */
export function registerAuthHandlers(deps: AuthHandlerDeps): void {
  const authorize = (event: IpcMainInvokeEvent): void => {
    if (!deps.authorize(event))
      throw new Error('Unauthorized authentication sender')
  }
  typedHandle('auth-get-user', (event) => {
    authorize(event)
    return deps.getActiveUser()
  })

  typedHandle('auth-set-user', async (event, user) => {
    authorize(event)
    try {
      const storedUser = await deps.setActiveUser(user, event)
      // WindowManager ignores every sender but the login window's own
      // webContents, so this is safe to call for any panel that signs in.
      deps.getWindowManager()?.completeLogin(event.sender)
      return storedUser
    } catch (error) {
      log.error('Failed to set active user:', error)
      throw error
    }
  })

  typedHandle('auth-logout', async (event) => {
    authorize(event)
    if (!(await deps.clearActiveUser())) return false
    // Drop a pending login → LiveEditor handoff so the next sign-in hands off again.
    deps.getWindowManager()?.clearLoginHandoff()
    return true
  })

  typedHandle('auth-session-unavailable', (event) => {
    authorize(event)
    deps.sessionUnavailable()
  })

  typedHandle('auth-is-authenticated', (event) => {
    authorize(event)
    return Boolean(deps.getActiveUser())
  })

  // Web-originated sync never hands off: its sender is not the login window.
  typedHandle('auth-sync-from-web', async (event, authData) => {
    authorize(event)
    try {
      await deps.setActiveUser(authData, event)
      return true
    } catch (error) {
      log.error('Failed to sync auth from web:', error)
      return false
    }
  })
}

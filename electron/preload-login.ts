/**
 * @fileoverview Preload script for the login window.
 *
 * The login window loads `https://corelive.app/login-shell` and exists only to
 * sign the user in: it exposes the auth + OAuth slice of `electronAPI` so the
 * renderer's `ElectronAuthProvider` can start a native OAuth flow and receive
 * its sign-in ticket. Window chrome is native (title-bar traffic lights) and
 * data goes through oRPC, so nothing else is bridged.
 *
 * @module electron/preload-login
 */

import { contextBridge } from 'electron'

import {
  createAuthBridge,
  createOAuthBridge,
} from './preload-shared/auth-oauth-bridge'

/**
 * Expose the auth + OAuth slice of `electronAPI` so the signed-out login window
 * is a self-contained native-OAuth front door.
 *
 * `ElectronAuthProvider` (root layout, runs in every panel) gates on
 * `window.electronAPI` via `isElectronEnvironment()`, so exposing it HERE is
 * what activates the provider in this window — and the full `oauth` surface lets
 * the window both START a browser flow and RECEIVE its sign-in ticket. The
 * provider's `auth-set-user` is what triggers the main-process handoff that
 * closes this window and shows LiveEditor.
 *
 * Deliberately SCOPED to { auth, oauth }: omitting `settings`/`menu`/etc. keeps
 * `ElectronStartupSync`'s method guards a clean no-op here (it only touches
 * `electronAPI.settings`), so activating the provider has zero native side
 * effects in the login window.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  auth: createAuthBridge(),
  oauth: createOAuthBridge(),
})

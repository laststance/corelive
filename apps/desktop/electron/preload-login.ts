/**
 * @fileoverview Preload script for the login window.
 *
 * The login window loads `https://corelive.app/login-shell` and exists only to
 * sign the user in: it exposes the auth + OAuth slice of `electronAPI` so the
 * renderer's {@link ElectronAuthProvider} can start a native OAuth flow and receive
 * its sign-in ticket. Window chrome is native (title-bar traffic lights) and
 * data goes through oRPC. The signed-in failure screen can retry opening LiveEditor.
 *
 * @module electron/preload-login
 */

import { typedInvoke } from './ipc/typedInvoke'
import {
  createAuthBridge,
  createOAuthBridge,
} from './preload-shared/auth-oauth-bridge'
import { exposeTrustedBridge } from './preload-shared/expose-trusted-bridge'

/**
 * Expose the auth + OAuth slice of `electronAPI` so the signed-out login window
 * is a self-contained native-OAuth front door.
 *
 * {@link ElectronAuthProvider} (root layout, runs in every panel) gates on
 * `window.electronAPI` via {@link isElectronEnvironment}, so exposing it HERE is
 * what activates the provider in this window — and the full `oauth` surface lets
 * the window both START a browser flow and RECEIVE its sign-in ticket. The
 * provider's `auth-set-user` is what triggers the main-process handoff that
 * closes this window and shows LiveEditor.
 *
 * Deliberately scoped to auth, oauth and additive LiveEditor reveal: omitting `settings`/`menu`/etc. keeps
 * {@link ElectronStartupSync}'s method guards a clean no-op here (it only touches
 * `electronAPI.settings`), so activating the provider has zero native side
 * effects in the login window.
 */
exposeTrustedBridge('electronAPI', {
  auth: createAuthBridge(),
  oauth: createOAuthBridge(),
  liveEditor: {
    /** Opens the protected panel when {@link LoginShell} retries a failed post-login handoff.
     * The main-process auth gate retains its latch until the panel loads successfully.
     * @throws Propagates IPC failures so the recovery screen can offer another attempt.
     * @example await window.electronAPI?.liveEditor.show()
     */
    show: async () => typedInvoke('live-editor-window-show'),
  },
})

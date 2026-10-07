import type { App } from 'electron'

import { log } from '../logger'

/** The two-method slice of Electron's `app` a handler claim needs — narrow so tests pass a plain fake. */
export type ProtocolClientApp = Pick<
  App,
  'isDefaultProtocolClient' | 'setAsDefaultProtocolClient'
>

/**
 * Makes THIS bundle the OS default handler for `protocol://` unless it already is — called at
 * boot ({@link DeepLinkManager.registerProtocol}) and again right before an OAuth round-trip
 * ({@link OAuthManager.startOAuthFlow}), because a dev Electron re-claims the same scheme under
 * `com.corelive.app.dev` every run and the installed app would otherwise win it back only on restart.
 * @param app - Electron `app` (or its two-method slice), injected for testability.
 * @param protocol - Bare scheme without `://`, e.g. `corelive`.
 * @returns
 * - `true` when this bundle is the default handler after the call (already was, or the claim succeeded)
 * - `false` when the OS refused the claim (warned; callers continue best-effort)
 * @example
 * claimDefaultProtocolClient(app, 'corelive') // => true — LaunchServices now routes corelive:// here
 */
export function claimDefaultProtocolClient(
  app: ProtocolClientApp,
  protocol: string,
): boolean {
  if (app.isDefaultProtocolClient(protocol)) {
    return true
  }
  const didClaim = app.setAsDefaultProtocolClient(protocol)
  // A refused claim is not fatal (the link may still resolve here), but it must
  // be visible in the log when a callback lands in the wrong app.
  if (!didClaim) {
    log.warn(
      `Failed to claim ${protocol}:// as this app's default handler; deep links may open another bundle`,
    )
  }
  return didClaim
}

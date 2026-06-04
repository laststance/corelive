/**
 * @fileoverview Debug-mode resolution for the packaged Electron app (Issue #61).
 *
 * Exists so a notarized production build is debuggable on demand without ever
 * being debuggable by default. A default packaged build ships with DevTools off
 * on every window and no remote-debugging port (secure-by-default); launching
 * with `CORELIVE_DEBUG=1` turns DevTools on for all windows AND opens a Chrome
 * DevTools Protocol port. Called by WindowManager (per-window
 * `webPreferences.devTools`) and main.ts (the `remote-debugging-port` switch).
 *
 * Two capabilities, deliberately split so the sensitive one needs an extra step:
 * - DevTools availability — local dev (NODE_ENV=development), the persisted
 *   `advanced.enableDevTools` config, OR the `CORELIVE_DEBUG` launch opt-in.
 * - CDP remote-debugging port — env-only. The persisted config can NEVER open
 *   it: an always-open localhost debug port is the genuinely risky surface, so
 *   it must require a deliberate per-launch env var, not a sticky setting.
 *
 * @module electron/utils/debugMode
 */

import {
  DEFAULT_REMOTE_DEBUGGING_PORT,
  MAX_TCP_PORT,
  MIN_TCP_PORT,
} from '../constants'

/**
 * Read-only, `process.env`-shaped string map.
 *
 * Typed loosely on purpose — NOT the project's augmented `NodeJS.ProcessEnv`
 * (which requires `NODE_ENV`) — so these pure helpers accept both the real
 * `process.env` at the call sites AND minimal `{ CORELIVE_DEBUG: '1' }` literals
 * in unit tests, without `NODE_ENV` noise polluting every test case.
 */
type ProcessEnvLike = Readonly<Record<string, string | undefined>>

/**
 * Whether the `CORELIVE_DEBUG` launch opt-in is enabled — the single env
 * predicate behind both debug capabilities; triggers when a packaged build is
 * launched with the flag set.
 *
 * Accepts `'1'` or `'true'` (case-insensitive, trimmed) so `CORELIVE_DEBUG=0`,
 * `false`, empty, and unset all read as off — a packaged build stays
 * non-debuggable unless explicitly opted in.
 *
 * @param env - Process env (the main-process launch environment)
 * @returns
 * - true: `CORELIVE_DEBUG` is `'1'` or `'true'`
 * - false: any other value, including unset (the packaged default)
 * @example
 * isCoreliveDebugEnabled({ CORELIVE_DEBUG: '1' })    // => true
 * isCoreliveDebugEnabled({ CORELIVE_DEBUG: 'true' }) // => true
 * isCoreliveDebugEnabled({ CORELIVE_DEBUG: '0' })    // => false
 * isCoreliveDebugEnabled({})                         // => false (packaged default)
 */
export const isCoreliveDebugEnabled = (env: ProcessEnvLike): boolean => {
  const flag = env.CORELIVE_DEBUG?.trim().toLowerCase()
  return flag === '1' || flag === 'true'
}

/**
 * Whether a BrowserWindow should be created with DevTools available — the shared
 * gate for every production window (main, floating, braindump, settings) so they
 * are uniformly debuggable or uniformly locked.
 *
 * True in local dev, when the persisted `advanced.enableDevTools` config is on,
 * or under the `CORELIVE_DEBUG` launch opt-in. In a default packaged build all
 * three are false, so DevTools cannot be opened on any window — the
 * secure-by-default posture Issue #61 asks for.
 *
 * @param isDev - NODE_ENV === 'development' (the local-dev main process)
 * @param isDevToolsConfigEnabled - Persisted `advanced.enableDevTools` value
 * @param env - Process env (read for the `CORELIVE_DEBUG` opt-in)
 * @returns
 * - true: dev, config-enabled, or `CORELIVE_DEBUG` opt-in set
 * - false: default packaged build (all three off)
 * @example
 * isDevToolsEnabled(true, false, {})                       // => true  (local dev)
 * isDevToolsEnabled(false, true, {})                       // => true  (config opt-in)
 * isDevToolsEnabled(false, false, { CORELIVE_DEBUG: '1' }) // => true  (env opt-in)
 * isDevToolsEnabled(false, false, {})                      // => false (packaged default)
 */
export const isDevToolsEnabled = (
  isDev: boolean,
  isDevToolsConfigEnabled: boolean,
  env: ProcessEnvLike,
): boolean => isDev || isDevToolsConfigEnabled || isCoreliveDebugEnabled(env)

/**
 * Validate a Chrome DevTools Protocol port string: an integer in the TCP range.
 * @param value - Raw env string (e.g. CORELIVE_REMOTE_DEBUGGING_PORT)
 * @returns true only for an integer in [MIN_TCP_PORT, MAX_TCP_PORT]
 * @example
 * isValidRemoteDebuggingPort('9222')  // => true
 * isValidRemoteDebuggingPort('70000') // => false (above 65535)
 * isValidRemoteDebuggingPort('9e3')   // => false (not a plain integer)
 */
const isValidRemoteDebuggingPort = (value: string): boolean => {
  // Plain-integer only: reject '9e3', '92.22', '-1', ' 9222 ' before Number().
  if (!/^\d+$/.test(value)) {
    return false
  }
  const port = Number(value)
  return Number.isInteger(port) && port >= MIN_TCP_PORT && port <= MAX_TCP_PORT
}

/**
 * Resolve the Chrome DevTools Protocol `remote-debugging-port` to open, or null
 * — drives main.ts's decision to expose a CDP port at launch.
 *
 * Precedence:
 * 1. `PLAYWRIGHT_REMOTE_DEBUGGING_PORT` — the existing E2E lever, passed through
 *    unchanged (the dev-runner always sets a valid port), so E2E is unaffected.
 * 2. `CORELIVE_DEBUG` opt-in — opens the default port
 *    (`DEFAULT_REMOTE_DEBUGGING_PORT`) unless `CORELIVE_REMOTE_DEBUGGING_PORT`
 *    overrides it.
 * Otherwise null: a default packaged build opens no port (Issue #61).
 *
 * @param env - Process env (the main-process launch environment)
 * @returns
 * - port string: the CDP port to pass to `--remote-debugging-port`
 * - null: no debug opt-in set — open no port (the packaged default)
 * @throws Error if `CORELIVE_REMOTE_DEBUGGING_PORT` is set but is not a valid
 *   integer in [MIN_TCP_PORT, MAX_TCP_PORT] (mirrors the strict
 *   ELECTRON_RENDERER_URL guard — surface the typo loudly instead of silently
 *   opening the wrong/no port)
 * @example
 * resolveRemoteDebuggingPort({ PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9222' }) // => '9222'
 * resolveRemoteDebuggingPort({ CORELIVE_DEBUG: '1' })                      // => '9222'
 * resolveRemoteDebuggingPort({ CORELIVE_DEBUG: '1', CORELIVE_REMOTE_DEBUGGING_PORT: '9333' }) // => '9333'
 * resolveRemoteDebuggingPort({})                                          // => null (packaged default)
 */
export const resolveRemoteDebuggingPort = (
  env: ProcessEnvLike,
): string | null => {
  // Existing E2E lever: preserve verbatim, highest precedence, zero behavior
  // change for the Playwright Electron suite.
  if (env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT) {
    return env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT
  }
  // Prod debug opt-in: CORELIVE_DEBUG opens the CDP port on the default port,
  // overridable with CORELIVE_REMOTE_DEBUGGING_PORT.
  if (isCoreliveDebugEnabled(env)) {
    const customPort = env.CORELIVE_REMOTE_DEBUGGING_PORT
    if (customPort !== undefined && customPort !== '') {
      if (!isValidRemoteDebuggingPort(customPort)) {
        throw new Error(
          `CORELIVE_REMOTE_DEBUGGING_PORT must be an integer in ` +
            `${MIN_TCP_PORT}-${MAX_TCP_PORT} — got "${customPort}".`,
        )
      }
      return customPort
    }
    return String(DEFAULT_REMOTE_DEBUGGING_PORT)
  }
  // No debug opt-in: a default packaged build exposes no remote-debugging port.
  return null
}

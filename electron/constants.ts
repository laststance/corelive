/**
 * @fileoverview Shared constants for the Electron main process.
 *
 * Why this module exists: the startup-window nav-watch (`WindowManager`) must
 * compare a panel's final navigated URL against Clerk's auth pages and ignore
 * Chromium's "intentionally aborted" load errors. Centralizing those strings
 * and the magic error code keeps them out of `WindowManager` as bare literals
 * and gives later commits (e.g. the cold-boot pill) a single source of truth.
 *
 * @module electron/constants
 */

/**
 * Clerk sign-in route. Mirrors `proxy.ts`'s redirect target and
 * `NEXT_PUBLIC_CLERK_SIGN_IN_URL`. Hard-coded here because `NEXT_PUBLIC_*` vars
 * are renderer-time only and must not be read from the main process at runtime.
 */
export const LOGIN_PATHNAME = '/login'

/** Clerk sign-up route. Mirrors `NEXT_PUBLIC_CLERK_SIGN_UP_URL`. */
export const SIGN_UP_PATHNAME = '/sign-up'

/**
 * Pathnames that mean "the user is not yet authenticated" when a startup panel
 * lands on them. A panel that ends up here was redirected by `proxy.ts`, so the
 * nav-watch surfaces the main window instead of an empty panel.
 */
export const AUTH_PATHNAMES: readonly string[] = [
  LOGIN_PATHNAME,
  SIGN_UP_PATHNAME,
]

/**
 * Chromium net error for an intentionally cancelled load (`net::ERR_ABORTED`).
 * It fires during the normal `/panel` → `/login` redirect chain, so the startup
 * nav-watch must NOT treat it as a real load failure.
 *
 * @see https://source.chromium.org/chromium/chromium/src/+/main:net/base/net_error_list.h
 */
export const ERR_ABORTED = -3

// ============================================================================
// Cold-boot startup pill (panel-only launch)
// ============================================================================

/**
 * Grace period before the cold-boot pill appears. If a real window paints
 * within this window, the pill is dismissed and never shown — avoids a flash on
 * a fast boot. Sits just above a typical `ready-to-show` so only genuinely slow
 * panel-only boots ever surface it.
 */
export const STARTUP_PILL_GAP_MS = 400

/**
 * Hard cap on how long the pill stays up. If neither the main window nor a panel
 * has surfaced by now the boot is wedged (offline / timeout / 5xx), so the pill
 * is dismissed and the main window is surfaced as a backstop.
 */
export const STARTUP_PILL_TIMEOUT_MS = 8000

/** Startup-pill window width (transparent; the visible pill is centered). */
export const STARTUP_PILL_WIDTH_PX = 260

/** Startup-pill window height (transparent; the visible pill is centered). */
export const STARTUP_PILL_HEIGHT_PX = 76

// ============================================================================
// Auto-update download progress window
// ============================================================================

/** Update-progress window width (transparent; the visible panel is centered). */
export const UPDATE_PROGRESS_WINDOW_WIDTH_PX = 360

/** Update-progress window height (transparent; the visible panel is centered). */
export const UPDATE_PROGRESS_WINDOW_HEIGHT_PX = 118

/** Distance from the bottom of the active work area for the progress window. */
export const UPDATE_PROGRESS_WINDOW_BOTTOM_OFFSET_PX = 92

/** Minimum percent emitted for update download progress. */
export const UPDATE_PROGRESS_PERCENT_MIN = 0

/** Maximum percent emitted for update download progress. */
export const UPDATE_PROGRESS_PERCENT_MAX = 100

// ============================================================================
// Opt-in debug mode (Issue #61 — DevTools / CDP in packaged builds)
// ============================================================================

/**
 * Chrome DevTools Protocol port opened when `CORELIVE_DEBUG` is set without an
 * explicit `CORELIVE_REMOTE_DEBUGGING_PORT`. 9222 is Chromium's conventional
 * remote-debugging port — the one `chrome://inspect` probes by default.
 */
export const DEFAULT_REMOTE_DEBUGGING_PORT = 9222

/** Lowest valid TCP port — lower bound when validating a user-supplied debug port. */
export const MIN_TCP_PORT = 1

/** Highest valid TCP port (16-bit unsigned max) — upper bound for the debug port. */
export const MAX_TCP_PORT = 65535

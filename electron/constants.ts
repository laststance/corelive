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
// Floating window load-failure recovery (DT7)
// ============================================================================

/**
 * How many times the Floating window silently retries a failed main-frame load
 * before surfacing the native recovery dialog. The Floating panel is the
 * signed-out front door now, so a never-loaded ("dead") window must self-heal
 * across a brief offline/DNS/5xx blip rather than stranding the user.
 */
export const FLOATING_LOAD_MAX_RETRIES: number = 3

/**
 * Base backoff before a Floating reload retry; the delay scales linearly with
 * the attempt number (800 → 1600 → 2400 ms). Quick enough to ride out a brief
 * blip, backed off enough not to hammer a still-unreachable origin.
 */
export const FLOATING_LOAD_RETRY_BASE_MS: number = 800

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

// ============================================================================
// Settings popover window
// ============================================================================

/** Default width of the Settings tray popover. */
export const SETTINGS_POPOVER_DEFAULT_WIDTH_PX = 360

/** Default height of the Settings tray popover. */
export const SETTINGS_POPOVER_DEFAULT_HEIGHT_PX = 380

/** Minimum width the user can drag the Settings popover to. */
export const SETTINGS_POPOVER_MIN_WIDTH_PX = 320

/** Minimum height the user can drag the Settings popover to. */
export const SETTINGS_POPOVER_MIN_HEIGHT_PX = 300

/** Maximum width the user can drag the Settings popover to. */
export const SETTINGS_POPOVER_MAX_WIDTH_PX = 800

/** Maximum height the user can drag the Settings popover to. */
export const SETTINGS_POPOVER_MAX_HEIGHT_PX = 900

/** Debounce delay (ms) before persisting Settings popover size after a resize drag. */
export const SETTINGS_POPOVER_RESIZE_DEBOUNCE_MS = 200

// ============================================================================
// Native key-tap freeze-safety (#125)
// ============================================================================

/**
 * How long after a healthy `uIOhook.start()` the brick-proof launch latch waits
 * before clearing its on-disk marker (electron/utils/nativeTapLatch.ts). The
 * marker is armed just before `start()`; if the tap start crashes or wedges the
 * process within this window the clear-timer never runs, so the marker survives
 * to the next launch and blocks a re-arm (the brick loop). 5s comfortably covers
 * a near-immediate arming crash while keeping the false-block window (app killed
 * right after launch) small and one-click recoverable.
 */
export const NATIVE_TAP_STABILITY_WINDOW_MS = 5000

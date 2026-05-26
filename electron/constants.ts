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

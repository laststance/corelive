'use client'

import { useUser } from '@clerk/nextjs'

/**
 * Returns whether Clerk-authenticated client queries can safely run.
 *
 * This prevents Electron and web clients from firing protected API requests
 * before Clerk has finished hydrating the current browser session.
 *
 * @returns
 * - `true` when Clerk finished loading and a signed-in user is available.
 * - `false` while Clerk is still hydrating or when the user is signed out.
 * @example
 * const isClerkQueryReady = useClerkQueryReady()
 * // => true after OAuth redirects back into the app
 */
export function useClerkQueryReady(): boolean {
  const { isLoaded, user } = useUser()
  return isLoaded && Boolean(user)
}

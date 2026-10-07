import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'

import type { AppRouter } from '@/server/router'

import { log } from '../logger'

/**
 * Creates an RPCLink for client-side oRPC requests with Clerk authentication.
 * This link attaches a Clerk session JWT, which the HTTP route verifies before resolving the account.
 *
 * @returns RPCLink configured for the current origin's /api/orpc endpoint
 * @throws Error if called on the server side (SSR)
 * @example `const link = createLink()`
 */
function createLink() {
  return new RPCLink({
    url: '/api/orpc',
    origin: () => {
      if (typeof window === 'undefined') {
        throw new Error('RPCLink is not allowed on the server side.')
      }
      return window.location.origin
    },
    headers: async () => {
      if (typeof window === 'undefined') {
        return {}
      }

      const clerk = window.Clerk
      if (!clerk) {
        // Clerk may still be loading immediately after navigation.
        return {}
      }

      try {
        // Wait for Clerk only when its current session has not loaded yet.
        const maybeLoad = (clerk as { load?: () => Promise<void> }).load
        if (!clerk.session && typeof maybeLoad === 'function') {
          await Promise.race([
            maybeLoad.call(clerk),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ])
        }
        const token = await clerk.session?.getToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
      } catch (error) {
        log.error('Failed to load Clerk session for ORPC client:', error)
        return {}
      }
    },
  })
}

/**
 * Creates a type-safe oRPC client for client-side usage.
 * Uses Clerk authentication via RPCLink headers.
 *
 * @returns RouterClient instance typed to AppRouter
 * @example `const client = createClient()`
 */
export const createClient = (): RouterClient<AppRouter> => {
  return createORPCClient(createLink())
}

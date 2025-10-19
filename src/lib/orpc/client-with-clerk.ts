import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'

import type { AppRouter } from '@/server/router'

import { log } from '../logger'

// Mock client creation function for development environment
export function createLink() {
  return new RPCLink({
    url: () => {
      if (typeof window === 'undefined') {
        throw new Error('RPCLink is not allowed on the server side.')
      }
      return `${window.location.origin}/api/orpc`
    },
    headers: async () => {
      if (typeof window === 'undefined') {
        return {}
      }

      const clerk = window.Clerk
      if (!clerk) {
        // when Clerk hasn't loaded yet (e.g. Playwright immediately after navigation)
        return {}
      }

      try {
        // First, try to get session without calling load() - it might already be available
        let userId = clerk.session?.user?.id ?? clerk.user?.id ?? null

        // If no session yet, try calling load() with timeout
        if (!userId) {
          const maybeLoad = (clerk as { load?: () => Promise<void> }).load
          if (typeof maybeLoad === 'function') {
            // Add timeout to prevent hanging indefinitely in test environments
            await Promise.race([
              maybeLoad.call(clerk),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ])
          }

          // Try getting session again after load
          userId = clerk.session?.user?.id ?? clerk.user?.id ?? null
        }

        if (!userId) {
          return {}
        }

        return {
          Authorization: `Bearer ${userId}`,
        }
      } catch (error) {
        log.error('Failed to load Clerk session for ORPC client:', error)
        return {}
      }
    },
  })
}

// Create client
export const createClient = (): RouterClient<AppRouter> => {
  return createORPCClient(createLink())
}

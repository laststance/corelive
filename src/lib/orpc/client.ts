import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'

import type { AppRouter } from '@/server/router'

import { log } from '../logger'

// TODO deadcode
// Client-side link creation function
export function createLink() {
  return new RPCLink({
    url: () => {
      if (typeof window === 'undefined') {
        throw new Error('RPCLink is not allowed on the server side.')
      }
      return `${window.location.origin}/api/orpc`
    },
    headers: async () => {
      // Get userId from Clerk user session
      if (typeof window !== 'undefined' && window.Clerk) {
        try {
          // Get userId from Clerk session
          const clerk = window.Clerk
          const maybeLoad = (clerk as { load?: () => Promise<void> }).load
          if (typeof maybeLoad === 'function') {
            await maybeLoad.call(clerk)
          }

          const session = clerk.session
          const userId = session?.user?.id ?? clerk.user?.id ?? null

          if (userId) {
            return {
              Authorization: `Bearer ${userId}`,
            }
          }
        } catch (error) {
          log.error('Failed to get Clerk session:', error)
        }
      }
      return {}
    },
  })
}

// Create client
export const createClient = (): RouterClient<AppRouter> => {
  return createORPCClient(createLink())
}

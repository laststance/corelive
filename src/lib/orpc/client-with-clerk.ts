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
      // Retrieve auth info from Clerk in production environment
      if (typeof window !== 'undefined' && window.Clerk) {
        try {
          const session = window.Clerk.session
          if (session?.user?.id) {
            return {
              Authorization: `Bearer ${session.user.id}`,
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

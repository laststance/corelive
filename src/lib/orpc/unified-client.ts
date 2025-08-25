import type { RouterClient } from '@orpc/server'

import type { AppRouter } from '@/server/router'

import { createClient as createWebClient } from './client-with-clerk'
import { createElectronClient, isElectronEnvironment } from './electron-client'

// Unified client that works in both web and Electron environments
export const createUnifiedClient = (): RouterClient<AppRouter> => {
  // Check if we're in Electron environment
  if (isElectronEnvironment()) {
    return createElectronClient()
  }

  // Fall back to web client
  return createWebClient()
}

// Export for backward compatibility
export const createClient = createUnifiedClient

import type { RouterClient } from '@orpc/server'

import type { AppRouter } from '@/server/router'

import { createClient as createWebClient } from './client-with-clerk'

/**
 * Creates a unified oRPC client.
 *
 * In WebView architecture, both web and Electron use the same web client
 * that communicates with https://corelive.app/api/orpc via HTTP.
 *
 * The Electron app loads the web app directly (WebView), so it uses
 * the same oRPC client as the browser version.
 *
 * @returns RouterClient instance for oRPC calls
 */
export const createUnifiedClient = (): RouterClient<AppRouter> => {
  // Always use web client - both web and Electron (WebView) use oRPC via HTTP
  return createWebClient()
}

// Export for backward compatibility
export const createClient = createUnifiedClient

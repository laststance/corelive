import { isTrustedAppNavigation } from './isTrustedAppNavigation'

export const TOKEN_BROKER_PATH = '/desktop-auth'
// Clerk's installed backend uses these during its bounded session handshake.
const HANDSHAKE_QUERY_KEYS = new Set([
  '__clerk_api_version',
  '__clerk_db_jwt',
  '__clerk_handshake',
  '__clerk_handshake_nonce',
  '__clerk_help',
  '__clerk_hs_reason',
  '__clerk_redirect_count',
  '__clerk_redirect_url',
  '__clerk_synced',
])

/**
 * Allows the exact broker route and Clerk's documented development handshake payload.
 * Main and the standalone sandbox preload share this guard. Query payloads are never
 * logged; a different route, unrelated query, opaque origin or fragment fails closed.
 * @example isTrustedTokenBrokerDocument('https://corelive.app/desktop-auth', 'https://corelive.app')
 */
export function isTrustedTokenBrokerDocument(
  url: string,
  origin: string,
): boolean {
  try {
    const parsed = new URL(url)
    return (
      isTrustedAppNavigation(url, origin) &&
      parsed.pathname === TOKEN_BROKER_PATH &&
      !parsed.hash &&
      [...parsed.searchParams.keys()].every((key) =>
        HANDSHAKE_QUERY_KEYS.has(key),
      )
    )
  } catch {
    return false
  }
}

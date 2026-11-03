import type { SignOutResult } from '@corelive/desktop-contract/offline-account'

/** The slice of an Electron cookie this module reads; values are deliberately absent (DX7). */
export interface SessionCookie {
  name: string
  domain?: string
  path?: string
  secure?: boolean
}

/** The slice of `Electron.Session` D3 step 4 uses; a fake implements it in tests. */
export interface SessionLike {
  cookies: {
    get: (filter: { domain?: string }) => Promise<SessionCookie[]>
    remove: (url: string, name: string) => Promise<void>
  }
  clearStorageData: (options: {
    origin?: string
    storages?: SignOutStorage[]
  }) => Promise<void>
}

/** Storage kinds `clearStorageData` accepts that D3 step 4 uses. */
type SignOutStorage =
  'cookies' | 'localstorage' | 'indexdb' | 'serviceworkers' | 'cachestorage'

/** Storage kinds cleared for both origins (D3 step 4, C3). */
export const SIGN_OUT_STORAGES: SignOutStorage[] = [
  'cookies',
  'localstorage',
  'indexdb',
  'serviceworkers',
  'cachestorage',
]

/** Clerk cookie names that may be removed from the shared parent domain (EA11b). */
const CLERK_COOKIE_NAME = /^(__client|__session|__clerk)/

/** Development Frontend API hosts look like `<slug>.clerk.accounts.dev`; the bare suffix is never swept. */
const CLERK_DEV_SUFFIX = '.clerk.accounts.dev'
const CLERK_DEV_PARENT = 'clerk.accounts.dev'

/** Normalizes a cookie domain: lower-case without the leading dot. */
function normalizeDomain(domain: string | undefined): string {
  return (domain ?? '').replace(/^\./, '').toLowerCase()
}

/** Whether a host is an IP literal or `localhost` (no registrable parent). */
function hasRegistrableParent(hostname: string): boolean {
  return (
    hostname !== 'localhost' &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
    !hostname.includes(':') &&
    hostname.split('.').length >= 2
  )
}

/**
 * Derives the exact hosts and the single registrable parent D3 step 4 may touch (EA11b).
 * Production: the app host (plus its `www` alias) and `clerk.<app domain>`. Development: the
 * app host plus the `*.clerk.accounts.dev` Frontend API hosts found among the cookies; the
 * `clerk.accounts.dev` suffix and any public suffix are never included.
 * @param appOrigin - The configured `serverUrl` origin.
 * @param cookieDomains - Domains currently present in the session (development discovery).
 * @returns Exact hosts, the parent (or null) and the Clerk Frontend API hosts.
 * @example deriveSweepScope('https://corelive.app', [])
 * // { exactHosts: ['corelive.app', 'www.corelive.app', 'clerk.corelive.app'], parent: 'corelive.app', clerkHosts: ['clerk.corelive.app'] }
 */
export function deriveSweepScope(
  appOrigin: string,
  cookieDomains: string[],
): { exactHosts: string[]; parent: string | null; clerkHosts: string[] } {
  const appHost = new URL(appOrigin).hostname.toLowerCase()
  const bareHost = appHost.replace(/^www\./, '')
  const parent = hasRegistrableParent(bareHost) ? bareHost : null
  const appHosts = parent
    ? [...new Set([bareHost, `www.${bareHost}`])]
    : [appHost]
  const clerkHosts = parent
    ? [`clerk.${parent}`]
    : [
        ...new Set(
          cookieDomains
            .map(normalizeDomain)
            .filter(
              (domain) =>
                domain.endsWith(CLERK_DEV_SUFFIX) &&
                domain !== CLERK_DEV_PARENT,
            ),
        ),
      ]
  return { exactHosts: [...appHosts, ...clerkHosts], parent, clerkHosts }
}

/**
 * Whether the sweep may remove this cookie: exact-host cookies always, parent-domain
 * cookies only with a Clerk cookie name (EA11b); everything else is left alone.
 */
function isSweepable(
  cookie: SessionCookie,
  scope: ReturnType<typeof deriveSweepScope>,
): boolean {
  const domain = normalizeDomain(cookie.domain)
  const isDomainCookie = Boolean(cookie.domain?.startsWith('.'))
  // A domain cookie on the shared parent may belong to other products: Clerk names only.
  if (isDomainCookie && scope.parent !== null && domain === scope.parent)
    return CLERK_COOKIE_NAME.test(cookie.name)
  return scope.exactHosts.includes(domain)
}

/** Builds the removal URL from the cookie's own domain, path and secure flag (E2). */
function cookieUrl(cookie: SessionCookie): string {
  const scheme = cookie.secure ? 'https' : 'http'
  return `${scheme}://${normalizeDomain(cookie.domain)}${cookie.path ?? '/'}`
}

/**
 * Reads the cookies the sweep covers. `cookies.get({ domain })` matches the domain and its
 * subdomains (confirmed against the Electron docs, C27), so one query per exact host plus the
 * parent finds host-only and parent-domain cookies; {@link isSweepable} then filters.
 */
async function readSweepable(
  session: SessionLike,
  scope: ReturnType<typeof deriveSweepScope>,
): Promise<SessionCookie[]> {
  const queryDomains = [
    ...new Set([...scope.exactHosts, ...(scope.parent ? [scope.parent] : [])]),
  ]
  const seen = new Map<string, SessionCookie>()
  for (const domain of queryDomains)
    for (const cookie of await session.cookies.get({ domain }))
      if (isSweepable(cookie, scope))
        seen.set(
          `${normalizeDomain(cookie.domain)}|${cookie.path ?? '/'}|${cookie.name}`,
          cookie,
        )
  return [...seen.values()]
}

/**
 * Ends the local web session: D3 step 4 (C3, C15, E2, EA11b, DX6).
 *
 * Clears origin-scoped storage for the app origin and each Clerk Frontend API origin only (never
 * without an `origin`), then removes remaining cookies one by one and reads them back. It
 * reports names and domains, never values. Called by `signOutDevice`, by the launch-time journal
 * resume (EA1) and by the "Clear again" action.
 *
 * @param options.session - The default session (or a fake).
 * @param options.appOrigin - The configured `serverUrl` origin.
 * @param options.log - Redacted log sink.
 * @returns `signed-out`, or `signed-out-residual` listing what survived the read-back.
 * @example
 * ```ts
 * const result = await endLocalSession({ session: session.defaultSession, appOrigin: 'https://corelive.app' })
 * ```
 */
export async function endLocalSession(options: {
  session: SessionLike
  appOrigin: string
  log?: (line: string) => void
}): Promise<Exclude<SignOutResult, { status: 'flush-failed' }>> {
  const { session } = options
  const initial = await session.cookies.get({})
  const scope = deriveSweepScope(
    options.appOrigin,
    initial.map((cookie) => cookie.domain ?? ''),
  )
  // C3: only these origins, each with an explicit origin option.
  const origins = [
    new URL(options.appOrigin).origin,
    ...scope.clerkHosts.map((host) => `https://${host}`),
  ]
  for (const origin of origins)
    await session
      .clearStorageData({ origin, storages: SIGN_OUT_STORAGES })
      .catch(() => undefined)

  // C15 sweep: remove what survived, one cookie at a time, from its own URL (E2).
  for (const cookie of await readSweepable(session, scope))
    await session.cookies.remove(cookieUrl(cookie), cookie.name).catch(() => {
      // The read-back below reports anything that stays.
    })

  const residual = await readSweepable(session, scope)
  if (!residual.length) return { status: 'signed-out' }
  const cookieNames = [...new Set(residual.map((cookie) => cookie.name))]
  const domains = [
    ...new Set(residual.map((cookie) => normalizeDomain(cookie.domain))),
  ]
  options.log?.(
    `SIGNOUT_RESIDUAL_COOKIE names=${cookieNames.join(',')} domains=${domains.join(',')}`,
  )
  return {
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames,
    domains,
  }
}

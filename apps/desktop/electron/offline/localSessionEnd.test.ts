import { describe, expect, test, vi } from 'vitest'

import {
  deriveSweepScope,
  endLocalSession,
  SIGN_OUT_STORAGES,
  type SessionCookie,
  type SessionLike,
} from './localSessionEnd'

/**
 * A fake Electron session whose cookie store follows the documented `cookies.get({ domain })`
 * semantics: it matches the domain and its subdomains (C27).
 */
function createFakeSession(
  initial: SessionCookie[],
  options: { failRemove?: boolean } = {},
) {
  let cookies = [...initial]
  const clearStorageData = vi.fn<SessionLike['clearStorageData']>(
    async () => undefined,
  )
  const remove = vi.fn(async (url: string, name: string) => {
    if (options.failRemove) throw new Error('remove failed')
    const target = new URL(url)
    cookies = cookies.filter(
      (cookie) =>
        !(
          cookie.name === name &&
          (cookie.domain ?? '').replace(/^\./, '') === target.hostname &&
          (cookie.path ?? '/') === target.pathname
        ),
    )
  })
  const session: SessionLike = {
    cookies: {
      get: async ({ domain }) =>
        cookies.filter((cookie) => {
          if (!domain) return true
          const own = (cookie.domain ?? '').replace(/^\./, '')
          return own === domain || own.endsWith(`.${domain}`)
        }),
      remove,
    },
    clearStorageData,
  }
  return { session, clearStorageData, remove, remaining: () => cookies }
}

const production = 'https://corelive.app'
const productionCookies: SessionCookie[] = [
  { name: '__session', domain: 'corelive.app', path: '/', secure: true },
  { name: '__client_uat', domain: '.corelive.app', path: '/', secure: true },
  { name: '__clerk_db_jwt', domain: '.corelive.app', path: '/', secure: true },
  { name: '__client', domain: 'clerk.corelive.app', path: '/', secure: true },
  { name: '__session', domain: 'www.corelive.app', path: '/v1', secure: true },
  { name: 'analytics_id', domain: '.corelive.app', path: '/', secure: true },
  { name: '__session', domain: 'other.example', path: '/', secure: true },
]

describe('ending the local session at sign-out', () => {
  test('clears storage only for the app origin and the Clerk Frontend API origin, never without an origin', async () => {
    // Arrange
    const fake = createFakeSession(productionCookies)

    // Act
    await endLocalSession({ session: fake.session, appOrigin: production })

    // Assert
    expect(
      fake.clearStorageData.mock.calls.map(([options]) => options),
    ).toEqual([
      { origin: 'https://corelive.app', storages: SIGN_OUT_STORAGES },
      { origin: 'https://clerk.corelive.app', storages: SIGN_OUT_STORAGES },
    ])
  })

  test('removes host-only, parent-domain and path-scoped Clerk cookies and leaves other cookies untouched', async () => {
    // Arrange
    const fake = createFakeSession(productionCookies)

    // Act
    const result = await endLocalSession({
      session: fake.session,
      appOrigin: production,
    })

    // Assert
    expect(result).toEqual({ status: 'signed-out' })
    expect(fake.remaining()).toEqual([
      {
        name: 'analytics_id',
        domain: '.corelive.app',
        path: '/',
        secure: true,
      },
      { name: '__session', domain: 'other.example', path: '/', secure: true },
    ])
    // E2: the path-scoped cookie is removed from its own URL
    expect(fake.remove).toHaveBeenCalledWith(
      'https://www.corelive.app/v1',
      '__session',
    )
  })

  test('never sweeps clerk.accounts.dev and discovers the development Frontend API host from the session', async () => {
    // Arrange
    const fake = createFakeSession([
      {
        name: '__client',
        domain: 'fancy-cat-1.clerk.accounts.dev',
        path: '/',
        secure: true,
      },
      {
        name: '__clerk_db_jwt',
        domain: '.clerk.accounts.dev',
        path: '/',
        secure: true,
      },
      { name: '__session', domain: 'localhost', path: '/', secure: false },
    ])

    // Act
    const result = await endLocalSession({
      session: fake.session,
      appOrigin: 'http://localhost:4991',
    })

    // Assert
    expect(result).toEqual({ status: 'signed-out' })
    expect(fake.remaining()).toEqual([
      {
        name: '__clerk_db_jwt',
        domain: '.clerk.accounts.dev',
        path: '/',
        secure: true,
      },
    ])
    expect(
      fake.clearStorageData.mock.calls.map(([options]) => options?.origin),
    ).toEqual([
      'http://localhost:4991',
      'https://fancy-cat-1.clerk.accounts.dev',
    ])
  })

  test('reports names and domains, never values, when a cookie survives, and Clear again then succeeds', async () => {
    // Arrange
    const logs: string[] = []
    const stuck = createFakeSession(
      [{ name: '__session', domain: 'corelive.app', path: '/', secure: true }],
      { failRemove: true },
    )

    // Act
    const first = await endLocalSession({
      session: stuck.session,
      appOrigin: production,
      log: (line) => logs.push(line),
    })
    const healthy = createFakeSession(stuck.remaining())
    const second = await endLocalSession({
      session: healthy.session,
      appOrigin: production,
    })

    // Assert
    expect(first).toEqual({
      status: 'signed-out-residual',
      code: 'SIGNOUT_RESIDUAL_COOKIE',
      cookieNames: ['__session'],
      domains: ['corelive.app'],
    })
    expect(logs).toEqual([
      'SIGNOUT_RESIDUAL_COOKIE names=__session domains=corelive.app',
    ])
    expect(second).toEqual({ status: 'signed-out' })
  })

  test('derives only exact hosts plus the app registrable parent', () => {
    // Arrange / Act
    const scope = deriveSweepScope(production, [])

    // Assert
    expect(scope).toEqual({
      exactHosts: ['corelive.app', 'www.corelive.app', 'clerk.corelive.app'],
      parent: 'corelive.app',
      clerkHosts: ['clerk.corelive.app'],
    })
  })
})

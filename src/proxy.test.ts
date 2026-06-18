/**
 * @fileoverview proxy.ts route-protection pin — the public-route carve-out guard.
 *
 * The sentinel: `/floating-navigator` MUST stay OUT of the protected matcher. It
 * is the Electron signed-out "front door" — the Floating window loads it while
 * signed out and Clerk re-renders it in place after a native OAuth sign-in. If a
 * future edit drops `/floating-navigator(.*)` into `createRouteMatcher`, a
 * signed-out load would bounce to `/login`, the card + navigator would never
 * render, and every SignedOutFloatingCard + DT7 recovery path would silently go
 * dark — with the rest of the suite still green. This test fails the instant
 * that carve-out is lost (and its sibling proves the carve-out is scoped, not a
 * blanket open door).
 *
 * It drives the REAL Clerk `createRouteMatcher` (the matcher list is the thing
 * under test); only `clerkMiddleware` is unwrapped so the handler can be called
 * directly with a controlled auth state — no Clerk secret / middleware boot.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- proxy
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Shape proxy.ts's `clerkMiddleware` handler is actually invoked with: a Clerk
 * `auth()` thunk and the request. The mock below unwraps `clerkMiddleware` to
 * this raw handler, so the default export is callable as `(auth, req)` rather
 * than the `(request, event)` NextMiddleware shape its static type advertises.
 */
type ProxyAuth = () => Promise<{ isAuthenticated: boolean }>
type ProxyRequest = { nextUrl: { pathname: string }; url: string }
type ProxyHandler = (
  auth: ProxyAuth,
  req: ProxyRequest,
) => Promise<Response | undefined>

// Keep the REAL createRouteMatcher (its route list is the thing under test) but
// unwrap clerkMiddleware to expose proxy.ts's handler, so the test drives it
// with a controlled auth state instead of booting Clerk's full middleware.
vi.mock('@clerk/nextjs/server', async (importOriginal) => {
  // Structural shape of the one real export we keep — `typeof import()` as a
  // type arg is lint-forbidden, so restate the createRouteMatcher contract.
  const actual = await importOriginal<{
    createRouteMatcher: (
      routes: readonly string[],
    ) => (req: { nextUrl: { pathname: string } }) => boolean
  }>()
  return {
    createRouteMatcher: actual.createRouteMatcher,
    clerkMiddleware: (handler: ProxyHandler) => handler,
  }
})

/**
 * Builds the minimal request the proxy handler reads: `nextUrl.pathname` (what
 * the real Clerk matcher tests) and an absolute `url` (what the `/login`
 * redirect is constructed from).
 *
 * @param pathname - The request path, e.g. `/floating-navigator`.
 * @returns A request double carrying exactly those two fields.
 * @example
 *   requestFor('/home') // => { nextUrl: { pathname: '/home' }, url: 'https://corelive.app/home' }
 */
function requestFor(pathname: string): ProxyRequest {
  return {
    nextUrl: { pathname },
    url: `https://corelive.app${pathname}`,
  }
}

describe('proxy route protection', () => {
  let handler: ProxyHandler

  beforeEach(async () => {
    // The clerkMiddleware mock unwraps the default export to its raw handler.
    const proxyModule = await import('./proxy')
    handler = proxyModule.default as unknown as ProxyHandler
  })

  it('lets a signed-out visitor reach /floating-navigator instead of bouncing to /login', async () => {
    // Arrange: a signed-out visitor — the Electron Floating front door loads
    // this route before any sign-in exists.
    const auth = vi.fn(async () => ({ isAuthenticated: false }))

    // Act
    const result = await handler(auth, requestFor('/floating-navigator'))

    // Assert: no redirect response at all — the signed-out front door renders.
    // A protected route would have produced a /login redirect for this same
    // signed-out visitor, so an undefined result here means the route is public.
    expect(result).toBeUndefined()
    // And it short-circuited as public: it never even consulted auth.
    expect(auth).not.toHaveBeenCalled()
  })

  it('still redirects a signed-out visitor on a protected route (/home) to /login', async () => {
    // Arrange: the same signed-out visitor, but on a protected route — proves
    // the carve-out is scoped to /floating-navigator, not a blanket open door.
    const auth = vi.fn(async () => ({ isAuthenticated: false }))

    // Act
    const result = await handler(auth, requestFor('/home'))

    // Assert: bounced to /login (Next redirect status = 307), proving the
    // matcher is live and protecting the rest of the app.
    expect(result?.status).toBe(307)
    expect(result?.headers.get('location')).toContain('/login')
  })
})

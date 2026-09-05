/**
 * @fileoverview LoginShell — the Electron login window's four states.
 *
 * The sentinel: the login window is the desktop app's ONLY sign-in surface, and
 * its sign-in affordance is decided by CAPABILITY (`useShowElectronOAuth`), not
 * a call-time `?.`. The web renderer ships via Vercel independently of the
 * packaged app, so an OLDER install whose frozen preload predates the oauth
 * bridge loads this same shell — it must degrade to the web-app fallback rather
 * than render dead buttons, and a plain browser tab must never see the card.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- LoginShell
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoginShell } from './LoginShell'

type ClerkUserState = { isLoaded: boolean; isSignedIn: boolean }

// Clerk session, controllable per spec. Signed out by default: that is the
// state the login window exists for.
const { clerkUserRef } = vi.hoisted(() => ({
  clerkUserRef: {
    current: { isLoaded: true, isSignedIn: false } as ClerkUserState,
  },
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Stub ONLY the Clerk-dependent OAuth buttons (they need a ClerkProvider); keep
// the REAL `useShowElectronOAuth` capability hook — that skew-guard is the thing
// under test, so it must run against the actual `window.electronAPI` we plant.
vi.mock('@/components/auth/ElectronOAuthButtons', async (importOriginal) => {
  // Structural shape of the one real export we keep (the capability hook). The
  // module type isn't imported inline (`typeof import()` is lint-forbidden) and
  // a value import would be type-only here — restating the stable `() => boolean`
  // contract keeps the spread typed without either.
  const actual = await importOriginal<{ useShowElectronOAuth: () => boolean }>()
  return {
    ...actual,
    ElectronOAuthButtons: () => <div data-testid="oauth-buttons" />,
  }
})

/**
 * Plants a fake `window.electronAPI` as the login preload would: `{ oauth: {} }`
 * mimics the current preload, `{}` a frozen pre-oauth one.
 * @param api - The partial electronAPI to expose.
 * @returns Nothing; mutates the happy-dom window object.
 * @example
 * exposeElectronAPI({ oauth: {} })
 */
function exposeElectronAPI(api: Record<string, unknown>): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('LoginShell', () => {
  afterEach(() => {
    // Each case decides the environment from scratch — drop any planted bridge so
    // the browser-tab case genuinely sees NO electronAPI.
    Reflect.deleteProperty(window, 'electronAPI')
    clerkUserRef.current = { isLoaded: true, isSignedIn: false }
  })

  it('tells a plain browser tab the shell is desktop-only instead of showing the card', () => {
    // Arrange: no preload at all — corelive.app/login-shell opened in a tab.

    // Act
    render(<LoginShell />)

    // Assert: the notice, and none of the front door.
    expect(
      screen.getByText('Only available in the desktop app'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('oauth-buttons')).not.toBeInTheDocument()
  })

  it('holds a calm loading state until Clerk resolves', () => {
    // Arrange: inside the login window, Clerk still loading.
    exposeElectronAPI({ oauth: {} })
    clerkUserRef.current = { isLoaded: false, isSignedIn: false }

    // Act
    render(<LoginShell />)

    // Assert: no buttons yet — a click before Clerk resolves would go nowhere.
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByTestId('oauth-buttons')).not.toBeInTheDocument()
  })

  it('offers native sign-in when the login preload exposes the oauth bridge', () => {
    // Arrange: the current login preload has exposed window.electronAPI.oauth.
    exposeElectronAPI({ oauth: {} })

    // Act
    render(<LoginShell />)

    // Assert: the OAuth buttons are reachable — a signed-out user can start the
    // native browser sign-in right here in the login window.
    expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument()
  })

  it('points to the web app instead of dead buttons when a frozen preload has no oauth bridge', () => {
    // Arrange: preload skew — an installed app's frozen preload exposes
    // electronAPI without the oauth bridge.
    exposeElectronAPI({})

    // Act
    render(<LoginShell />)

    // Assert: NO OAuth buttons (they'd be dead without the bridge), and the
    // skew-safe fallback guides the user to the web app instead.
    expect(screen.queryByTestId('oauth-buttons')).not.toBeInTheDocument()
    expect(screen.getByText(/web app/i)).toBeInTheDocument()
  })

  it('greets the signed-out user with the north-star invitation, not a sign-in demand', () => {
    // Arrange: the signed-out front door with the oauth bridge present.
    exposeElectronAPI({ oauth: {} })

    // Act
    render(<LoginShell />)

    // Assert: the warm editorial headline is the window's voice — an invitation
    // ("your year is waiting"), rendered as a real heading for a11y, never a
    // KPI/streak gate. This is the north-star contract for the front door.
    expect(
      screen.getByRole('heading', { name: /your year is waiting/i }),
    ).toBeInTheDocument()
  })

  it('shows the LiveEditor placeholder once signed in, for installs whose main process does not close the window', () => {
    // Arrange: Clerk reports a session inside the login window.
    exposeElectronAPI({ oauth: {} })
    clerkUserRef.current = { isLoaded: true, isSignedIn: true }

    // Act
    render(<LoginShell />)

    // Assert: no sign-in affordance any more, just the pointer onward.
    expect(
      screen.getByText('Signed in. Open LiveEditor to log your wins.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('oauth-buttons')).not.toBeInTheDocument()
  })
})

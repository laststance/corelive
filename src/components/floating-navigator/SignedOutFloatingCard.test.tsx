/**
 * @fileoverview SignedOutFloatingCard preload-skew degradation tests.
 *
 * The sentinel: the Floating window is now the signed-out "front door", and its
 * sign-in affordance is decided by CAPABILITY (`useShowElectronOAuth`), not a
 * call-time `?.`. The danger is preload skew — the web renderer ships via Vercel
 * independently of the packaged app, so an OLDER installed app whose frozen
 * Floating preload predates `window.electronAPI` will load this new card. If the
 * card rendered OAuth buttons unconditionally, that user would get dead buttons
 * (the deep-link bridge isn't there). The skew case below fails if the card ever
 * stops degrading to the web-app fallback when the oauth bridge is absent.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- SignedOutFloatingCard
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SignedOutFloatingCard } from './SignedOutFloatingCard'

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
 * Plants a fake `window.electronAPI` whose `oauth` bridge is present, mimicking
 * the current Floating preload after the T2 exposure.
 */
function exposeOAuthBridge(): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    // Partial test double for a wide preload global — only `oauth` truthiness is
    // read by the capability hook, so the cast through `unknown` is intentional.
    value: { oauth: {} } as unknown as Window['electronAPI'],
  })
}

describe('SignedOutFloatingCard', () => {
  afterEach(() => {
    // Each case decides the capability from scratch — drop any planted bridge so
    // the skew case genuinely sees NO electronAPI.
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('offers native sign-in when the Floating preload exposes the oauth bridge', () => {
    // Arrange: the current Floating preload has exposed window.electronAPI.oauth.
    exposeOAuthBridge()

    // Act
    render(<SignedOutFloatingCard />)

    // Assert: the OAuth buttons are reachable — a signed-out user can start the
    // native browser sign-in right here in the Floating window.
    expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument()
  })

  it('points to the web app instead of dead buttons when no oauth bridge exists', () => {
    // Arrange: preload skew — an installed app's frozen Floating preload predates
    // window.electronAPI entirely (this feature added it). electronAPI is absent.

    // Act
    render(<SignedOutFloatingCard />)

    // Assert: NO OAuth buttons (they'd be dead without the bridge), and the
    // skew-safe fallback guides the user to the web app instead.
    expect(screen.queryByTestId('oauth-buttons')).not.toBeInTheDocument()
    expect(screen.getByText(/web app/i)).toBeInTheDocument()
  })
})

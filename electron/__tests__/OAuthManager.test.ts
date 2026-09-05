import { beforeEach, describe, expect, it, vi } from 'vitest'

import { typedSend } from '../ipc/typedSend'
import { OAuthManager } from '../OAuthManager'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}))

// Spy on the per-window IPC send so initiator-targeting (the sign-in-token push
// and the error routing) is observable without a real Electron WebContents.
vi.mock('../ipc/typedSend', () => ({
  typedSend: vi.fn(),
}))

/**
 * Creates a minimal WindowManager mock for OAuth URL tests. OAuthManager now
 * sources the OAuth origin from `WindowManager.getWebAppOrigin()` (window-
 * agnostic, so it survives main-window retirement) rather than reading a live
 * BrowserWindow URL — the mock just returns the resolved origin.
 *
 * @param origin - Web-app origin WindowManager resolves from its server URL
 *   (localhost in dev, corelive.app in prod).
 * @returns WindowManager-compatible mock object.
 * @example
 * createWindowManagerMock('http://localhost:4991')
 */
function createWindowManagerMock(origin = 'https://corelive.app') {
  return {
    getWebAppOrigin: () => origin,
    getMainWindow: () => null,
    hasMainWindow: () => false,
  }
}

/**
 * Builds a stand-in for an Electron renderer (`WebContents`) identified by its
 * `id` — all the initiator-scoping logic compares. Alive (`isDestroyed: false`).
 *
 * @param id - The `webContents.id` the OAuth flow keys its ticket/errors to.
 * @returns A WebContents-shaped stub accepted by the initiator parameters.
 * @example
 * oauthManager.getPendingSignInToken(fakeRenderer(11))
 */
function fakeRenderer(id: number) {
  return { id, isDestroyed: () => false } as never
}

describe('OAuthManager', () => {
  it('builds the OAuth start URL from the dev web-app origin', () => {
    const oauthManager = new OAuthManager(
      createWindowManagerMock('http://localhost:4991') as never,
      null,
    )

    expect(oauthManager.buildOAuthURL('google', 'state_123')).toBe(
      'http://localhost:4991/oauth/start?provider=google&state=state_123',
    )
  })

  it('builds the OAuth start URL from the production web-app origin', () => {
    const oauthManager = new OAuthManager(
      createWindowManagerMock('https://corelive.app') as never,
      null,
    )

    expect(oauthManager.buildOAuthURL('google', 'state_456')).toBe(
      'https://corelive.app/oauth/start?provider=google&state=state_456',
    )
  })
})

// The login window can START a sign-in, so the resulting ticket and any
// failure must come back to THAT window — not leak to the main window or strand
// the initiator on "Opening browser…" forever. These pin the targeting contract.
describe('OAuthManager initiator targeting', () => {
  beforeEach(() => {
    vi.mocked(typedSend).mockClear()
  })

  it('routes a provider-denied callback error to the window that started the flow', async () => {
    // Arrange: the login-window renderer (id 11) starts a Google flow.
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )
    const loginRenderer = fakeRenderer(11)
    const { state } = await oauthManager.startOAuthFlow('google', loginRenderer)

    // Act: the deep-link callback comes back as a denial for that state.
    await oauthManager.handleOAuthCallback(
      new URL(
        `corelive://oauth/callback?state=${state}&error=access_denied&error_description=User+denied+access`,
      ),
    )

    // Assert: the error is delivered to the initiating window — not broadcast to
    // the main renderer, which would leave the login window's CTA stuck "Opening…".
    expect(typedSend).toHaveBeenCalledWith(loginRenderer, 'oauth-error', {
      error: 'User denied access',
    })
  })

  it('hands the pending sign-in ticket only to the window that initiated it', () => {
    // Arrange: a ticket bound to the login-window renderer (id 11).
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )
    const loginRenderer = fakeRenderer(11)
    oauthManager.sendSignInToken('tok_login', 'google', loginRenderer)

    // Act + Assert: a DIFFERENT window (id 22) cannot consume the one-time
    // ticket — it gets null, and the ticket stays put for the rightful window.
    expect(oauthManager.getPendingSignInToken(fakeRenderer(22))).toBeNull()
    expect(oauthManager.getPendingSignInToken(loginRenderer)).toEqual({
      token: 'tok_login',
      provider: 'google',
    })
  })

  it('pushes the sign-in ticket to the initiating window with no main-window fallback', () => {
    // Arrange: a login-window-initiated flow (id 11); no main window exists (T18).
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )
    const loginRenderer = fakeRenderer(11)

    // Act
    oauthManager.sendSignInToken('tok_login', 'google', loginRenderer)

    // Assert: delivered to the initiator exactly once via the per-window send —
    // the retired main window gets no second, racing delivery of the one-time
    // ticket. This pins that deleting `sendToRenderer` removed only a redundant
    // path, not the live one.
    expect(typedSend).toHaveBeenCalledTimes(1)
    expect(typedSend).toHaveBeenCalledWith(
      loginRenderer,
      'clerk-sign-in-token',
      { token: 'tok_login', provider: 'google' },
    )
  })

  it('leaves an initiator-less ticket in the PULL store with no push, so a surviving panel claims it on mount', () => {
    // Arrange: a cold-boot OAuth callback arrives before any panel painted, so
    // there is no live initiator to push to and the main window is retired (T18).
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )

    // Act
    oauthManager.sendSignInToken('tok_coldboot', 'google')

    // Assert: nothing is pushed (no renderer, and no main fallback to broadcast
    // to), so the only delivery is the pull — proving the no-main path neither
    // loses the sign-in nor double-delivers the one-time ticket.
    expect(typedSend).not.toHaveBeenCalled()
    expect(oauthManager.getPendingSignInToken(fakeRenderer(7))).toEqual({
      token: 'tok_coldboot',
      provider: 'google',
    })
  })

  it('keeps an unbound ticket window-agnostic so a cold-boot panel can pull it', () => {
    // Arrange: a push with no initiator (a cold-boot callback before any panel
    // painted), the durable path now that the main window is retired.
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )
    oauthManager.sendSignInToken('tok_coldboot', 'google')

    // Act + Assert: any surviving panel may claim the unbound ticket, so a flow
    // whose initiator was gone by callback time still completes its sign-in.
    expect(oauthManager.getPendingSignInToken(fakeRenderer(99))).toEqual({
      token: 'tok_coldboot',
      provider: 'google',
    })
  })
})

describe('OAuthManager emitted channel surface', () => {
  beforeEach(() => {
    vi.mocked(typedSend).mockClear()
  })

  it('never emits oauth-success or oauth-complete-exchange on any OAuth outcome', async () => {
    // Arrange: one manager driven through BOTH live outcomes — a granted flow
    // that yields a sign-in ticket, and a provider denial that yields an error.
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )
    const loginRenderer = fakeRenderer(11)

    // Act: success path, then failure path.
    oauthManager.sendSignInToken('tok_login', 'google', loginRenderer)
    const { state } = await oauthManager.startOAuthFlow('google', loginRenderer)
    await oauthManager.handleOAuthCallback(
      new URL(
        `corelive://oauth/callback?state=${state}&error=access_denied&error_description=User+denied+access`,
      ),
    )

    // Assert: the emitted channel set is exactly the two the preload bridge
    // still listens for. `oauth-success` and `oauth-complete-exchange` lost
    // their senders in v0.14.0 and their listeners in v0.22.0; re-adding a send
    // without a listener would silently drop the sign-in, so this pins the set
    // rather than asserting one absence.
    const emittedChannels = vi
      .mocked(typedSend)
      .mock.calls.map((call) => call[1])
    expect(new Set(emittedChannels)).toEqual(
      new Set(['clerk-sign-in-token', 'oauth-error']),
    )
    expect(emittedChannels).not.toContain('oauth-success')
    expect(emittedChannels).not.toContain('oauth-complete-exchange')
  })
})

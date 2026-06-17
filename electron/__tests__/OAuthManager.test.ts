import { describe, expect, it, vi } from 'vitest'

import { OAuthManager } from '../OAuthManager'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
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

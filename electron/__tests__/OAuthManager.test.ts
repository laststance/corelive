import { describe, expect, it, vi } from 'vitest'

import { OAuthManager } from '../OAuthManager'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}))

/**
 * Creates a minimal WindowManager mock for OAuth URL tests.
 *
 * @param currentUrl - URL currently loaded in the main BrowserWindow.
 * @returns WindowManager-compatible mock object.
 * @example
 * createWindowManagerMock('http://localhost:3011/login')
 */
function createWindowManagerMock(currentUrl?: string) {
  return {
    getMainWindow: () =>
      currentUrl
        ? {
            webContents: {
              getURL: () => currentUrl,
            },
          }
        : null,
    hasMainWindow: () => Boolean(currentUrl),
  }
}

describe('OAuthManager', () => {
  it('builds the OAuth start URL from the current BrowserWindow origin in development', () => {
    const oauthManager = new OAuthManager(
      createWindowManagerMock('http://localhost:3011/login') as never,
      null,
    )

    expect(oauthManager.buildOAuthURL('google', 'state_123')).toBe(
      'http://localhost:3011/oauth/start?provider=google&state=state_123',
    )
  })

  it('falls back to the production origin when no BrowserWindow URL is available', () => {
    const oauthManager = new OAuthManager(
      createWindowManagerMock() as never,
      null,
    )

    expect(oauthManager.buildOAuthURL('google', 'state_456')).toBe(
      'https://corelive.app/oauth/start?provider=google&state=state_456',
    )
  })
})

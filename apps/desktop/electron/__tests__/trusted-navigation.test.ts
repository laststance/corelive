import { describe, expect, test } from 'vitest'

import {
  isTrustedAppNavigation,
  isTrustedClerkHandshake,
} from '../utils/isTrustedAppNavigation'

describe('preload document navigation boundary', () => {
  test.each([
    ['https://corelive.app/settings', 'https://corelive.app', true],
    ['https://www.corelive.app/login-shell', 'https://corelive.app', true],
    ['https://corelive.app/live-editor', 'https://www.corelive.app', true],
    ['http://localhost:4991/write', 'http://localhost:4991', true],
    ['http://127.0.0.1:4992/', 'http://localhost:4991', false],
    ['https://untrusted.example/', 'https://corelive.app', false],
    ['https://corelive.app.untrusted.example/', 'https://corelive.app', false],
    ['https://corelive.app:4992/', 'https://corelive.app', false],
    ['http://corelive.app/', 'https://corelive.app', false],
    ['file:///tmp/inert.html', 'https://corelive.app', false],
    ['https://fixture@corelive.app/', 'https://corelive.app', false],
    ['invalid-url', 'https://corelive.app', false],
  ])(
    'keeps native capabilities within the configured origin: %s',
    (destination, configured, allowed) => {
      // Arrange: each row identifies a real app document or an untrusted replacement.
      // Act
      const permitted = isTrustedAppNavigation(destination, configured)
      // Assert
      expect(permitted).toBe(allowed)
    },
  )
})

test.each([
  [
    'https://clerk.corelive.app/v1/client/handshake?redirect_url=https%3A%2F%2Fwww.corelive.app%2Flive-editor',
    'https://corelive.app',
    true,
  ],
  [
    'https://fixture.clerk.accounts.dev/v1/client/handshake?redirect_url=http%3A%2F%2Flocalhost%3A4991%2Flive-editor',
    'http://localhost:4991',
    true,
  ],
  [
    'https://clerk.corelive.app/v1/client/handshake?redirect_url=https%3A%2F%2Fexample.com',
    'https://corelive.app',
    false,
  ],
  [
    'https://clerk.corelive.app/v1/client/sign_ins?redirect_url=https%3A%2F%2Fcorelive.app',
    'https://corelive.app',
    false,
  ],
  [
    'https://fixture.clerk.accounts.dev/v1/client/handshake?redirect_url=https%3A%2F%2Fcorelive.app',
    'https://corelive.app',
    false,
  ],
  [
    'https://fixture.clerk.accounts.dev.evil.test/v1/client/handshake?redirect_url=http%3A%2F%2Flocalhost%3A4991',
    'http://localhost:4991',
    false,
  ],
])(
  'Clerk session refresh stays on its bounded provider endpoint and returns to the app (%s)',
  (url, origin, expected) => {
    // Act / Assert
    expect(isTrustedClerkHandshake(url, origin)).toBe(expected)
  },
)

import { expect, test, vi } from 'vitest'

import { log } from '../logger'

import { claimDefaultProtocolClient } from './claimDefaultProtocolClient'

vi.mock('../logger', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

/**
 * Builds the two-method slice of Electron's `app` the claim helper depends on,
 * defaulting to "another bundle owns the scheme and the OS accepts our claim".
 *
 * @param overrides - Per-test LaunchServices answers.
 * @returns A fake `app` accepted by {@link claimDefaultProtocolClient}.
 * @example
 * fakeApp({ isDefaultProtocolClient: vi.fn(() => true) })
 */
function fakeApp(
  overrides: Partial<Parameters<typeof claimDefaultProtocolClient>[0]> = {},
): Parameters<typeof claimDefaultProtocolClient>[0] {
  return {
    isDefaultProtocolClient: vi.fn(() => false),
    setAsDefaultProtocolClient: vi.fn(() => true),
    ...overrides,
  }
}

test('leaves LaunchServices untouched when this app already owns the scheme', () => {
  // Arrange
  const app = fakeApp({ isDefaultProtocolClient: vi.fn(() => true) })

  // Act
  const isDefaultHandler = claimDefaultProtocolClient(app, 'corelive')

  // Assert
  expect(isDefaultHandler).toBe(true)
  expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
})

test('claims the scheme for this app when another bundle currently owns it', () => {
  // Arrange: a dev Electron (com.corelive.app.dev) took corelive:// last run.
  const app = fakeApp()

  // Act
  const isDefaultHandler = claimDefaultProtocolClient(app, 'corelive')

  // Assert
  expect(isDefaultHandler).toBe(true)
  expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('corelive')
  expect(log.warn).not.toHaveBeenCalled()
})

test('reports a refused claim with a warning instead of throwing', () => {
  // Arrange: LaunchServices rejects the claim (scheme not declared in the bundle).
  const app = fakeApp({ setAsDefaultProtocolClient: vi.fn(() => false) })

  // Act
  const isDefaultHandler = claimDefaultProtocolClient(app, 'corelive')

  // Assert
  expect(isDefaultHandler).toBe(false)
  expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('corelive://'))
})

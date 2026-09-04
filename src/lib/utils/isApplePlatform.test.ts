/**
 * @fileoverview Shortcut-copy platform check. If these fail, the editor tells a
 * Windows visitor to press ⌘ (a key their keyboard does not have), or tells a
 * Mac user Ctrl — and the server render disagrees with the client, which React
 * reports as a hydration mismatch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Reports the given user agent for one assertion.
 * @param userAgent - UA string the browser should claim.
 * @returns Nothing; `afterEach` restores the real navigator.
 * @example
 * mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
 */
function mockUserAgent(userAgent: string): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isApplePlatform', () => {
  it('reads a Mac as Apple, so the shortcut hint says ⌘', async () => {
    // Arrange
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    )
    const { isApplePlatform } = await import('./isApplePlatform')

    // Act / Assert
    expect(isApplePlatform()).toBe(true)
  })

  it('reads an iPhone as Apple, so the touch surface agrees with the desktop', async () => {
    // Arrange
    mockUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
    )
    const { isApplePlatform } = await import('./isApplePlatform')

    // Act / Assert
    expect(isApplePlatform()).toBe(true)
  })

  it('reads Windows as not Apple, so the hint says Ctrl', async () => {
    // Arrange
    mockUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126',
    )
    const { isApplePlatform } = await import('./isApplePlatform')

    // Act / Assert
    expect(isApplePlatform()).toBe(false)
  })

  it('assumes Apple with no navigator at all, so the server render matches the ⌘ default', async () => {
    // Arrange — the server has no navigator; the client corrects after mount.
    const { isApplePlatform } = await import('./isApplePlatform')
    const realNavigator = globalThis.navigator
    Reflect.deleteProperty(globalThis, 'navigator')

    // Act
    const result = isApplePlatform()

    // Assert
    expect(result).toBe(true)
    Object.defineProperty(globalThis, 'navigator', {
      value: realNavigator,
      configurable: true,
    })
  })
})

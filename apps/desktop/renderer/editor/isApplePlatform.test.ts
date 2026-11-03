/**
 * @fileoverview Shortcut-copy platform check. If these fail, the editor tells a
 * Windows visitor to press ⌘ (a key their keyboard does not have), or tells a
 * Mac user Ctrl — and the server render disagrees with the client, which React
 * reports as a hydration mismatch.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'

import { isApplePlatform } from './isApplePlatform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isApplePlatform', () => {
  test('reads a Mac as Apple, so the shortcut hint says ⌘', () => {
    // Arrange
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    })

    // Act / Assert
    expect(isApplePlatform()).toBe(true)
  })

  test('reads an iPhone as Apple, so the touch surface agrees with the desktop', () => {
    // Arrange
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
    })

    // Act / Assert
    expect(isApplePlatform()).toBe(true)
  })

  test('reads Windows as not Apple, so the hint says Ctrl', () => {
    // Arrange
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126',
    })

    // Act / Assert
    expect(isApplePlatform()).toBe(false)
  })

  test('assumes Apple with no navigator at all, so the server render matches the ⌘ default', () => {
    // Arrange — the server has no navigator; the client corrects after mount.
    vi.stubGlobal('navigator', undefined)

    // Act
    const result = isApplePlatform()

    // Assert
    expect(result).toBe(true)
  })
})

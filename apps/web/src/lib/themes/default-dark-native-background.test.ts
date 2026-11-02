import { formatHex, parse } from 'culori'
import { describe, expect, test } from 'vitest'

import { THEME_REGISTRY, isStaticTheme } from './registry'

describe('Default dark --background', () => {
  test('formats to #0a0a0a, the login window pre-paint color in apps/desktop/electron/constants.ts', () => {
    // Arrange
    const seed = THEME_REGISTRY['dark']
    const background = isStaticTheme(seed)
      ? seed.tokens['--background']
      : undefined

    // Act
    const hex = formatHex(parse(background ?? ''))

    // Assert
    expect(
      hex,
      'Default dark --background changed: update LOGIN_WINDOW_BACKGROUND_DARK in apps/desktop/electron/constants.ts to match',
    ).toBe('#0a0a0a')
  })
})

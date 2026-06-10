import { describe, it, expect } from 'vitest'

import { THEMES, THEME_META } from './ThemeProvider'

describe('ThemeProvider picker metadata', () => {
  it('derives picker metadata from the registry for every theme, matching the Warm Cathedral defaults', () => {
    // Arrange / Act / Assert — hard-coded so the derived (`as`-cast) map can never silently drift
    expect(THEME_META).toEqual({
      light: { name: 'Light', preview: '#ffffff' },
      dark: { name: 'Dark', preview: '#1a1a1a' },
    })
  })

  it('exposes a metadata entry for every available theme id, so pickers never hit an undefined entry', () => {
    // Arrange
    const metadataKeys = Object.keys(THEME_META).sort()

    // Act
    const availableThemeIds = [...THEMES].sort()

    // Assert — the documented cast asserts this; lock it so a dropped key fails loudly
    expect(metadataKeys).toEqual(availableThemeIds)
  })
})

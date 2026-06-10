import { describe, it, expect } from 'vitest'

import { THEMES, THEME_META } from './ThemeProvider'

describe('ThemeProvider picker metadata', () => {
  it('derives picker metadata from the registry for every theme, matching the Warm Cathedral defaults and the colored families', () => {
    // Arrange / Act / Assert — hard-coded so the derived (`as`-cast) map can never silently drift
    expect(THEME_META).toEqual({
      light: { name: 'Light', preview: '#ffffff' },
      dark: { name: 'Dark', preview: '#1a1a1a' },
      'harbor-light': { name: 'Harbor Light', preview: '#2776be' },
      'harbor-dark': { name: 'Harbor Dark', preview: '#57a3ef' },
      'grove-light': { name: 'Grove Light', preview: '#3b8040' },
      'grove-dark': { name: 'Grove Dark', preview: '#70b972' },
      'rose-tea-light': { name: 'Rose Tea Light', preview: '#b84c55' },
      'rose-tea-dark': { name: 'Rose Tea Dark', preview: '#ed7f84' },
      'iris-light': { name: 'Iris Light', preview: '#7764ba' },
      'iris-dark': { name: 'Iris Dark', preview: '#a795ef' },
      'graphite-light': { name: 'Graphite Light', preview: '#4d5660' },
      'graphite-dark': { name: 'Graphite Dark', preview: '#9ba6b2' },
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

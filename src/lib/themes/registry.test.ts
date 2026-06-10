import { describe, it, expect } from 'vitest'

import {
  THEME_REGISTRY,
  THEME_IDS,
  DEFAULT_THEME_ID,
  isThemeId,
  getThemeMode,
} from './registry'

describe('theme registry', () => {
  it('ships the Warm Cathedral light and dark as the default family', () => {
    // Arrange / Act
    const ids = THEME_IDS

    // Assert
    expect(ids).toEqual(['light', 'dark'])
    expect(THEME_REGISTRY.light.family).toBe('cathedral')
    expect(THEME_REGISTRY.dark.family).toBe('cathedral')
  })

  it('locks each default theme name, preview swatch, id, and mode', () => {
    // Arrange / Act / Assert — load-bearing display + self-referential fields
    expect(THEME_REGISTRY.light).toMatchObject({
      id: 'light',
      mode: 'light',
      name: 'Light',
      preview: '#ffffff',
    })
    expect(THEME_REGISTRY.dark).toMatchObject({
      id: 'dark',
      mode: 'dark',
      name: 'Dark',
      preview: '#1a1a1a',
    })
  })

  it('preserves every default theme byte-for-byte so the brand never drifts', () => {
    // Arrange / Act / Assert — cathedral CSS is hand-authored, never regenerated
    expect(THEME_REGISTRY.light.preserve).toBe(true)
    expect(THEME_REGISTRY.dark.preserve).toBe(true)
  })

  it('pairs each theme with a matching color-scheme', () => {
    // Arrange / Act / Assert
    expect(THEME_REGISTRY.light.colorScheme).toBe('light')
    expect(THEME_REGISTRY.dark.colorScheme).toBe('dark')
  })

  it('applies light when nothing has been chosen', () => {
    // Arrange / Act / Assert
    expect(DEFAULT_THEME_ID).toBe('light')
  })
})

describe('isThemeId — guards persisted and unknown ids', () => {
  it('accepts a registered theme id', () => {
    // Arrange / Act / Assert
    expect(isThemeId('light')).toBe(true)
    expect(isThemeId('dark')).toBe(true)
  })

  it('rejects an unregistered id so a stale localStorage value cannot apply', () => {
    // Arrange / Act / Assert
    expect(isThemeId('harbor-dark')).toBe(false)
    expect(isThemeId('bogus')).toBe(false)
  })

  it('rejects non-strings and inherited object keys', () => {
    // Arrange / Act / Assert
    expect(isThemeId(undefined)).toBe(false)
    expect(isThemeId(null)).toBe(false)
    expect(isThemeId(123)).toBe(false)
    // `toString` lives on the prototype — Object.hasOwn must exclude it
    expect(isThemeId('toString')).toBe(false)
  })
})

describe('getThemeMode — resolves a theme id to its light/dark axis', () => {
  it('reads dark from the dark id and any -dark suffix', () => {
    // Arrange / Act / Assert
    expect(getThemeMode('dark')).toBe('dark')
    expect(getThemeMode('harbor-dark')).toBe('dark')
  })

  it('reads light from the light id and any non-dark id', () => {
    // Arrange / Act / Assert
    expect(getThemeMode('light')).toBe('light')
    expect(getThemeMode('harbor-light')).toBe('light')
  })

  it('falls back to light before hydration when the id is undefined', () => {
    // Arrange / Act / Assert
    expect(getThemeMode(undefined)).toBe('light')
  })
})

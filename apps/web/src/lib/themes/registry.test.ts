import { describe, test, expect } from 'vitest'

import {
  THEME_REGISTRY,
  THEME_IDS,
  THEME_FAMILY_IDS,
  THEME_FAMILY_LABEL,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_PREFERENCE,
  LEGACY_THEME_ID_ALIASES,
  normalizeThemePreference,
  isThemeId,
  isDerivedTheme,
  isStaticTheme,
  getThemeMode,
  getThemeId,
} from './registry'

describe('theme registry', () => {
  test('gives the flat light and dark ids to the Default family and cathedral-* ids to Warm Cathedral', () => {
    // Arrange / Act / Assert — System can only resolve to the names light/dark, so
    // Default must own them; Warm Cathedral is an ordinary selectable family
    expect(THEME_REGISTRY.light.family).toBe('default')
    expect(THEME_REGISTRY.dark.family).toBe('default')
    expect(THEME_REGISTRY['cathedral-light'].family).toBe('cathedral')
    expect(THEME_REGISTRY['cathedral-dark'].family).toBe('cathedral')
  })

  test('registers exactly the fourteen shipped themes (Default + cathedral + five colored families × two modes)', () => {
    // Arrange / Act / Assert — the full shipped set, hard-coded so an accidental
    // add or drop of a family/mode is caught (Default first, then cathedral, then
    // the colored families)
    expect(THEME_IDS).toEqual([
      'light',
      'dark',
      'cathedral-light',
      'cathedral-dark',
      'harbor-light',
      'harbor-dark',
      'grove-light',
      'grove-dark',
      'rose-tea-light',
      'rose-tea-dark',
      'iris-light',
      'iris-dark',
      'graphite-light',
      'graphite-dark',
    ])
  })

  test('pairs a light and a dark theme for every family', () => {
    // Arrange — collect the modes registered under each family
    const modesByFamily = new Map<string, Set<string>>()
    for (const id of THEME_IDS) {
      const { family, mode } = THEME_REGISTRY[id]
      const modes = modesByFamily.get(family) ?? new Set<string>()
      modes.add(mode)
      modesByFamily.set(family, modes)
    }

    // Assert — seven families, each with both a light and a dark
    expect(modesByFamily.size).toBe(7)
    for (const [family, modes] of modesByFamily) {
      expect(modes, `family ${family}`).toEqual(new Set(['light', 'dark']))
    }
  })

  test('keys every entry by the id its family and mode produce', () => {
    // Arrange / Act / Assert — the map key, the `id` field, and getThemeId all agree
    for (const id of THEME_IDS) {
      const theme = THEME_REGISTRY[id]
      expect(theme.id).toBe(id)
      expect(getThemeId(theme.family, theme.mode)).toBe(id)
    }
  })

  test('marks cathedral preserved and every other family generator-emitted', () => {
    // Arrange / Act / Assert — preserve drives whether the generator emits the CSS
    const emitted = THEME_IDS.filter(
      (id) => THEME_REGISTRY[id].family !== 'cathedral',
    )
    expect(emitted).toHaveLength(12)
    for (const id of emitted) {
      expect(THEME_REGISTRY[id].preserve, id).toBe(false)
    }
  })

  test('lists the stock shadcn Default family first in the palette picker', () => {
    // Arrange / Act / Assert — THEME_FAMILY_LABEL insertion order IS the picker order
    expect(THEME_FAMILY_IDS[0]).toBe('default')
    expect(THEME_FAMILY_LABEL.default).toBe('Default')
    expect(THEME_FAMILY_IDS[1]).toBe('cathedral')
  })

  test('ships the shadcn neutral palette verbatim as the Default family, static not derived', () => {
    // Arrange / Act / Assert — hard-coded from ui.shadcn.com/r/colors/neutral.json
    expect(THEME_REGISTRY.light.tokens['--background']).toBe('oklch(1 0 0)')
    expect(THEME_REGISTRY.light.tokens['--primary']).toBe('oklch(0.205 0 0)')
    expect(THEME_REGISTRY.dark.tokens['--background']).toBe('oklch(0.145 0 0)')
    expect(THEME_REGISTRY.dark.tokens['--primary']).toBe('oklch(0.922 0 0)')
    // The kind guards are what the generator / preview / a11y tests branch on
    expect(isStaticTheme(THEME_REGISTRY.light)).toBe(true)
    expect(isDerivedTheme(THEME_REGISTRY.light)).toBe(false)
    expect(isStaticTheme(THEME_REGISTRY['harbor-light'])).toBe(false)
    expect(isDerivedTheme(THEME_REGISTRY['harbor-light'])).toBe(true)
    expect(isStaticTheme(THEME_REGISTRY['cathedral-light'])).toBe(false)
    expect(isDerivedTheme(THEME_REGISTRY['cathedral-light'])).toBe(false)
  })

  test('makes the stock shadcn Default family the concrete default id, not Warm Cathedral', () => {
    // Arrange / Act / Assert — the applied default is the neutral pair
    expect(DEFAULT_THEME_ID).toBe('light')
    expect(THEME_REGISTRY[DEFAULT_THEME_ID].family).toBe('default')
  })

  test('follows the OS when nothing has been chosen', () => {
    // Arrange / Act / Assert — fresh-state preference is System, not a fixed id
    expect(DEFAULT_THEME_PREFERENCE).toBe('system')
  })

  test('locks each Default theme name, preview swatch, id, and mode', () => {
    // Arrange / Act / Assert — load-bearing display + self-referential fields
    expect(THEME_REGISTRY.light).toMatchObject({
      id: 'light',
      mode: 'light',
      name: 'Default Light',
      preview: '#ffffff',
    })
    expect(THEME_REGISTRY.dark).toMatchObject({
      id: 'dark',
      mode: 'dark',
      name: 'Default Dark',
      preview: '#0a0a0a',
    })
  })

  test('preserves both Warm Cathedral themes byte-for-byte so the brand never drifts', () => {
    // Arrange / Act / Assert — cathedral CSS is hand-authored, never regenerated
    expect(THEME_REGISTRY['cathedral-light'].preserve).toBe(true)
    expect(THEME_REGISTRY['cathedral-dark'].preserve).toBe(true)
  })

  test('pairs each theme with a matching color-scheme', () => {
    // Arrange / Act / Assert
    expect(THEME_REGISTRY.light.colorScheme).toBe('light')
    expect(THEME_REGISTRY.dark.colorScheme).toBe('dark')
    expect(THEME_REGISTRY['cathedral-dark'].colorScheme).toBe('dark')
  })
})

describe('isThemeId — guards persisted and unknown ids', () => {
  test('accepts a registered theme id', () => {
    // Arrange / Act / Assert — Default flat ids, cathedral-* and colored family ids alike
    expect(isThemeId('light')).toBe(true)
    expect(isThemeId('dark')).toBe(true)
    expect(isThemeId('cathedral-dark')).toBe(true)
    expect(isThemeId('harbor-dark')).toBe(true)
    expect(isThemeId('graphite-light')).toBe(true)
  })

  test('rejects the retired default-* aliases because they are no longer ids', () => {
    // Arrange / Act / Assert — aliases are read-side only, never valid ids
    expect(isThemeId('default-light')).toBe(false)
    expect(isThemeId('default-dark')).toBe(false)
  })

  test('rejects an unregistered id so a stale localStorage value cannot apply', () => {
    // Arrange / Act / Assert — a bare family name is not an id; a dropped family is gone
    expect(isThemeId('harbor')).toBe(false)
    expect(isThemeId('sunset-dark')).toBe(false)
    expect(isThemeId('bogus')).toBe(false)
  })

  test('rejects non-strings and inherited object keys', () => {
    // Arrange / Act / Assert
    expect(isThemeId(undefined)).toBe(false)
    expect(isThemeId(null)).toBe(false)
    expect(isThemeId(123)).toBe(false)
    // `toString` lives on the prototype — Object.hasOwn must exclude it
    expect(isThemeId('toString')).toBe(false)
  })
})

describe('getThemeMode — resolves a theme id to its light/dark axis', () => {
  test('reads dark from the dark id and any -dark suffix', () => {
    // Arrange / Act / Assert
    expect(getThemeMode('dark')).toBe('dark')
    expect(getThemeMode('harbor-dark')).toBe('dark')
    expect(getThemeMode('cathedral-dark')).toBe('dark')
  })

  test('reads light from the light id and any non-dark id', () => {
    // Arrange / Act / Assert
    expect(getThemeMode('light')).toBe('light')
    expect(getThemeMode('harbor-light')).toBe('light')
    expect(getThemeMode('grove-light')).toBe('light')
  })

  test('falls back to light before hydration when the id is undefined', () => {
    // Arrange / Act / Assert
    expect(getThemeMode(undefined)).toBe('light')
  })
})

describe('getThemeId — builds the stored id for a (family, mode) pair', () => {
  test('maps the Default family to the flat light and dark ids', () => {
    // Arrange / Act / Assert — Default owns the flat ids so System resolves to it
    expect(getThemeId('default', 'light')).toBe('light')
    expect(getThemeId('default', 'dark')).toBe('dark')
  })

  test('maps Warm Cathedral to cathedral-light and cathedral-dark like every other family', () => {
    // Arrange / Act / Assert
    expect(getThemeId('cathedral', 'light')).toBe('cathedral-light')
    expect(getThemeId('cathedral', 'dark')).toBe('cathedral-dark')
  })

  test('builds a hyphenated id for a colored family and mode', () => {
    // Arrange / Act / Assert — the two-axis picker turns (family, mode) into an id
    expect(getThemeId('harbor', 'dark')).toBe('harbor-dark')
    expect(getThemeId('grove', 'light')).toBe('grove-light')
    expect(getThemeId('rose-tea', 'dark')).toBe('rose-tea-dark')
  })
})

describe('normalizeThemePreference — one stored-value contract for web and desktop', () => {
  test.each([
    [undefined, 'system'],
    [null, 'system'],
    [42, 'system'],
    ['', 'system'],
    ['   ', 'system'],
    ['system', 'system'],
    ['light', 'light'],
    ['dark', 'dark'],
    ['default-light', 'light'],
    ['default-dark', 'dark'],
    ['cathedral-light', 'cathedral-light'],
    ['cathedral-dark', 'cathedral-dark'],
    ['harbor-dark', 'harbor-dark'],
    ['graphite-light', 'graphite-light'],
    ['cathedral-lite', 'system'],
    ['warm-cathedral-light', 'system'],
    ['toString', 'system'],
  ])('maps stored %j to %j', (stored, expected) => {
    // Arrange / Act
    const normalized = normalizeThemePreference(stored)

    // Assert
    expect(normalized).toBe(expected)
  })

  test('exposes exactly the two default-* legacy aliases', () => {
    // Arrange / Act / Assert
    expect(LEGACY_THEME_ID_ALIASES).toEqual({
      'default-light': 'light',
      'default-dark': 'dark',
    })
    expect(Object.isFrozen(LEGACY_THEME_ID_ALIASES)).toBe(true)
  })
})

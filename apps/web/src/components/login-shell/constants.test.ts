import { describe, expect, test } from 'vitest'

import { LOGIN_RIBBON_LEVEL_FILLS } from './constants'

describe('LOGIN_RIBBON_LEVEL_FILLS', () => {
  test('ramps 10-90% --primary over --muted so the login ribbon follows the active theme', () => {
    // Arrange: the theme-following ribbon contract (DES-2).

    // Act
    const fills = LOGIN_RIBBON_LEVEL_FILLS

    // Assert
    expect(fills).toEqual([
      'color-mix(in oklch, var(--primary) 10%, var(--muted))',
      'color-mix(in oklch, var(--primary) 30%, var(--muted))',
      'color-mix(in oklch, var(--primary) 50%, var(--muted))',
      'color-mix(in oklch, var(--primary) 70%, var(--muted))',
      'color-mix(in oklch, var(--primary) 90%, var(--muted))',
    ])
  })

  test('never reads the content-colour heatmap tokens, which would paint warm on Default', () => {
    // Arrange / Act
    const joined = LOGIN_RIBBON_LEVEL_FILLS.join(' ')

    // Assert
    expect(joined).not.toContain('--hm-')
  })
})

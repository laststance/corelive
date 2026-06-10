import { describe, it, expect } from 'vitest'

import { getThemePreview } from './preview'

/**
 * The picker preview is reconstructed at runtime (no culori), so it can silently
 * drift from the real generated CSS. These tests pin the reconstruction against
 * the actual `generated.css` (colored families) and `globals.css` (cathedral)
 * values — if the generator's derivation changes, the preview must change too or
 * a user would pick a theme whose chip lies about its colors.
 */
describe('theme preview swatches match the generated CSS the user will actually see', () => {
  it('reconstructs a colored light family exactly from its seed (harbor-light)', () => {
    // Arrange / Act
    const preview = getThemePreview('harbor-light')

    // Assert — byte-for-byte equal to generated.css :root[data-theme='harbor-light']
    expect(preview.surface).toBe('oklch(0.975 0.012 250)') // --background
    expect(preview.card).toBe('oklch(0.972 0.012 250)') // --card
    expect(preview.accent).toBe('oklch(0.555 0.135 250)') // --primary
    expect(preview.text).toBe('oklch(0.18 0.012 250)') // --foreground
    expect(preview.heatmap).toEqual([
      'oklch(0.96 0.008 235)', // --hm-0
      'oklch(0.89 0.06 220)', // --hm-1
      'oklch(0.78 0.11 95)', // --hm-2
      'oklch(0.65 0.14 60)', // --hm-3
      'oklch(0.55 0.16 42)', // --hm-4
    ])
  })

  it('reconstructs a colored dark family exactly from its seed (grove-dark)', () => {
    // Arrange / Act
    const preview = getThemePreview('grove-dark')

    // Assert — byte-for-byte equal to generated.css :root[data-theme='grove-dark']
    expect(preview.surface).toBe('oklch(0.172 0.014 145)') // --background
    expect(preview.card).toBe('oklch(0.235 0.014 145)') // --card
    expect(preview.accent).toBe('oklch(0.72 0.125 145)') // --primary
    expect(preview.text).toBe('oklch(0.96 0.014 145)') // --foreground
    expect(preview.heatmap).toEqual([
      'oklch(0.22 0.012 140)', // --hm-0
      'oklch(0.32 0.06 132)', // --hm-1
      'oklch(0.45 0.1 95)', // --hm-2
      'oklch(0.58 0.13 65)', // --hm-3
      'oklch(0.7 0.15 42)', // --hm-4
    ])
  })

  it('returns Warm Cathedral light swatches verbatim from globals.css', () => {
    // Arrange / Act
    const preview = getThemePreview('light')

    // Assert — cathedral has per-token neutral chroma, so it is hand-authored
    expect(preview.surface).toBe('oklch(0.975 0.016 80)')
    expect(preview.card).toBe('oklch(0.972 0.018 78)')
    expect(preview.accent).toBe('oklch(0.62 0.16 50)')
    expect(preview.text).toBe('oklch(0.18 0.015 30)')
    expect(preview.heatmap[4]).toBe('oklch(0.55 0.16 40)') // warm apex
  })

  it('returns Warm Cathedral dark swatches verbatim from globals.css', () => {
    // Arrange / Act
    const preview = getThemePreview('dark')

    // Assert
    expect(preview.surface).toBe('oklch(0.172 0.026 40)')
    expect(preview.card).toBe('oklch(0.235 0.028 44)')
    expect(preview.accent).toBe('oklch(0.7 0.16 55)')
    expect(preview.text).toBe('oklch(0.96 0.005 75)')
    expect(preview.heatmap[4]).toBe('oklch(0.7 0.15 65)') // warm apex
  })

  it('always produces a 5-stop heatmap ramp for every theme', () => {
    // Arrange / Act / Assert — the strip the picker renders is always 5 cells
    expect(getThemePreview('iris-light').heatmap).toHaveLength(5)
    expect(getThemePreview('graphite-dark').heatmap).toHaveLength(5)
  })
})

import { describe, it, expect } from 'vitest'

import {
  CATHEDRAL,
  deriveThemeTokens,
} from '../../../scripts/generate-theme-css'

import { getThemePreview } from './preview'
import {
  THEME_REGISTRY,
  type DerivedTheme,
  type ThemeId,
  type ThemeSeed,
} from './registry'

/**
 * The picker preview is reconstructed at runtime WITHOUT culori (preview.ts must
 * stay off the client bundle's color-math path), so it keeps its OWN copy of the
 * cathedral lightness/chroma ladder. That copy can silently drift from the
 * build-time generator — and if it does, the chip lies about the theme the user
 * is about to pick.
 *
 * These tests are the real pin the preview docstrings promise: every swatch is
 * cross-checked against the generator's OWN output — `deriveThemeTokens` for the
 * colored families (the source of generated.css) and the exported `CATHEDRAL` map
 * for the hand-authored default — so any preview↔generator divergence fails CI.
 * (The two formatters are independent — preview interpolates raw OKLCH numbers,
 * the generator rounds via `formatOklch` — so a green run also proves they agree
 * byte-for-byte across the entire shipped set.)
 */

/** Reads a derived token, throwing on a missing key so a typo fails loud (not as `undefined`). */
function tokenOf(tokens: Record<string, string>, key: string): string {
  const value = tokens[key]
  if (value === undefined) throw new Error(`Derived tokens missing ${key}`)
  return value
}

/** Asserts one theme's preview equals the five swatch tokens the generator emits for that id. */
function expectPreviewMatchesTokens(
  id: ThemeId,
  tokens: Record<string, string>,
): void {
  const preview = getThemePreview(id)
  expect(preview.surface).toBe(tokenOf(tokens, '--background'))
  expect(preview.card).toBe(tokenOf(tokens, '--card'))
  expect(preview.accent).toBe(tokenOf(tokens, '--primary'))
  expect(preview.text).toBe(tokenOf(tokens, '--foreground'))
  expect(preview.heatmap).toEqual([
    tokenOf(tokens, '--hm-0'),
    tokenOf(tokens, '--hm-1'),
    tokenOf(tokens, '--hm-2'),
    tokenOf(tokens, '--hm-3'),
    tokenOf(tokens, '--hm-4'),
  ])
}

// Widen from the `satisfies`-typed registry to ThemeSeed so the `is DerivedTheme`
// predicate is assignable, then keep only the colored (preserve:false) families.
const ALL_THEMES: ThemeSeed[] = Object.values(THEME_REGISTRY)
const DERIVED_THEMES = ALL_THEMES.filter(
  (theme): theme is DerivedTheme => !theme.preserve,
)

describe('theme preview swatches match the generated CSS the user will actually see', () => {
  it('covers all 10 colored families (5 families × light + dark)', () => {
    // Arrange / Act / Assert — guard against it.each([]) passing vacuously if the
    // registry empties or the preserve filter regresses.
    expect(DERIVED_THEMES).toHaveLength(10)
  })

  it.each(DERIVED_THEMES)(
    '$id preview equals the generator-derived tokens (no drift from generated.css)',
    (theme) => {
      // Arrange — the generator is the source of truth for colored families
      const tokens = deriveThemeTokens(theme)
      // Act / Assert — every swatch maps to the exact emitted token
      expectPreviewMatchesTokens(theme.id, tokens)
    },
  )

  it('resolves harbor-light to its exact derived swatches', () => {
    // A human-readable anchor with hard-coded expecteds — the cross-check above is
    // the drift guard; this documents one concrete result so a deliberate seed
    // change surfaces as a reviewable value diff (not a silent relational pass).
    // Arrange / Act
    const preview = getThemePreview('harbor-light')

    // Assert — generated.css :root[data-theme='harbor-light']
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

  it.each(['light', 'dark'] as const)(
    'cathedral %s preview equals the generator-exported CATHEDRAL map (verbatim globals.css)',
    (mode) => {
      // Arrange — cathedral is hand-authored; the generator mirrors globals.css in
      // CATHEDRAL, and the default family uses the FLAT id ('light'/'dark').
      const id: ThemeId = mode
      // Act / Assert
      expectPreviewMatchesTokens(id, CATHEDRAL[mode])
    },
  )

  it('always produces a 5-stop heatmap ramp for every theme', () => {
    // Arrange / Act / Assert — the strip the picker renders is always 5 cells
    expect(getThemePreview('iris-light').heatmap).toHaveLength(5)
    expect(getThemePreview('graphite-dark').heatmap).toHaveLength(5)
  })
})

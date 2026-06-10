import { converter } from 'culori'
import { describe, it, expect } from 'vitest'

import {
  deriveThemeTokens,
  deriveThemeCss,
  generateThemesCss,
  type DerivationSeed,
} from '../../../scripts/generate-theme-css'

import { contrastRatio, meetsAA } from './contrast'
import { THEME_REGISTRY, type DerivedTheme } from './registry'

const toOklch = converter('oklch')

/**
 * A sample colored seed — NOT shipped (no colored family is registered until T7,
 * each with its own AA gate). It exercises the derivation end-to-end: a blue-ish
 * accent, cool near-neutral surfaces, and a heatmap that rests cool (235) and
 * warms to the shared apex (42). accentL is chosen with AA headroom (mid-L
 * accents can leave neither black nor white text clearing 4.5).
 */
const SAMPLE_LIGHT: DerivationSeed = {
  mode: 'light',
  accentL: 0.5,
  accentChroma: 0.135,
  accentHue: 250,
  neutralChroma: 0.012,
  neutralHue: 250,
  heatmapHues: [235, 220, 95, 60, 42],
}
const SAMPLE_DARK: DerivationSeed = {
  ...SAMPLE_LIGHT,
  mode: 'dark',
  accentL: 0.7,
}

/**
 * A full derived theme (seed + identity) used only to exercise the CSS emission
 * mechanics. Until T7 registers a colored family the only type-valid ThemeId
 * values are 'light'/'dark'; this borrows 'dark' purely to render a block. The
 * real cathedral dark is preserved (skipped by the generator), so this synthetic
 * block never ships.
 */
const SAMPLE_DERIVED_THEME: DerivedTheme = {
  ...SAMPLE_DARK,
  family: 'cathedral',
  id: 'dark',
  name: 'Sample Derived',
  preview: '#000000',
  colorScheme: 'dark',
  preserve: false,
}

const HEATMAP_TOKENS = [
  '--hm-0',
  '--hm-1',
  '--hm-2',
  '--hm-3',
  '--hm-4',
] as const

/** Reads a required token's value or fails loudly (avoids non-null assertions). */
const token = (tokens: Record<string, string>, key: string): string => {
  const value = tokens[key]
  if (value === undefined) throw new Error(`missing token ${key}`)
  return value
}

/** OKLCH lightness of a token value (for the heatmap monotonic checks). */
const lightnessOf = (oklchValue: string): number => {
  const parsed = toOklch(oklchValue)
  if (!parsed) throw new Error(`unparsable color ${oklchValue}`)
  return parsed.l
}

/** OKLCH lightness/chroma/hue of a token value (achromatic hue falls back to 0). */
const oklchOf = (oklchValue: string): { l: number; c: number; h: number } => {
  const parsed = toOklch(oklchValue)
  if (!parsed) throw new Error(`unparsable color ${oklchValue}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0 }
}

describe('deriveThemeTokens — classification map', () => {
  it('tints a neutral surface with the family hue/chroma at the cathedral lightness', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — keeps cathedral --background L (0.975), applies neutral chroma + hue
    expect(tokens['--background']).toBe('oklch(0.975 0.012 250)')
  })

  it('paints accent tokens (and ring) from the seed signature color', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — cathedral makes --ring equal --primary, so both take the accent
    expect(tokens['--primary']).toBe('oklch(0.5 0.135 250)')
    expect(tokens['--ring']).toBe('oklch(0.5 0.135 250)')
  })

  it('keeps the warm chart and destructive identity fixed across families', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — fixed-identity tokens emit the cathedral value unchanged
    expect(tokens['--destructive']).toBe('oklch(0.6 0.2 25)')
    expect(tokens['--chart-1']).toBe('oklch(0.62 0.16 50)')
  })

  it('preserves a translucent dark border instead of making it opaque', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_DARK)

    // Assert — cathedral dark --border alpha (8%) is kept; only hue/chroma tint
    expect(tokens['--border']).toBe('oklch(1 0.012 250 / 8%)')
  })
})

describe('deriveThemeTokens — WCAG AA', () => {
  it('clears AA for body text on every core surface in light mode', () => {
    // Arrange / Act
    const t = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert
    expect(meetsAA(token(t, '--foreground'), token(t, '--background'))).toBe(
      true,
    )
    expect(meetsAA(token(t, '--card-foreground'), token(t, '--card'))).toBe(
      true,
    )
    expect(meetsAA(token(t, '--muted-foreground'), token(t, '--muted'))).toBe(
      true,
    )
    expect(
      meetsAA(token(t, '--primary-foreground'), token(t, '--primary')),
    ).toBe(true)
  })

  it('clears AA for body text on every core surface in dark mode', () => {
    // Arrange / Act
    const t = deriveThemeTokens(SAMPLE_DARK)

    // Assert
    expect(meetsAA(token(t, '--foreground'), token(t, '--background'))).toBe(
      true,
    )
    expect(meetsAA(token(t, '--card-foreground'), token(t, '--card'))).toBe(
      true,
    )
    expect(meetsAA(token(t, '--muted-foreground'), token(t, '--muted'))).toBe(
      true,
    )
    expect(
      meetsAA(token(t, '--primary-foreground'), token(t, '--primary')),
    ).toBe(true)
  })
})

describe('deriveThemeTokens — heatmap temperature ramp', () => {
  it('darkens monotonically as completions rise in light mode', () => {
    // Arrange / Act — light heatmap cools (high L) → warms (low L)
    const t = deriveThemeTokens(SAMPLE_LIGHT)
    const lightness = HEATMAP_TOKENS.map((k) => lightnessOf(token(t, k)))

    // Assert — strictly decreasing L (rest is palest, apex is deepest)
    const strictlyDecreasing = lightness.every(
      (l, i) => i === 0 || l < lightness[i - 1]!,
    )
    expect(strictlyDecreasing).toBe(true)
  })

  it('lightens monotonically as completions rise in dark mode', () => {
    // Arrange / Act — dark heatmap glows brighter toward the apex
    const t = deriveThemeTokens(SAMPLE_DARK)
    const lightness = HEATMAP_TOKENS.map((k) => lightnessOf(token(t, k)))

    // Assert — strictly increasing L
    const strictlyIncreasing = lightness.every(
      (l, i) => i === 0 || l > lightness[i - 1]!,
    )
    expect(strictlyIncreasing).toBe(true)
  })

  it('rests on the family hue and lands the hottest cell on the shared warm apex', () => {
    // Arrange / Act
    const t = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — hm-0 carries the rest hue (235); hm-4 the warm apex hue (42)
    expect(t['--hm-0']).toBe('oklch(0.96 0.008 235)')
    expect(t['--hm-4']).toBe('oklch(0.55 0.16 42)')
  })
})

describe('deriveThemeCss / generateThemesCss — CSS emission contract', () => {
  it('wraps a derived theme in the high-specificity :root[data-theme] selector so it outranks cathedral :root regardless of @import order', () => {
    // Arrange / Act
    const css = deriveThemeCss(SAMPLE_DERIVED_THEME)

    // Assert — the (0,2,0) selector is load-bearing; a bare [data-theme] (0,1,0)
    // would tie cathedral's :root and lose on @import source order
    expect(css.startsWith(":root[data-theme='dark'] {\n")).toBe(true)
    expect(css.endsWith('\n}')).toBe(true)
  })

  it('declares color-scheme first, then every cathedral color token', () => {
    // Arrange / Act
    const css = deriveThemeCss(SAMPLE_DERIVED_THEME)
    const declarationCount = css
      .split('\n')
      .filter((line) => line.trim().startsWith('--')).length

    // Assert — color-scheme hints UA form controls; 36 = the full cathedral ladder
    expect(css).toContain('  color-scheme: dark;')
    expect(declarationCount).toBe(36)
  })

  it('skips preserved cathedral themes and emits one block per derived theme', () => {
    // Arrange / Act — registry cathedral pair is preserved; only the derived block ships
    const css = generateThemesCss([
      THEME_REGISTRY.light,
      THEME_REGISTRY.dark,
      SAMPLE_DERIVED_THEME,
    ])
    const blockCount = css.split(':root[data-theme=').length - 1

    // Assert — both cathedral themes skipped, the lone derived theme emitted once
    expect(blockCount).toBe(1)
    expect(css).toContain('AUTO-GENERATED')
  })

  it('emits the header alone when every registered theme is preserved', () => {
    // Arrange / Act — nothing derived → no blocks (today's real registry shape)
    const css = generateThemesCss([THEME_REGISTRY.light, THEME_REGISTRY.dark])
    const blockCount = css.split(':root[data-theme=').length - 1

    // Assert
    expect(blockCount).toBe(0)
    expect(css).toContain('AUTO-GENERATED')
  })
})

// Every SHIPPED colored family (preserve:false). The per-theme gates below iterate
// these so a bad seed fails CI by name. generated.css staleness is a separate guard
// (`theme:check` regenerates + git-diffs); here we prove the SEEDS themselves are sound.
const DERIVED_THEMES = Object.values(THEME_REGISTRY).filter(
  (theme): theme is DerivedTheme => !theme.preserve,
)

describe('every registered colored family — WCAG AA gate', () => {
  it.each(DERIVED_THEMES)(
    '$id clears AA on body text, muted labels, and the computed primary foreground',
    (theme) => {
      // Arrange
      const t = deriveThemeTokens(theme)

      // Assert — body text keeps cathedral's strong contrast (gate at AAA-ish 7:1);
      // muted-on-card and the *computed* primary-foreground clear AA body text 4.5:1
      expect(
        contrastRatio(token(t, '--foreground'), token(t, '--background')),
      ).toBeGreaterThanOrEqual(7)
      expect(
        contrastRatio(token(t, '--muted-foreground'), token(t, '--card')),
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio(token(t, '--primary-foreground'), token(t, '--primary')),
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio(
          token(t, '--sidebar-primary-foreground'),
          token(t, '--sidebar-primary'),
        ),
      ).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe('every registered colored family — heatmap "temperature = pride" invariant', () => {
  // The hottest cell's hue must stay in the warm band so "more completions = hotter"
  // reads the same across families (cathedral apex sits at hue 40/65; seeds land 38–45).
  const WARM_APEX_MIN_HUE = 20
  const WARM_APEX_MAX_HUE = 70

  it.each(DERIVED_THEMES)(
    '$id ramps lightness/chroma monotonically and lands the apex in the warm band',
    (theme) => {
      // Arrange — the five heatmap stops, coolest (rest) → warmest (apex)
      const tokens = deriveThemeTokens(theme)
      const ramp = HEATMAP_TOKENS.map((k) => oklchOf(token(tokens, k)))

      // Assert — light cools→warms (L falls); dark glows brighter (L rises)
      const lightnessMonotonic = ramp.every((stop, i) =>
        i === 0
          ? true
          : theme.mode === 'light'
            ? stop.l < ramp[i - 1]!.l
            : stop.l > ramp[i - 1]!.l,
      )
      expect(lightnessMonotonic).toBe(true)

      // chroma intensifies toward the apex in both modes
      const chromaRising = ramp.every((stop, i) =>
        i === 0 ? true : stop.c > ramp[i - 1]!.c,
      )
      expect(chromaRising).toBe(true)

      // shared warm apex — the hottest cell hue stays warm regardless of the rest hue
      const apexHue = oklchOf(token(tokens, '--hm-4')).h
      expect(apexHue).toBeGreaterThanOrEqual(WARM_APEX_MIN_HUE)
      expect(apexHue).toBeLessThanOrEqual(WARM_APEX_MAX_HUE)
    },
  )
})

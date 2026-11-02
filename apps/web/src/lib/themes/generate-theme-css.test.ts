import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { THEME_TOKENS } from '@corelive/live-editor/theme-tokens'
import { converter } from 'culori'
import { describe, test, expect } from 'vitest'

import {
  CATHEDRAL,
  checkThemeArtifacts,
  deriveThemeTokens,
  deriveThemeCss,
  describeThemeArtifactDrift,
  generateThemesCss,
  generateThemeTokensModule,
  staticThemeCss,
  writeThemeArtifacts,
  type DerivationSeed,
} from '../../../scripts/generate-theme-css'

import { contrastRatio, meetsAA } from './contrast'
import {
  isDerivedTheme,
  isStaticTheme,
  THEME_IDS,
  THEME_REGISTRY,
  type DerivedTheme,
  type ThemeSeed,
} from './registry'

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
 * mechanics. It borrows the 'harbor-dark' id with a sample seed so no registered
 * theme is involved; it is never added to the registry or shipped.
 */
const SAMPLE_DERIVED_THEME: DerivedTheme = {
  ...SAMPLE_DARK,
  family: 'harbor',
  id: 'harbor-dark',
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
  test('tints a neutral surface with the family hue/chroma at the cathedral lightness', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — keeps cathedral --background L (0.975), applies neutral chroma + hue
    expect(tokens['--background']).toBe('oklch(0.975 0.012 250)')
  })

  test('paints accent tokens (and ring) from the seed signature color', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — cathedral makes --ring equal --primary, so both take the accent
    expect(tokens['--primary']).toBe('oklch(0.5 0.135 250)')
    expect(tokens['--ring']).toBe('oklch(0.5 0.135 250)')
  })

  test('keeps the warm chart and destructive identity fixed across families', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — fixed-identity tokens emit the cathedral value unchanged
    expect(tokens['--destructive']).toBe('oklch(0.6 0.2 25)')
    expect(tokens['--chart-1']).toBe('oklch(0.62 0.16 50)')
  })

  test('preserves a translucent dark border instead of making it opaque', () => {
    // Arrange / Act
    const tokens = deriveThemeTokens(SAMPLE_DARK)

    // Assert — cathedral dark --border alpha (8%) is kept; only hue/chroma tint
    expect(tokens['--border']).toBe('oklch(1 0.012 250 / 8%)')
  })
})

describe('deriveThemeTokens — WCAG AA', () => {
  test('clears AA for body text on every core surface in light mode', () => {
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

  test('clears AA for body text on every core surface in dark mode', () => {
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
  test('darkens monotonically as completions rise in light mode', () => {
    // Arrange / Act — light heatmap cools (high L) → warms (low L)
    const t = deriveThemeTokens(SAMPLE_LIGHT)
    const lightness = HEATMAP_TOKENS.map((k) => lightnessOf(token(t, k)))

    // Assert — strictly decreasing L (rest is palest, apex is deepest)
    const strictlyDecreasing = lightness.every(
      (l, i) => i === 0 || l < lightness[i - 1]!,
    )
    expect(strictlyDecreasing).toBe(true)
  })

  test('lightens monotonically as completions rise in dark mode', () => {
    // Arrange / Act — dark heatmap glows brighter toward the apex
    const t = deriveThemeTokens(SAMPLE_DARK)
    const lightness = HEATMAP_TOKENS.map((k) => lightnessOf(token(t, k)))

    // Assert — strictly increasing L
    const strictlyIncreasing = lightness.every(
      (l, i) => i === 0 || l > lightness[i - 1]!,
    )
    expect(strictlyIncreasing).toBe(true)
  })

  test('rests on the family hue and lands the hottest cell on the shared warm apex', () => {
    // Arrange / Act
    const t = deriveThemeTokens(SAMPLE_LIGHT)

    // Assert — hm-0 carries the rest hue (235); hm-4 the warm apex hue (42)
    expect(t['--hm-0']).toBe('oklch(0.96 0.008 235)')
    expect(t['--hm-4']).toBe('oklch(0.55 0.16 42)')
  })
})

describe('deriveThemeCss / generateThemesCss — CSS emission contract', () => {
  test('wraps a derived theme in the high-specificity :root[data-theme] selector so it outranks cathedral :root regardless of @import order', () => {
    // Arrange / Act
    const css = deriveThemeCss(SAMPLE_DERIVED_THEME)

    // Assert — the (0,2,0) selector is load-bearing; a bare [data-theme] (0,1,0)
    // would tie cathedral's :root and lose on @import source order
    expect(css.startsWith(":root[data-theme='harbor-dark'] {\n")).toBe(true)
    expect(css.endsWith('\n}')).toBe(true)
  })

  test('declares color-scheme first, then every cathedral color token', () => {
    // Arrange / Act
    const css = deriveThemeCss(SAMPLE_DERIVED_THEME)
    const declarationCount = css
      .split('\n')
      .filter((line) => line.trim().startsWith('--')).length

    // Assert — color-scheme hints UA form controls; 36 = the full cathedral ladder
    expect(css).toContain('  color-scheme: dark;')
    expect(declarationCount).toBe(36)
  })

  test('skips preserved cathedral themes and emits one block per derived theme', () => {
    // Arrange / Act — registry cathedral pair is preserved; only the derived block ships
    const css = generateThemesCss(
      [
        THEME_REGISTRY['cathedral-light'],
        THEME_REGISTRY['cathedral-dark'],
        SAMPLE_DERIVED_THEME,
      ],
      {},
    )
    const blockCount = css.split(':root[data-theme=').length - 1

    // Assert — both cathedral themes skipped, the lone derived theme emitted once
    expect(blockCount).toBe(1)
    expect(css).toContain('AUTO-GENERATED')
  })

  test('emits the header alone when every registered theme is preserved', () => {
    // Arrange / Act — nothing emitted → no blocks
    const css = generateThemesCss(
      [THEME_REGISTRY['cathedral-light'], THEME_REGISTRY['cathedral-dark']],
      {},
    )
    const blockCount = css.split(':root[data-theme=').length - 1

    // Assert
    expect(blockCount).toBe(0)
    expect(css).toContain('AUTO-GENERATED')
  })

  test('copies the stock shadcn Default tokens verbatim — no derivation, same selector contract', () => {
    // Arrange / Act
    const css = staticThemeCss(THEME_REGISTRY.light)
    const declarationCount = css
      .split('\n')
      .filter((line) => line.trim().startsWith('--')).length

    // Assert — same (0,2,0) selector as derived themes, the literal values, and
    // the full 36-token block (31 shadcn tokens + the 5 heatmap stops)
    expect(css.startsWith(":root[data-theme='light'] {\n")).toBe(true)
    expect(css).toContain('  color-scheme: light;')
    expect(css).toContain('  --background: oklch(1 0 0);')
    expect(css).toContain('  --primary: oklch(0.205 0 0);')
    expect(css).toContain('  --hm-4: oklch(0.55 0.16 40);')
    expect(declarationCount).toBe(36)
  })

  test('emits a static theme alongside derived ones and still skips preserved cathedral', () => {
    // Arrange / Act — an empty alias map isolates the per-theme blocks
    const css = generateThemesCss(
      [
        THEME_REGISTRY.dark,
        THEME_REGISTRY['cathedral-light'],
        SAMPLE_DERIVED_THEME,
      ],
      {},
    )

    // Assert — Default dark (own block + first-paint media block) and the derived
    // sample; cathedral light skipped
    expect(css).toContain(":root[data-theme='dark'] {")
    expect(css).toContain(":root[data-theme='harbor-dark'] {")
    expect(css).not.toContain('cathedral')
    expect(css).toContain('  --background: oklch(0.145 0 0);')
  })
})

describe('generateThemesCss — Default family block layout', () => {
  /** Splits generated CSS into its top-level `selector {` heads, in order. */
  const blockHeads = (css: string): string[] =>
    css
      .split('\n')
      .filter((line) => /^[^\s/].*\{$/.test(line))
      .map((line) => line.replace(/ \{$/, ''))

  const registryCss = generateThemesCss(Object.values(THEME_REGISTRY))

  test('emits exactly the six Default blocks first, in a fixed order', () => {
    // Arrange / Act
    const heads = blockHeads(registryCss).slice(0, 6)

    // Assert
    expect(heads).toEqual([
      ':root',
      ":root[data-theme='light']",
      ":root[data-theme='default-light']",
      ":root[data-theme='dark']",
      ":root[data-theme='default-dark']",
      '@media (prefers-color-scheme: dark)',
    ])
  })

  test('declares color-scheme light on every light Default block and dark on every dark one', () => {
    // Arrange — the first 4 lines after each Default selector include color-scheme
    const schemeAfter = (head: string): string => {
      const start = registryCss.indexOf(`${head} {\n`)
      const afterHead = registryCss.slice(start + head.length + 3)
      return /color-scheme: (light|dark);/.exec(afterHead)?.[1] ?? 'missing'
    }

    // Act / Assert
    expect(schemeAfter(':root')).toBe('light')
    expect(schemeAfter(":root[data-theme='light']")).toBe('light')
    expect(schemeAfter(":root[data-theme='default-light']")).toBe('light')
    expect(schemeAfter(":root[data-theme='dark']")).toBe('dark')
    expect(schemeAfter(":root[data-theme='default-dark']")).toBe('dark')
    expect(schemeAfter(':root:not([data-theme])')).toBe('dark')
  })

  test('paints Default dark tokens inside the prefers-color-scheme media block when no theme attribute is set', () => {
    // Arrange / Act
    const mediaStart = registryCss.indexOf(
      '@media (prefers-color-scheme: dark)',
    )
    const mediaBlock = registryCss.slice(
      mediaStart,
      registryCss.indexOf(":root[data-theme='harbor-light']"),
    )

    // Assert
    expect(mediaBlock).toContain('  :root:not([data-theme]) {')
    expect(mediaBlock).toContain('    --background: oklch(0.145 0 0);')
  })

  test('gives the bare :root the Default light palette so unthemed pages never paint amber', () => {
    // Arrange / Act
    const bareRootBlock = /^:root \{[^}]*\}/m.exec(registryCss)?.[0] ?? ''

    // Assert
    expect(bareRootBlock).toContain('--background: oklch(1 0 0);')
    expect(bareRootBlock).toContain('--primary: oklch(0.205 0 0);')
  })
})

describe('generateThemesCss — validation (nothing is produced from a bad registry)', () => {
  test('throws THEME_INVALID_COLOR naming theme, token and value for an unparsable static token', () => {
    // Arrange — Default light with a corrupted --primary
    const brokenDefault = {
      ...THEME_REGISTRY.light,
      tokens: { ...THEME_REGISTRY.light.tokens, '--primary': 'not-a-color' },
    }

    // Act
    const generate = () => generateThemesCss([brokenDefault], {})

    // Assert
    expect(generate).toThrow(
      'THEME_INVALID_COLOR theme=light token=--primary value=not-a-color source=packages/live-editor/src/themes/registry.ts',
    )
  })

  test('throws THEME_ALIAS_TARGET when an alias points at a preserved cathedral theme', () => {
    // Arrange
    const themes = Object.values(THEME_REGISTRY)

    // Act
    const generate = () =>
      generateThemesCss(themes, { 'default-light': 'cathedral-light' })

    // Assert
    expect(generate).toThrow(
      'THEME_ALIAS_TARGET alias=default-light target=cathedral-light',
    )
  })

  test('throws THEME_ALIAS_TARGET when an alias points at an id that is not in the registry', () => {
    // Arrange
    const themes = Object.values(THEME_REGISTRY)

    // Act
    const generate = () => generateThemesCss(themes, { 'old-id': 'missing-id' })

    // Assert
    expect(generate).toThrow(
      'THEME_ALIAS_TARGET alias=old-id target=missing-id',
    )
  })
})

describe('describeThemeArtifactDrift — theme:check diagnostics', () => {
  test('names the stale file with its code, the first differing line number and both lines', () => {
    // Arrange
    const expected = 'line one\nline two\nexpected three\nline four'
    const actual = 'line one\nline two\nactual three\nline four'

    // Act
    const message = describeThemeArtifactDrift(
      'packages/live-editor/src/styles/generated.css',
      expected,
      actual,
    )

    // Assert
    expect(message).toContain(
      'THEME_ARTIFACT_STALE packages/live-editor/src/styles/generated.css',
    )
    expect(message).toContain('line 3')
    expect(message).toContain('expected: expected three')
    expect(message).toContain('actual:   actual three')
    expect(message).toContain('pnpm theme:generate')
  })

  test('bounds each excerpt to one line of at most 200 characters', () => {
    // Arrange
    const expected = `${'a'.repeat(500)}\nsecond`
    const actual = `${'b'.repeat(500)}\nsecond`

    // Act
    const message = describeThemeArtifactDrift(
      'packages/live-editor/src/themes/themeTokens.generated.ts',
      expected,
      actual,
    )

    // Assert
    expect(message).toContain(`expected: ${'a'.repeat(200)}\n`)
    expect(message).not.toContain('a'.repeat(201))
  })
})

/**
 * Creates a fresh temp directory and two artifact descriptors inside it.
 * @returns the directory and the artifacts (contents are what a fresh generation produced).
 */
function makeArtifactFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'corelive-theme-artifacts-'))
  return {
    directory,
    cssArtifact: {
      absolutePath: join(directory, 'generated.css'),
      repoPath: 'packages/live-editor/src/styles/generated.css',
      content: ':root {\n  --primary: oklch(0.205 0 0);\n}\n',
    },
    tokensArtifact: {
      absolutePath: join(directory, 'themeTokens.generated.ts'),
      repoPath: 'packages/live-editor/src/themes/themeTokens.generated.ts',
      content: 'export const THEME_TOKENS = { light: {} }\n',
    },
  }
}

describe('checkThemeArtifacts / writeThemeArtifacts — theme:check and theme:generate on disk', () => {
  test('passes theme:check when every generated file matches a fresh generation', () => {
    // Arrange
    const { cssArtifact, tokensArtifact } = makeArtifactFixture()
    writeThemeArtifacts([cssArtifact, tokensArtifact])

    // Act
    const check = (): void => checkThemeArtifacts([cssArtifact, tokensArtifact])

    // Assert
    expect(check).not.toThrow()
  })

  test('fails theme:check on a stale token module, naming it, the first differing line and the fix command', () => {
    // Arrange
    const { cssArtifact, tokensArtifact } = makeArtifactFixture()
    writeThemeArtifacts([cssArtifact, tokensArtifact])
    writeFileSync(
      tokensArtifact.absolutePath,
      'export const THEME_TOKENS = { dark: {} }\n',
    )

    // Act
    const check = (): void => checkThemeArtifacts([cssArtifact, tokensArtifact])

    // Assert
    expect(check).toThrow(
      'THEME_ARTIFACT_STALE packages/live-editor/src/themes/themeTokens.generated.ts',
    )
    expect(check).toThrow('First difference at line 1:')
    expect(check).toThrow('pnpm theme:generate')
  })

  test('fails theme:check on a missing token module with its own code instead of a raw ENOENT', () => {
    // Arrange
    const { cssArtifact, tokensArtifact } = makeArtifactFixture()
    writeThemeArtifacts([cssArtifact])

    // Act
    const check = (): void => checkThemeArtifacts([cssArtifact, tokensArtifact])

    // Assert
    expect(check).toThrow(
      'THEME_ARTIFACT_MISSING packages/live-editor/src/themes/themeTokens.generated.ts',
    )
    expect(check).toThrow('pnpm theme:generate')
    expect(check).not.toThrow('ENOENT')
  })

  test('reports every stale and missing generated file in one theme:check failure', () => {
    // Arrange
    const { cssArtifact, tokensArtifact } = makeArtifactFixture()
    writeFileSync(cssArtifact.absolutePath, ':root {}\n')

    // Act
    const check = (): void => checkThemeArtifacts([cssArtifact, tokensArtifact])

    // Assert
    expect(check).toThrow(
      'THEME_ARTIFACT_STALE packages/live-editor/src/styles/generated.css',
    )
    expect(check).toThrow(
      'THEME_ARTIFACT_MISSING packages/live-editor/src/themes/themeTokens.generated.ts',
    )
  })

  test('theme:generate writes every generated file in order and reports their paths', () => {
    // Arrange
    const { cssArtifact, tokensArtifact } = makeArtifactFixture()

    // Act
    const writtenPaths = writeThemeArtifacts([cssArtifact, tokensArtifact])

    // Assert
    expect(writtenPaths).toEqual([
      'packages/live-editor/src/styles/generated.css',
      'packages/live-editor/src/themes/themeTokens.generated.ts',
    ])
    expect(readFileSync(tokensArtifact.absolutePath, 'utf-8')).toBe(
      'export const THEME_TOKENS = { light: {} }\n',
    )
  })

  test('a part-way theme:generate failure names the failed file and the file already written', () => {
    // Arrange
    const { directory, cssArtifact, tokensArtifact } = makeArtifactFixture()
    const unwritableTokens = {
      ...tokensArtifact,
      absolutePath: join(
        directory,
        'missing-directory',
        'themeTokens.generated.ts',
      ),
    }

    // Act
    const generate = () => writeThemeArtifacts([cssArtifact, unwritableTokens])

    // Assert
    expect(generate).toThrow(
      'THEME_ARTIFACT_WRITE_FAILED packages/live-editor/src/themes/themeTokens.generated.ts (ENOENT). Already written: packages/live-editor/src/styles/generated.css.',
    )
    expect(existsSync(cssArtifact.absolutePath)).toBe(true)
  })
})

describe('THEME_TOKENS — the generated token module for runtimes without the CSS cascade', () => {
  const ALL_TOKEN_NAMES = Object.keys(THEME_REGISTRY.light.tokens)
  // Widen the satisfies-typed registry to ThemeSeed so the type predicate applies.
  const registryThemes: ThemeSeed[] = Object.values(THEME_REGISTRY)

  test('carries every registered theme with every theme token', () => {
    // Arrange / Act
    const moduleThemeIds = Object.keys(THEME_TOKENS)

    // Assert
    expect([...moduleThemeIds].sort()).toEqual([...THEME_IDS].sort())
    for (const themeId of THEME_IDS) {
      expect(Object.keys(THEME_TOKENS[themeId])).toEqual(ALL_TOKEN_NAMES)
    }
  })

  test('copies the static Default themes from their registry tokens', () => {
    // Assert
    expect(THEME_TOKENS.light).toEqual(THEME_REGISTRY.light.tokens)
    expect(THEME_TOKENS.dark).toEqual(THEME_REGISTRY.dark.tokens)
  })

  test('mirrors Warm Cathedral from the CATHEDRAL ladder pinned to base.css', () => {
    // Assert
    expect(THEME_TOKENS['cathedral-light']).toEqual(CATHEDRAL.light)
    expect(THEME_TOKENS['cathedral-dark']).toEqual(CATHEDRAL.dark)
  })

  test.each(registryThemes.filter(isDerivedTheme))(
    'carries the derived $id colors exactly as deriveThemeTokens computes them',
    (theme) => {
      // Assert
      expect(THEME_TOKENS[theme.id]).toEqual(deriveThemeTokens(theme, theme.id))
    },
  )

  test('refuses to generate a module when a theme loses or gains a token', () => {
    // Arrange — Default light without --ring and with an unknown --glow
    const tokensWithoutRing = Object.fromEntries(
      Object.entries(THEME_REGISTRY.light.tokens).filter(
        ([token]) => token !== '--ring',
      ),
    )
    const brokenDefault = {
      ...THEME_REGISTRY.light,
      tokens: { ...tokensWithoutRing, '--glow': 'oklch(0.9 0 0)' },
    }

    // Act
    const generate = () =>
      // @ts-expect-error -- the broken token set is the input under test
      generateThemeTokensModule([brokenDefault])

    // Assert
    expect(generate).toThrow(
      'THEME_TOKEN_SET_MISMATCH light missing=--ring extra=--glow',
    )
  })
})

// Every SHIPPED generator-emitted theme (preserve:false): the colored families
// (OKLCH seeds) plus the static shadcn Default pair (literal tokens). The per-theme
// gates below iterate these so a bad seed OR a bad literal fails CI by name.
// generated.css staleness is a separate guard (`theme:check` regenerates +
// git-diffs); here we prove the SEEDS / TOKENS themselves are sound. Widen the
// literal value union from the `satisfies`-typed registry to ThemeSeed first, so
// the type predicates are assignable.
const ALL_THEMES: ThemeSeed[] = Object.values(THEME_REGISTRY)
const DERIVED_THEMES = ALL_THEMES.filter(isDerivedTheme)
const STATIC_THEMES = ALL_THEMES.filter(isStaticTheme)
const EMITTED_THEMES = [...STATIC_THEMES, ...DERIVED_THEMES]

/** The token map generated.css carries for an emitted theme (literal or derived). */
const emittedTokens = (theme: ThemeSeed): Record<string, string> => {
  if (theme.preserve)
    throw new Error(`${theme.id} is hand-authored, not emitted`)
  return isStaticTheme(theme) ? theme.tokens : deriveThemeTokens(theme)
}

// it.each([]) passes vacuously — so if the registry ever empties or the kind
// filters regress, the per-theme gates below would silently test NOTHING. Lock
// the shipped set up front: 10 colored (5 families × light/dark) + 2 Default.
test('ships exactly 10 colored families (5 families × light + dark) and the 2 static Default themes', () => {
  // Arrange / Act / Assert
  expect(DERIVED_THEMES).toHaveLength(10)
  expect(STATIC_THEMES.map((theme) => theme.id)).toEqual(['light', 'dark'])
})

describe('every emitted theme — WCAG AA gate', () => {
  test.each(EMITTED_THEMES)(
    '$id clears AA on body text, muted labels, and the computed primary foreground',
    (theme) => {
      // Arrange
      const t = emittedTokens(theme)

      // Assert (STRUCTURAL) — foreground/background and muted/card are both
      // neutral-on-neutral at the FIXED cathedral L ladder; a seed only tints the
      // shared hue/chroma, so these ratios are ~constant across families. They
      // guard a GENERATOR regression that breaks the ladder reuse, not a bad seed.
      expect(
        contrastRatio(token(t, '--foreground'), token(t, '--background')),
      ).toBeGreaterThanOrEqual(7)
      expect(
        contrastRatio(token(t, '--muted-foreground'), token(t, '--card')),
      ).toBeGreaterThanOrEqual(4.5)
      // Assert (SEED-SENSITIVE) — the real per-seed AA gate: --primary is the
      // seed-controlled accent and --primary-foreground is contrast-COMPUTED on
      // it, so a bad accentL can leave neither candidate (near-white/near-ink)
      // clearing 4.5. Same for the sidebar accent pair.
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

describe('every emitted theme — heatmap "temperature = pride" invariant', () => {
  // The HOT END of the ramp must bloom warm so "more completions = hotter" reads
  // the same across families. The band brackets the cathedral apex (hue 40/65)
  // with headroom for seeds (which land 25–65 at the two hottest stops).
  const WARM_BAND_MIN_HUE = 20
  const WARM_BAND_MAX_HUE = 70
  // The two hottest stops carry the "pride" payoff — they, not the cool rest
  // stops, are what must read warm. (--hm-3 = second-hottest, --hm-4 = apex.)
  const WARMEST_STOPS = ['--hm-3', '--hm-4'] as const

  test.each(EMITTED_THEMES)(
    '$id reuses the cathedral L/C ramp and blooms its two hottest stops into the warm band',
    (theme) => {
      // Arrange — the five heatmap stops, coolest (rest) → warmest (apex)
      const tokens = emittedTokens(theme)
      const ramp = HEATMAP_TOKENS.map((k) => oklchOf(token(tokens, k)))

      // Assert (STRUCTURAL) — the generator reuses the cathedral L/C ladder
      // verbatim for every family, so these two checks hold *by construction*:
      // they guard against a GENERATOR regression that breaks that reuse, NOT
      // against a bad seed (a `heatmapHues` seed only controls hue, not L or C).
      // Light cools→warms as it deepens (L falls); dark glows brighter (L rises).
      const lightnessMonotonic = ramp.every((stop, i) =>
        i === 0
          ? true
          : theme.mode === 'light'
            ? stop.l < ramp[i - 1]!.l
            : stop.l > ramp[i - 1]!.l,
      )
      expect(lightnessMonotonic).toBe(true)

      // Chroma intensifies toward the apex in both modes (also structural).
      const chromaRising = ramp.every((stop, i) =>
        i === 0 ? true : stop.c > ramp[i - 1]!.c,
      )
      expect(chromaRising).toBe(true)

      // Assert (SEED CONSTRAINT) — per-stop hue is the ONLY thing a seed controls,
      // so this is the real "temperature = pride" gate. Requiring BOTH hottest
      // stops (not just the apex) in the warm band rejects a degenerate all-cool
      // body like heatmapHues [145,145,145,145,42] — which keeps the L/C ramp but
      // renders a GitHub-green grid with a single warm cell, exactly the failure
      // the north star forbids. The cool rest stops (--hm-0..--hm-2) keep the
      // family's hue by design and are intentionally unconstrained.
      for (const stop of WARMEST_STOPS) {
        const hue = oklchOf(token(tokens, stop)).h
        const message = `${stop} hue ${hue.toFixed(1)} must bloom warm (∈ [${WARM_BAND_MIN_HUE}, ${WARM_BAND_MAX_HUE}])`
        expect(hue, message).toBeGreaterThanOrEqual(WARM_BAND_MIN_HUE)
        expect(hue, message).toBeLessThanOrEqual(WARM_BAND_MAX_HUE)
      }
    },
  )
})

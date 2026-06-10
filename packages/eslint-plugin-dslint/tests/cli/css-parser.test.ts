import { describe, it, expect } from 'vitest'

import {
  parseCSSContent,
  extractColorVariables,
  varNameToColorName,
} from '../../src/cli/css-parser.js'

// A fixture that mirrors the real globals.css shape after the theme-system work:
// T2's `@custom-variant` line (which names `data-theme` OUTSIDE any block), an
// `@theme inline` alias block, the default-light `:root`, and three
// `[data-theme='…']` family blocks. `--accent` is present in only some families
// on purpose, to prove per-block tagging survives gaps. `:root` comes first, as
// globals.css and the theme generator always emit it (the parser's precondition).
const MULTI_THEME_CSS = `
@custom-variant dark (&:where([data-theme$=dark], [data-theme$=dark] *));

@theme inline {
  --color-background: var(--background);
}

:root {
  --background: oklch(0.975 0.016 80);
  --accent: oklch(0.942 0.024 78);
}

[data-theme='dark'] {
  --background: oklch(0.172 0.026 40);
}

[data-theme='harbor'] {
  --background: oklch(0.6 0.1 230);
  --accent: oklch(0.7 0.12 220);
}

[data-theme='harbor-dark'] {
  --background: oklch(0.25 0.05 230);
}
`

describe('parseCSSContent — theme tagging', () => {
  it('tags :root variables as the default-light palette', () => {
    // Arrange — a stylesheet whose :root holds the default-light tokens

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const lightNames = variables
      .filter((v) => v.theme === 'light')
      .map((v) => v.name)
      .sort()
    expect(lightNames).toEqual(['--accent', '--background'])
  })

  it("tags a [data-theme='dark'] block with the 'dark' id", () => {
    // Arrange — the stylesheet declares a dark family

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const darkNames = variables
      .filter((v) => v.theme === 'dark')
      .map((v) => v.name)
      .sort()
    expect(darkNames).toEqual(['--background'])
  })

  it('tags a colored family with its own id instead of collapsing it to base', () => {
    // Arrange — a non-dark colored family the old parser would mis-tag as 'base'

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const harborNames = variables
      .filter((v) => v.theme === 'harbor')
      .map((v) => v.name)
      .sort()
    expect(harborNames).toEqual(['--accent', '--background'])
  })

  it('tags a dark-variant family by its full data-theme id', () => {
    // Arrange — a `*-dark` family id, not just the bare 'dark'

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const harborDarkNames = variables
      .filter((v) => v.theme === 'harbor-dark')
      .map((v) => v.name)
      .sort()
    expect(harborDarkNames).toEqual(['--background'])
  })

  it('leaves variables outside any theme block as base', () => {
    // Arrange — the `@theme inline` alias sits in no theme block

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const baseNames = variables
      .filter((v) => v.theme === 'base')
      .map((v) => v.name)
      .sort()
    expect(baseNames).toEqual(['--color-background'])
  })

  it('ignores the @custom-variant dark line so no phantom theme is created', () => {
    // Arrange — `[data-theme$=dark]` appears in @custom-variant, not as a block

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const distinctThemes = [...new Set(variables.map((v) => v.theme))].sort()
    expect(distinctThemes).toEqual([
      'base',
      'dark',
      'harbor',
      'harbor-dark',
      'light',
    ])
  })

  it('scopes a variable overridden by only some families to those families', () => {
    // Arrange — `--accent` is defined in :root and harbor, but not the dark families

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert
    const accentThemes = variables
      .filter((v) => v.name === '--accent')
      .map((v) => v.theme)
      .sort()
    expect(accentThemes).toEqual(['harbor', 'light'])
  })

  it("binds each block's own value to that block's theme, not a sibling's", () => {
    // Arrange — --background carries a distinct value in every family, so a
    // cross-theme mis-association would surface as a swapped value (which the
    // name-only assertions above cannot catch)

    // Act
    const variables = parseCSSContent(MULTI_THEME_CSS)

    // Assert — each themed --background keeps the value from its own block
    // (.trim() drops css-tree's leading space, irrelevant to association)
    const backgroundValue = (theme: string) =>
      variables
        .find((v) => v.name === '--background' && v.theme === theme)
        ?.value.trim()
    expect(backgroundValue('light')).toBe('oklch(0.975 0.016 80)')
    expect(backgroundValue('dark')).toBe('oklch(0.172 0.026 40)')
    expect(backgroundValue('harbor')).toBe('oklch(0.6 0.1 230)')
  })
})

describe('parseCSSContent — generator contract', () => {
  it('leaves no light definition for a token in a combined :root selector list, so the generator must keep :root standalone', () => {
    // Arrange — a combined `:root, [data-theme='dawn']` block. The :root matcher
    // requires `:root` immediately before `{`, so the comma-list is not a :root
    // match; the shared token is tagged 'dawn' (neither 'light' nor 'base'), so
    // sync would DROP it. This locks the contract that the generator emits :root
    // standalone — if it ever emits combined blocks, this fails loudly.
    const variables = parseCSSContent(
      `:root, [data-theme='dawn'] { --shared: oklch(0.5 0.1 30); }`,
    )

    // Act
    const lightShared = variables.find(
      (v) => v.name === '--shared' && v.theme === 'light',
    )

    // Assert — no 'light'-tagged definition exists (the precise loss condition)
    expect(lightShared).toBeUndefined()
  })

  it("tags a compound :root[data-theme='id'] block (the generator's real output) by its id, not light", () => {
    // Arrange — generated.css emits `:root[data-theme='harbor-light']` (specificity
    // 0,2,0, so a derived theme outranks cathedral's :root regardless of @import
    // order). The :root matcher requires `:root` immediately before `{`, so the
    // compound is NOT mis-tagged 'light'; the [data-theme] matcher claims it by id.
    const variables = parseCSSContent(
      `:root[data-theme='harbor-light'] { --primary: oklch(0.555 0.135 250); }`,
    )

    // Act
    const themes = variables
      .filter((v) => v.name === '--primary')
      .map((v) => v.theme)

    // Assert — one definition, tagged with the colored id (not 'light', not 'base')
    expect(themes).toEqual(['harbor-light'])
  })
})

describe('extractColorVariables', () => {
  it('keeps color-valued variables and drops var() aliases and calc() values', () => {
    // Arrange — two color forms plus a var alias and a calc expression. The
    // alias references `--brand` (not a color-keyword name) so it cannot trip the
    // value's naive substring match for color functions.
    const variables = parseCSSContent(`
      :root {
        --brand: oklch(0.5 0.1 30);
        --swatch-hex: #ff8800;
        --alias: var(--brand);
        --gap: calc(1rem - 2px);
      }
    `)

    // Act
    const colorNames = extractColorVariables(variables)
      .map((v) => v.name)
      .sort()

    // Assert
    expect(colorNames).toEqual(['--brand', '--swatch-hex'])
  })
})

describe('varNameToColorName', () => {
  it('strips the leading -- to yield the Tailwind color name', () => {
    // Arrange / Act / Assert
    expect(varNameToColorName('--background')).toBe('background')
    expect(varNameToColorName('--sidebar-primary-foreground')).toBe(
      'sidebar-primary-foreground',
    )
  })
})

/**
 * @fileoverview Default palette contract (#213): the applied default is stock
 * shadcn Default, so its chrome tokens must stay neutral in `generated.css`.
 *
 * - every chrome token has OKLCH chroma <= 0.02 (Default dark `--sidebar-primary`
 *   is the stock-shadcn blue and is exempt, kept verbatim on purpose);
 * - no Default token outside `--hm-*` / `--chart-*` is warm (hue 30-80, chroma >= 0.1);
 * - the bare `:root` fallback equals Default light.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { converter, parse } from 'culori'
import { describe, expect, test } from 'vitest'

const GENERATED_CSS_PATH = 'packages/live-editor/src/styles/generated.css'
const GENERATED_CSS = readFileSync(
  resolve(process.cwd(), '../..', GENERATED_CSS_PATH),
  'utf-8',
)

const CHROMA_LIMIT = 0.02
const WARM_HUE_MIN = 30
const WARM_HUE_MAX = 80
const WARM_CHROMA_MIN = 0.1

const toOklch = converter('oklch')

/** Chrome tokens that must exist and be neutral in every Default block. */
const CHROME_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--ring',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
]

/** Verbatim stock-shadcn exemptions from the chroma limit, with the reason. */
const CHROMA_EXEMPTIONS: ReadonlyArray<{
  themeId: string
  token: string
  reason: string
}> = [
  {
    themeId: 'dark',
    token: '--sidebar-primary',
    reason:
      'stock shadcn Default dark blue (oklch(0.488 0.243 264.376)), kept verbatim',
  },
]

/** Every selector that paints a Default theme, keyed by the theme id it represents. */
const DEFAULT_SELECTORS: ReadonlyArray<{ themeId: string; selector: string }> =
  [
    { themeId: 'light', selector: ':root' },
    { themeId: 'light', selector: ":root[data-theme='light']" },
    { themeId: 'light', selector: ":root[data-theme='default-light']" },
    { themeId: 'dark', selector: ":root[data-theme='dark']" },
    { themeId: 'dark', selector: ":root[data-theme='default-dark']" },
    { themeId: 'dark', selector: ':root:not([data-theme])' },
  ]

interface CssBlock {
  selector: string
  declarations: Map<string, string>
}

const RECOVERY_LINE =
  'Recovery: edit the Default StaticTheme tokens in packages/live-editor/src/themes/registry.ts (never generated.css), then run pnpm theme:generate && pnpm theme:check'

/**
 * Parses flat `selector { prop: value; }` blocks (also those nested in `@media`).
 * @param css - Stylesheet text.
 * @returns blocks in source order; a repeated selector yields one entry each.
 * @example
 * parseBlocks(":root { --a: 1; }") // => [{ selector: ':root', declarations: Map { '--a' => '1' } }]
 */
function parseBlocks(css: string): CssBlock[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return Array.from(
    withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g),
    (match) => ({
      selector: (match[1] ?? '').trim(),
      declarations: new Map(
        (match[2] ?? '')
          .split(';')
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .map((declaration): [string, string] => {
            const separator = declaration.indexOf(':')
            return [
              declaration.slice(0, separator).trim(),
              declaration.slice(separator + 1).trim(),
            ]
          }),
      ),
    }),
  )
}

/**
 * Reports chroma-contract violations for one Default block.
 * @param themeId - `light` or `dark`, for the diagnostic.
 * @param block - The parsed block.
 * @returns one DX-3 message per violation; absent/unparsable tokens get their own message.
 */
function findChromaViolations(themeId: string, block: CssBlock): string[] {
  const location = `theme=${themeId} selector=${block.selector}`
  return CHROME_TOKENS.flatMap((token) => {
    if (
      CHROMA_EXEMPTIONS.some(
        (entry) => entry.themeId === themeId && entry.token === token,
      )
    ) {
      return []
    }
    const value = block.declarations.get(token)
    const color = value === undefined ? undefined : toOklch(parse(value))
    if (value === undefined || !color) {
      return [
        `DEFAULT_CHROMA_TOKEN_MISSING ${location} token=${token} value=${value ?? '(absent)'} is absent or unparsable file=${GENERATED_CSS_PATH}\n${RECOVERY_LINE}`,
      ]
    }
    const chroma = color.c ?? 0
    return chroma > CHROMA_LIMIT
      ? [
          `DEFAULT_CHROMA_LIMIT ${location} token=${token} value=${value} chroma=${chroma.toFixed(3)} limit=${CHROMA_LIMIT} file=${GENERATED_CSS_PATH}\n${RECOVERY_LINE}`,
        ]
      : []
  })
}

/**
 * Reports warm (amber-range) Default tokens outside the content-colour ramps.
 * @param themeId - `light` or `dark`, for the diagnostic.
 * @param block - The parsed block.
 * @returns one message per warm token.
 */
function findWarmTokens(themeId: string, block: CssBlock): string[] {
  return Array.from(block.declarations).flatMap(([token, value]) => {
    if (token.startsWith('--hm-') || token.startsWith('--chart-')) return []
    const color = toOklch(parse(value))
    const hue = color?.h ?? 0
    const isWarm =
      (color?.c ?? 0) >= WARM_CHROMA_MIN &&
      hue >= WARM_HUE_MIN &&
      hue <= WARM_HUE_MAX
    return isWarm
      ? [
          `DEFAULT_WARM_TOKEN theme=${themeId} selector=${block.selector} token=${token} value=${value} file=${GENERATED_CSS_PATH}\n${RECOVERY_LINE}`,
        ]
      : []
  })
}

/** Finds the Default blocks present in generated.css. */
const readDefaultBlocks = (): Array<{ themeId: string; block: CssBlock }> => {
  const blocks = parseBlocks(GENERATED_CSS)
  return DEFAULT_SELECTORS.map(({ themeId, selector }) => {
    const block = blocks.find((candidate) => candidate.selector === selector)
    if (!block)
      throw new Error(
        `Default block ${selector} missing from ${GENERATED_CSS_PATH}`,
      )
    return { themeId, block }
  })
}

describe('Default palette contract (generated.css)', () => {
  test('keeps every Default chrome token neutral (chroma <= 0.02) in all six Default blocks', () => {
    // Arrange
    const defaultBlocks = readDefaultBlocks()

    // Act
    const violations = defaultBlocks.flatMap(({ themeId, block }) =>
      findChromaViolations(themeId, block),
    )

    // Assert
    expect(defaultBlocks).toHaveLength(6)
    expect(violations.join('\n')).toBe('')
  })

  test('lists the Default dark --sidebar-primary stock-shadcn blue as the only chroma exemption', () => {
    // Arrange / Act
    const exemptions = CHROMA_EXEMPTIONS.map(
      (entry) => `${entry.themeId} ${entry.token}`,
    )

    // Assert
    expect(exemptions).toEqual(['dark --sidebar-primary'])
    expect(
      readDefaultBlocks()[3]?.block.declarations.get('--sidebar-primary'),
    ).toBe('oklch(0.488 0.243 264.376)')
  })

  test('has no warm token in any Default block outside --hm-* and --chart-*', () => {
    // Arrange
    const defaultBlocks = readDefaultBlocks()

    // Act
    const warm = defaultBlocks.flatMap(({ themeId, block }) =>
      findWarmTokens(themeId, block),
    )

    // Assert
    expect(warm.join('\n')).toBe('')
  })

  test('makes the bare :root fallback identical to Default light', () => {
    // Arrange
    const [bareRoot, lightAttribute] = readDefaultBlocks()

    // Act
    const bareEntries = Array.from(bareRoot?.block.declarations ?? [])
    const lightEntries = Array.from(lightAttribute?.block.declarations ?? [])

    // Assert
    expect(bareEntries).toEqual(lightEntries)
  })

  test('reports a planted chromatic --primary with theme, selector, token, value, chroma, limit and file', () => {
    // Arrange
    const [block] = parseBlocks(
      ":root[data-theme='light'] { --primary: oklch(0.6 0.15 55); }",
    )

    // Act
    const messages = findChromaViolations('light', block as CssBlock)

    // Assert
    expect(
      messages.find((message) => message.includes('token=--primary ')),
    ).toBe(
      "DEFAULT_CHROMA_LIMIT theme=light selector=:root[data-theme='light'] token=--primary value=oklch(0.6 0.15 55) chroma=0.150 limit=0.02 file=packages/live-editor/src/styles/generated.css\n" +
        RECOVERY_LINE,
    )
  })

  test('reports a missing chrome token as absent rather than passing silently', () => {
    // Arrange
    const [block] = parseBlocks(
      ":root[data-theme='light'] { --background: oklch(1 0 0); }",
    )

    // Act
    const messages = findChromaViolations('light', block as CssBlock)

    // Assert
    expect(messages).toHaveLength(CHROME_TOKENS.length - 1)
    expect(
      messages.some((message) =>
        message.includes(
          'token=--foreground value=(absent) is absent or unparsable',
        ),
      ),
    ).toBe(true)
  })

  test('flags a planted warm --accent but ignores a warm --hm-4', () => {
    // Arrange
    const [block] = parseBlocks(
      ':root { --accent: oklch(0.7 0.14 60); --hm-4: oklch(0.55 0.16 40); }',
    )

    // Act
    const messages = findWarmTokens('light', block as CssBlock)

    // Assert
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('token=--accent value=oklch(0.7 0.14 60)')
  })
})

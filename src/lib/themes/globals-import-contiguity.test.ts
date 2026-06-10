import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * Turbopack-dev regression guard for the colored theme families.
 *
 * Why it exists: `next dev` (Turbopack) stops inlining `@import` statements once
 * it hits a comment or blank line, so any non-`@import` line placed BEFORE
 * `./lib/themes/generated.css` makes Turbopack silently drop that import. Every
 * colored family (Harbor / Grove / Rose Tea / Iris / Graphite) then falls back
 * to Warm Cathedral in `pnpm dev` with NO build error. The webpack production
 * build is unaffected, so this only bites locally and is trivially reintroduced
 * by "tidying" a comment back between the imports. This test is the only
 * automated guard against that regression — see the theme-expansion QA finding.
 */
const globalsCss = readFileSync(
  resolve(process.cwd(), 'src/globals.css'),
  'utf-8',
)

/**
 * Lists the non-`@import` lines wedged between the first `@import` and the
 * generated-themes `@import` — i.e. the comment/blank breaks that make Turbopack
 * drop the colored-family stylesheet. An empty array means the block is
 * contiguous and dev-safe.
 * @param css - Full CSS source to scan.
 * @returns
 * - Contiguous block: `[]`
 * - Broken block: the offending lines (comment / blank / non-import statements)
 * @example
 * // imports back-to-back → safe
 * importBreaksBeforeGeneratedThemes("@import 'a';\n@import './lib/themes/generated.css';") // => []
 * // a comment line wedged between them → that line is returned as a break
 */
const importBreaksBeforeGeneratedThemes = (css: string): string[] => {
  const lines = css.split('\n').map((line) => line.trim())
  const firstImportIndex = lines.findIndex((line) => line.startsWith('@import'))
  const generatedImportIndex = lines.findIndex(
    (line) =>
      line.startsWith('@import') && line.includes('lib/themes/generated.css'),
  )
  if (firstImportIndex === -1 || generatedImportIndex === -1) {
    throw new Error('globals.css is missing the expected @import statements')
  }
  // Every line from the first @import up to generated.css must itself be an
  // @import; anything else here is exactly what Turbopack chokes on.
  return lines
    .slice(firstImportIndex, generatedImportIndex)
    .filter((line) => !line.startsWith('@import'))
}

describe('Colored theme families load in Turbopack dev', () => {
  it('keeps generated.css contiguous with the leading @import block in globals.css', () => {
    // Arrange / Act
    const breaks = importBreaksBeforeGeneratedThemes(globalsCss)

    // Assert
    expect(breaks).toEqual([])
  })

  it('flags a comment break before generated.css — the exact Turbopack drop', () => {
    // Arrange — a comment wedged between the imports is the regression we guard
    const brokenCss = [
      "@import 'tailwindcss' source('.');",
      "@import 'tw-animate-css';",
      '/* a stray comment that Turbopack stops inlining after */',
      "@import './lib/themes/generated.css';",
    ].join('\n')

    // Act
    const breaks = importBreaksBeforeGeneratedThemes(brokenCss)

    // Assert
    expect(breaks).toEqual([
      '/* a stray comment that Turbopack stops inlining after */',
    ])
  })

  it('accepts a fully contiguous import block', () => {
    // Arrange
    const cleanCss = [
      "@import 'tailwindcss' source('.');",
      "@import 'tw-animate-css';",
      "@import './components/animations/animations.css';",
      "@import './lib/themes/generated.css';",
      '/* comments are fine AFTER the generated.css import */',
    ].join('\n')

    // Act
    const breaks = importBreaksBeforeGeneratedThemes(cleanCss)

    // Assert
    expect(breaks).toEqual([])
  })
})

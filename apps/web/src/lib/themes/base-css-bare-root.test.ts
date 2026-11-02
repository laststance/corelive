/**
 * @fileoverview base.css bare `:root` ownership (#213, CEO-7).
 *
 * The bare `:root` is the pre-hydration fallback; its colours come from the
 * generator (Default light). base.css may only keep non-colour defaults there, so
 * a hand-authored colour can never silently turn the fallback warm again.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const BASE_CSS_PATH = 'packages/live-editor/src/styles/base.css'
const PERMITTED_BARE_DECLARATIONS = [
  'color-scheme',
  '--radius',
  '--control-border',
]

/**
 * Lists the forbidden declarations in every bare `:root { }` block of a stylesheet.
 * @param css - Stylesheet text (comments are ignored; line numbers are preserved).
 * @returns one DX-4 diagnostic per declaration that is not permitted on bare `:root`.
 * @example
 * findBareRootViolations(':root {\n  --primary: red;\n}')
 * // => ['BARE_ROOT_DECLARATION base.css:2 selector=:root declaration="--primary: red" ...']
 */
function findBareRootViolations(css: string): string[] {
  // Blank out comments but keep newlines so reported line numbers stay accurate.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  )
  const violations: string[] = []
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').trim() !== ':root') continue
    const bodyStart = (match.index ?? 0) + match[0].indexOf('{') + 1
    let offset = 0
    for (const rawDeclaration of (match[2] ?? '').split(';')) {
      const declaration = rawDeclaration.trim()
      const property = declaration.split(':')[0]?.trim() ?? ''
      if (declaration && !PERMITTED_BARE_DECLARATIONS.includes(property)) {
        const leading =
          rawDeclaration.length - rawDeclaration.trimStart().length
        const line = text
          .slice(0, bodyStart + offset + leading)
          .split('\n').length
        violations.push(
          `BARE_ROOT_DECLARATION base.css:${line} selector=:root declaration="${declaration}" permitted bare declarations: ${PERMITTED_BARE_DECLARATIONS.join(', ')}.\n` +
            "A Warm Cathedral value belongs in :root[data-theme='cathedral-*']; a Default value belongs in the registry seed (packages/live-editor/src/themes/registry.ts) + pnpm theme:generate. See DESIGN.md#theme-system",
        )
      }
      offset += rawDeclaration.length + 1
    }
  }
  return violations
}

describe('base.css bare :root', () => {
  test('declares only color-scheme, --radius and --control-border in every bare :root block', () => {
    // Arrange
    const css = readFileSync(
      resolve(process.cwd(), '../..', BASE_CSS_PATH),
      'utf-8',
    )

    // Act
    const violations = findBareRootViolations(css)

    // Assert
    expect(violations.join('\n')).toBe('')
  })

  test('names the line, declaration, selector, permitted list and both ownership paths for a planted colour', () => {
    // Arrange
    const css =
      ':root {\n  color-scheme: light;\n  --primary: oklch(0.56 0.16 50);\n}'

    // Act
    const violations = findBareRootViolations(css)

    // Assert
    expect(violations).toEqual([
      'BARE_ROOT_DECLARATION base.css:3 selector=:root declaration="--primary: oklch(0.56 0.16 50)" permitted bare declarations: color-scheme, --radius, --control-border.\n' +
        "A Warm Cathedral value belongs in :root[data-theme='cathedral-*']; a Default value belongs in the registry seed (packages/live-editor/src/themes/registry.ts) + pnpm theme:generate. See DESIGN.md#theme-system",
    ])
  })
})

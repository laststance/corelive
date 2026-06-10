/**
 * CSS Parser
 *
 * Parses CSS files to extract CSS variable definitions.
 * Used by the sync command to read globals.css
 */
import { readFileSync, existsSync } from 'fs'

import * as csstree from 'css-tree'

/**
 * Which theme block a CSS variable was declared in. Open-ended (a bare string)
 * because new theme families are added over time, so it cannot be a fixed union.
 * Values:
 * - `'light'` — the unscoped `:root` block (the default-light palette)
 * - `'base'` — a declaration outside any theme block (e.g. `@theme inline`)
 * - otherwise — the `data-theme` attribute value of the block it sits in, e.g.
 *   `'dark'`, `'harbor'`, `'harbor-dark'` (one entry per `[data-theme='…']` block)
 * @example
 * // ':root { --x: red }'               => theme 'light'
 * // "[data-theme='harbor'] {--x:blue}" => theme 'harbor'
 */
export type ThemeName = string

export interface CSSVariable {
  name: string
  value: string
  theme: ThemeName
}

/**
 * Parse a CSS file and extract CSS variable definitions
 * @param cssPath - Path to the CSS file
 * @returns Array of CSS variables found
 */
export function parseCSSVariables(cssPath: string): CSSVariable[] {
  if (!existsSync(cssPath)) {
    throw new Error(`CSS file not found: ${cssPath}`)
  }

  const content = readFileSync(cssPath, 'utf-8')
  return parseCSSContent(content)
}

/**
 * Parse CSS content string and extract variables
 * @param content - CSS content
 * @returns Array of CSS variables
 */
export function parseCSSContent(content: string): CSSVariable[] {
  const variables: CSSVariable[] = []

  try {
    const ast = csstree.parse(content)

    // Pass 1: collect every custom property in document order, defaulting each
    // to 'base'. css-tree visits declarations in source order but does not
    // expose the parent rule's selector, so the owning theme is assigned in
    // pass 2 by matching each variable back to its selector block.
    csstree.walk(ast, {
      visit: 'Declaration',
      enter(node) {
        // Only CSS custom properties (names starting with `--`)
        if (
          typeof node.property === 'string' &&
          node.property.startsWith('--')
        ) {
          variables.push({
            name: node.property,
            value: csstree.generate(node.value),
            theme: 'base',
          })
        }
      },
    })

    // Pass 2: assign each variable to the theme of the selector block it sits
    // in. `:root` → 'light'; every `[data-theme='X']` block → its id 'X' (so
    // 'dark', 'harbor', 'harbor-dark', … each get their own tag). Anything left
    // stays 'base' (e.g. `@theme inline`). A `data-theme` mention that is not a
    // quoted `[data-theme='…'] { … }` block — such as T2's
    // `@custom-variant dark (… [data-theme$=dark] …)` — is deliberately not
    // matched (the pattern requires `=` then a quote, not `$=`).
    //
    // PRECONDITION: blocks are processed with `:root` first, then each
    // `[data-theme]` block in document order — mirroring css-tree's pass-1 push
    // order — so "the first still-'base' variable of this name" lines each
    // declaration up with its own block. globals.css and the theme generator
    // both emit `:root` first; placing a `[data-theme]` block ahead of `:root`
    // would mis-tag variable names shared across themes.
    //
    // GENERATOR CONTRACT (this regex association silently mis-tags otherwise, so
    // the theme generator must emit): kebab-case `--var` names only, and each
    // block a bare `:root {` or `[data-theme='x'] {`. NOT a combined
    // `:root, [data-theme='x']` selector list — that tags the shared token as
    // the family, which sync then DROPS as neither 'light' nor 'base' — and no
    // compound/descendant selector. All hold for globals.css and the
    // registry-driven generator.
    const assignThemeToBlock = (blockBody: string, theme: ThemeName): void => {
      for (const varMatch of blockBody.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) {
        const varName = `--${varMatch[1]}`
        const variable = variables.find(
          (v) => v.name === varName && v.theme === 'base',
        )
        if (variable) {
          variable.theme = theme
        }
      }
    }

    // `:root` → the default-light palette
    for (const rootBlock of content.matchAll(/:root\s*\{([^}]+)\}/g)) {
      assignThemeToBlock(rootBlock[1] ?? '', 'light')
    }

    // Each `[data-theme='X']` block → its own theme id `X`
    for (const themeBlock of content.matchAll(
      /\[data-theme=['"]([^'"]+)['"]\]\s*\{([^}]+)\}/g,
    )) {
      const themeName = themeBlock[1]
      const blockBody = themeBlock[2]
      if (themeName && blockBody) {
        assignThemeToBlock(blockBody, themeName)
      }
    }
  } catch (error) {
    throw new Error(`Failed to parse CSS: ${(error as Error).message}`)
  }

  return variables
}

/**
 * Extract color variables from CSS variables
 * @param variables - Array of CSS variables
 * @returns Array of color variables only
 */
export function extractColorVariables(variables: CSSVariable[]): CSSVariable[] {
  return variables.filter((v) => {
    // Check if the value looks like a color
    return (
      v.value.includes('oklch') ||
      v.value.includes('rgb') ||
      v.value.includes('hsl') ||
      v.value.includes('#') ||
      v.value.includes('color(')
    )
  })
}

/**
 * Convert CSS variable name to Tailwind color name
 * @param varName - CSS variable name like --background
 * @returns Tailwind color name like background
 */
export function varNameToColorName(varName: string): string {
  // Remove -- prefix
  return varName.replace(/^--/, '')
}

/**
 * CSS Parser
 *
 * Parses CSS files to extract CSS variable definitions.
 * Used by the sync command to read globals.css
 */
import { readFileSync, existsSync } from 'fs'
import * as csstree from 'css-tree'

export interface CSSVariable {
  name: string
  value: string
  theme: 'light' | 'dark' | 'base'
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

    csstree.walk(ast, {
      visit: 'Declaration',
      enter(node) {
        // Check if it's a CSS custom property (starts with --)
        if (
          typeof node.property === 'string' &&
          node.property.startsWith('--')
        ) {
          // Find the parent rule to determine theme
          let theme: 'light' | 'dark' | 'base' = 'base'

          // Walk up to find the rule selector
          // Note: css-tree doesn't provide direct parent access in walk
          // We'll use a workaround by checking the selector context

          // For now, we'll use a simpler approach - parse the CSS manually
          // to associate variables with their selectors

          const value = csstree.generate(node.value)

          variables.push({
            name: node.property,
            value,
            theme,
          })
        }
      },
    })

    // Post-process to determine themes
    // This is a simplified approach - we re-parse to get selector context
    const rootMatch = content.match(/:root\s*\{([^}]+)\}/g)
    const darkMatch = content.match(
      /\[data-theme=['"]dark['"]\]\s*\{([^}]+)\}/g,
    )

    // Mark variables from :root as light theme
    if (rootMatch) {
      for (const match of rootMatch) {
        const varMatches = match.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)
        for (const varMatch of varMatches) {
          const varName = `--${varMatch[1]}`
          const variable = variables.find(
            (v) => v.name === varName && v.theme === 'base',
          )
          if (variable) {
            variable.theme = 'light'
          }
        }
      }
    }

    // Mark variables from [data-theme='dark'] as dark theme
    if (darkMatch) {
      for (const match of darkMatch) {
        const varMatches = match.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)
        for (const varMatch of varMatches) {
          const varName = `--${varMatch[1]}`
          // Find the dark theme variable (it might have the same name but different value)
          const variable = variables.find(
            (v) => v.name === varName && v.theme === 'base',
          )
          if (variable) {
            // Mark as dark theme
            variable.theme = 'dark'
          }
        }
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
 * Group variables by theme
 * @param variables - Array of CSS variables
 * @returns Object with variables grouped by theme
 */
export function groupByTheme(variables: CSSVariable[]): {
  light: CSSVariable[]
  dark: CSSVariable[]
  base: CSSVariable[]
} {
  return {
    light: variables.filter((v) => v.theme === 'light'),
    dark: variables.filter((v) => v.theme === 'dark'),
    base: variables.filter((v) => v.theme === 'base'),
  }
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

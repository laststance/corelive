/**
 * Sync Command
 *
 * Synchronizes CSS variables from globals.css to tailwind.config.ts
 * to maintain tailwind.config.ts as the Single Source of Truth.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

import {
  parseCSSVariables,
  extractColorVariables,
  varNameToColorName,
  type CSSVariable,
} from './css-parser.js'

export interface SyncOptions {
  css: string
  config: string
  check?: boolean
  dryRun?: boolean
  cwd?: string
}

export interface SyncResult {
  added: string[]
  removed: string[]
  unchanged: string[]
  inconsistencies: Array<{
    name: string
    cssValue: string
    configValue: string
  }>
  success: boolean
}

/**
 * Parse tailwind.config.ts and extract existing color definitions
 */
function parseExistingColors(configPath: string): Map<string, string> {
  const colors = new Map<string, string>()

  if (!existsSync(configPath)) {
    return colors
  }

  const content = readFileSync(configPath, 'utf-8')

  // Extract colors from theme.extend.colors
  const colorsMatch = content.match(/colors:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s)
  if (!colorsMatch) {
    return colors
  }

  const colorsStr = colorsMatch[1]

  // Match key-value pairs
  const pairRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g
  let match
  while ((match = pairRegex.exec(colorsStr ?? '')) !== null) {
    const [, key, value] = match
    if (key && value) {
      colors.set(key, value)
    }
  }

  return colors
}

/**
 * Generate the colors object string for tailwind.config.ts
 */
function generateColorsObject(variables: CSSVariable[]): string {
  const lines: string[] = []

  for (const v of variables) {
    const colorName = varNameToColorName(v.name)
    // Use the CSS variable reference
    lines.push(`        '${colorName}': 'var(${v.name})',`)
  }

  return lines.join('\n')
}

/**
 * Run the sync command
 */
export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const cwd = options.cwd ?? process.cwd()
  const cssPath = resolve(cwd, options.css)
  const configPath = resolve(cwd, options.config)

  const result: SyncResult = {
    added: [],
    removed: [],
    unchanged: [],
    inconsistencies: [],
    success: true,
  }

  // Parse CSS variables
  let cssVariables: CSSVariable[]
  try {
    cssVariables = parseCSSVariables(cssPath)
  } catch (error) {
    console.error(`Error parsing CSS: ${(error as Error).message}`)
    result.success = false
    return result
  }

  // Extract color variables (light theme only for the main definition)
  const colorVariables = extractColorVariables(cssVariables).filter(
    (v) => v.theme === 'light' || v.theme === 'base',
  )

  // Get existing colors from config
  const existingColors = parseExistingColors(configPath)

  // Compare and find differences
  const cssColorNames = new Set(
    colorVariables.map((v) => varNameToColorName(v.name)),
  )
  const configColorNames = new Set(existingColors.keys())

  // Find added colors (in CSS but not in config)
  for (const name of cssColorNames) {
    if (!configColorNames.has(name)) {
      result.added.push(name)
    }
  }

  // Find removed colors (in config but not in CSS)
  for (const name of configColorNames) {
    if (!cssColorNames.has(name)) {
      result.removed.push(name)
    }
  }

  // Find unchanged and check for inconsistencies
  for (const v of colorVariables) {
    const colorName = varNameToColorName(v.name)
    const configValue = existingColors.get(colorName)

    if (configValue) {
      // Check if the config references the correct CSS variable
      const expectedValue = `var(${v.name})`
      if (configValue === expectedValue) {
        result.unchanged.push(colorName)
      } else {
        result.inconsistencies.push({
          name: colorName,
          cssValue: v.name,
          configValue,
        })
      }
    }
  }

  // Check mode - only report, don't modify
  if (options.check) {
    if (
      result.added.length > 0 ||
      result.removed.length > 0 ||
      result.inconsistencies.length > 0
    ) {
      result.success = false
    }
    return result
  }

  // Dry run mode - show what would change
  if (options.dryRun) {
    console.log('\n📋 Dry run - no changes will be made\n')

    if (result.added.length > 0) {
      console.log('➕ Would add:')
      for (const name of result.added) {
        console.log(`   ${name}`)
      }
    }

    if (result.removed.length > 0) {
      console.log('➖ Would remove:')
      for (const name of result.removed) {
        console.log(`   ${name}`)
      }
    }

    if (result.inconsistencies.length > 0) {
      console.log('⚠️  Inconsistencies:')
      for (const inc of result.inconsistencies) {
        console.log(
          `   ${inc.name}: config has "${inc.configValue}", CSS has "${inc.cssValue}"`,
        )
      }
    }

    if (result.unchanged.length > 0) {
      console.log(`✅ ${result.unchanged.length} colors already in sync`)
    }

    return result
  }

  // Actually sync - update the config file
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`)
    result.success = false
    return result
  }

  let configContent = readFileSync(configPath, 'utf-8')

  // Generate new colors object
  const newColorsStr = generateColorsObject(colorVariables)

  // Replace the colors object in the config
  const colorsRegex = /(colors:\s*\{)([^}]+(?:\{[^}]*\}[^}]*)*)(\})/s
  const newColorsSection = `$1\n${newColorsStr}\n      $3`

  if (colorsRegex.test(configContent)) {
    configContent = configContent.replace(colorsRegex, newColorsSection)
  } else {
    console.warn(
      'Could not find colors section in config. Manual update may be required.',
    )
    result.success = false
    return result
  }

  writeFileSync(configPath, configContent, 'utf-8')

  console.log('\n✅ Sync complete!\n')
  if (result.added.length > 0) {
    console.log(`➕ Added: ${result.added.join(', ')}`)
  }
  if (result.removed.length > 0) {
    console.log(`➖ Removed: ${result.removed.join(', ')}`)
  }

  return result
}

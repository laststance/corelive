/**
 * Class Parser
 *
 * Extracts Tailwind CSS class names from various className patterns.
 */

/**
 * Parse a className string and extract individual class names
 * @param value - The className string
 * @returns Array of individual class names
 * @example
 * parseClassString('flex items-center gap-2') // ['flex', 'items-center', 'gap-2']
 * parseClassString('bg-[#fff] text-sm') // ['bg-[#fff]', 'text-sm']
 */
export function parseClassString(value: string): string[] {
  if (!value || typeof value !== 'string') {
    return []
  }

  // Split by whitespace and filter empty strings
  return value
    .trim()
    .split(/\s+/)
    .filter((cls) => cls.length > 0)
}

/**
 * Check if a class name contains an arbitrary value
 * @param className - The class name to check
 * @returns True if it contains arbitrary syntax [...]
 * @example
 * hasArbitraryValue('bg-[#fff]') // true
 * hasArbitraryValue('bg-primary') // false
 */
export function hasArbitraryValue(className: string): boolean {
  return /\[[^\]]+\]/.test(className)
}

/**
 * Check if the arbitrary value is a CSS variable reference
 * @param className - The class name to check
 * @returns True if it's a CSS variable like bg-[var(--color)]
 * @example
 * isCSSVariableValue('bg-[var(--chart-1)]') // true
 * isCSSVariableValue('bg-[#fff]') // false
 */
export function isCSSVariableValue(className: string): boolean {
  return /\[var\(--[^\]]+\)\]/.test(className)
}

/**
 * Check if the arbitrary value is a calc expression
 * @param className - The class name to check
 * @returns True if it's a calc expression like w-[calc(100%-16px)]
 * @example
 * isCalcExpression('w-[calc(100%-16px)]') // true
 * isCalcExpression('w-[100px]') // false
 */
export function isCalcExpression(className: string): boolean {
  return /\[calc\([^\]]+\)\]/.test(className)
}

/**
 * Extract the arbitrary value from a class name
 * @param className - The class name
 * @returns The arbitrary value or null
 * @example
 * extractArbitraryValue('bg-[#ff0000]') // '#ff0000'
 * extractArbitraryValue('text-sm') // null
 */
export function extractArbitraryValue(className: string): string | null {
  const match = className.match(/\[([^\]]+)\]/)
  return match ? (match[1] ?? null) : null
}

/**
 * Get the utility prefix from a class name
 * @param className - The class name
 * @returns The prefix or null
 * @example
 * getUtilityPrefix('bg-[#fff]') // 'bg'
 * getUtilityPrefix('hover:text-red-500') // 'text'
 */
export function getUtilityPrefix(className: string): string | null {
  // Remove modifiers first
  const baseClass = className.replace(/^([\w-]+:)+/, '')

  // Extract prefix before arbitrary value or last hyphen
  const match = baseClass.match(/^([\w-]+?)(?:-\[|$)/)
  if (match) {
    return match[1] ?? null
  }

  // For regular classes, get everything before the last hyphen-value
  const parts = baseClass.split('-')
  if (parts.length > 1) {
    return parts.slice(0, -1).join('-')
  }

  return baseClass
}

/**
 * Categorize the type of arbitrary value
 * @param className - The class name with arbitrary value
 * @returns The category: 'color', 'spacing', 'sizing', 'other', or null if not arbitrary
 */
export type ArbitraryCategory = 'color' | 'spacing' | 'sizing' | 'other'

export function categorizeArbitraryValue(
  className: string,
): ArbitraryCategory | null {
  if (!hasArbitraryValue(className)) {
    return null
  }

  const value = extractArbitraryValue(className)
  if (!value) {
    return null
  }

  // Color patterns
  if (
    /^#[0-9a-fA-F]{3,8}$/.test(value) ||
    /^rgb\(/.test(value) ||
    /^rgba\(/.test(value) ||
    /^hsl\(/.test(value) ||
    /^hsla\(/.test(value) ||
    /^oklch\(/.test(value) ||
    /^oklab\(/.test(value) ||
    /^lch\(/.test(value) ||
    /^lab\(/.test(value) ||
    /^color\(/.test(value)
  ) {
    return 'color'
  }

  // Check prefix for context
  const prefix = getUtilityPrefix(className)

  // Spacing prefixes
  const spacingPrefixes = [
    'p',
    'px',
    'py',
    'pt',
    'pr',
    'pb',
    'pl',
    'm',
    'mx',
    'my',
    'mt',
    'mr',
    'mb',
    'ml',
    'gap',
    'space-x',
    'space-y',
    'inset',
    'top',
    'right',
    'bottom',
    'left',
  ]
  if (prefix && spacingPrefixes.includes(prefix)) {
    return 'spacing'
  }

  // Sizing prefixes
  const sizingPrefixes = ['w', 'h', 'min-w', 'max-w', 'min-h', 'max-h', 'size']
  if (prefix && sizingPrefixes.includes(prefix)) {
    return 'sizing'
  }

  // Color prefixes
  const colorPrefixes = [
    'bg',
    'text',
    'border',
    'ring',
    'fill',
    'stroke',
    'accent',
    'caret',
    'outline',
    'shadow',
    'divide',
    'decoration',
    'from',
    'via',
    'to',
  ]
  if (prefix && colorPrefixes.includes(prefix)) {
    return 'color'
  }

  return 'other'
}

/**
 * Check if a class has responsive or state modifiers
 * @param className - The class name
 * @returns Array of modifiers
 * @example
 * getModifiers('hover:bg-red-500') // ['hover']
 * getModifiers('md:hover:text-white') // ['md', 'hover']
 */
export function getModifiers(className: string): string[] {
  const match = className.match(/^(([\w-]+):)+/)
  if (!match) {
    return []
  }

  return match[0].slice(0, -1).split(':')
}

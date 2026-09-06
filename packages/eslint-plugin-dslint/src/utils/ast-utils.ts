/**
 * AST Utilities
 *
 * Helpers for extracting class names from ESLint AST nodes.
 */
import type { Node, CallExpression, Literal, TemplateLiteral } from 'estree'

/**
 * Utility function names that accept class names
 */
export const CLASS_UTILITY_NAMES = [
  'cn',
  'clsx',
  'cva',
  'twMerge',
  'cx',
  'classNames',
  'classnames',
]

/**
 * Check if a node is a string literal
 */
export function isStringLiteral(
  node: Node,
): node is Literal & { value: string } {
  return node.type === 'Literal' && typeof node.value === 'string'
}

/**
 * Check if a node is a template literal
 */
export function isTemplateLiteral(node: Node): node is TemplateLiteral {
  return node.type === 'TemplateLiteral'
}

/**
 * Check if a call expression is a class utility function
 */
function isClassUtilityCall(node: CallExpression): boolean {
  if (node.callee.type === 'Identifier') {
    return CLASS_UTILITY_NAMES.includes(node.callee.name)
  }
  return false
}

/**
 * Extract string values from a node recursively
 * This handles various patterns like:
 * - String literals: "flex items-center"
 * - Template literals: `flex ${condition && 'items-center'}`
 * - cn(), clsx() calls
 * - Object keys in cn({base: true})
 * - cva() variant definitions
 *
 * @param node - The AST node to extract from
 * @returns Array of string values found
 */
export function extractStringValues(node: Node): string[] {
  if (isStringLiteral(node)) return [node.value]
  if (isTemplateLiteral(node))
    return node.quasis.map((quasi) => quasi.value.raw).filter(Boolean)
  if (node.type === 'ObjectExpression') return extractObjectClassValues(node)
  return getClassValueChildren(node).flatMap(extractStringValues)
}

/** Selects only statically class-bearing children for {@link extractStringValues}.
 * @param node - An expression passed to a class utility.
 * @returns Children whose literal values can represent class names.
 * @example getClassValueChildren(node)
 */
function getClassValueChildren(node: Node): Node[] {
  switch (node.type) {
    case 'CallExpression':
      return isClassUtilityCall(node) ? node.arguments : []
    case 'ArrayExpression':
      return node.elements.filter((element) => element !== null)
    case 'ConditionalExpression':
      return [node.consequent, node.alternate]
    case 'LogicalExpression':
      return [node.left, node.right]
    default:
      // Dynamic expressions have no statically known class value.
      return []
  }
}

/** Extracts object keys and variant values for {@link extractStringValues} during class linting.
 * @param node - A class utility's object argument.
 * @returns Static class strings from its properties.
 * @example extractObjectClassValues(node)
 */
function extractObjectClassValues(
  node: Extract<Node, { type: 'ObjectExpression' }>,
): string[] {
  const values: string[] = []
  for (const property of node.properties) {
    // Spreads have no statically known keys.
    if (property.type !== 'Property') continue
    if (isStringLiteral(property.key)) values.push(property.key.value)
    else if (property.key.type === 'Identifier') values.push(property.key.name)
    values.push(...extractStringValues(property.value))
  }
  return values
}

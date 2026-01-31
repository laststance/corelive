/**
 * AST Utilities
 *
 * Helpers for extracting class names from ESLint AST nodes.
 */
import type { Rule } from 'eslint'
import type {
  Node,
  CallExpression,
  Literal,
  TemplateLiteral,
  ObjectExpression,
  Property,
} from 'estree'

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
  return node.type === 'Literal' && typeof (node as Literal).value === 'string'
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
export function isClassUtilityCall(node: CallExpression): boolean {
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
  const values: string[] = []

  function visit(n: Node): void {
    switch (n.type) {
      case 'Literal':
        if (typeof (n as Literal).value === 'string') {
          values.push((n as Literal).value as string)
        }
        break

      case 'TemplateLiteral': {
        const tl = n as TemplateLiteral
        // Extract static parts from template literal
        for (const quasi of tl.quasis) {
          if (quasi.value.raw) {
            values.push(quasi.value.raw)
          }
        }
        // Don't recurse into expressions as they're dynamic
        break
      }

      case 'CallExpression': {
        const ce = n as CallExpression
        // For utility calls, extract from arguments
        if (isClassUtilityCall(ce)) {
          for (const arg of ce.arguments) {
            visit(arg)
          }
        }
        break
      }

      case 'ObjectExpression': {
        const oe = n as ObjectExpression
        // For objects like cn({flex: true, 'items-center': isActive})
        // The keys are the class names
        for (const prop of oe.properties) {
          if (prop.type === 'Property') {
            const p = prop as Property
            // Object key is a class name
            if (p.key.type === 'Literal' && typeof p.key.value === 'string') {
              values.push(p.key.value)
            } else if (p.key.type === 'Identifier') {
              values.push(p.key.name)
            }
            // Also check the value if it's a string (for cva variants)
            if (p.value) {
              visit(p.value)
            }
          }
        }
        break
      }

      case 'ArrayExpression': {
        // Handle array patterns like cn(['flex', 'items-center'])
        for (const element of (n as { elements: (Node | null)[] }).elements) {
          if (element) {
            visit(element)
          }
        }
        break
      }

      case 'ConditionalExpression': {
        // Handle ternary: condition ? 'class-a' : 'class-b'
        const cond = n as { consequent: Node; alternate: Node }
        visit(cond.consequent)
        visit(cond.alternate)
        break
      }

      case 'LogicalExpression': {
        // Handle logical: condition && 'class-a'
        const log = n as { left: Node; right: Node }
        visit(log.left)
        visit(log.right)
        break
      }

      default:
        // Ignore other node types (identifiers, member expressions, etc.)
        break
    }
  }

  visit(node)
  return values
}

/**
 * Get the className attribute value node from a JSX element
 * Note: This function handles JSX nodes which are not in the base estree types
 */
export function getClassNameNode(
  node: Rule.Node,
): { node: Rule.Node; value: string | null } | null {
  // Cast to unknown first to handle JSX types not in estree
  const nodeType = (node as unknown as { type: string }).type

  if (nodeType !== 'JSXAttribute') {
    return null
  }

  const attr = node as unknown as {
    name: { type: string; name: string }
    value: Rule.Node | null
  }

  if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'className') {
    return null
  }

  if (!attr.value) {
    return null
  }

  const valueType = (attr.value as unknown as { type: string }).type

  // Direct string literal: className="flex"
  if (valueType === 'Literal') {
    const lit = attr.value as unknown as Literal
    if (typeof lit.value === 'string') {
      return { node: attr.value, value: lit.value }
    }
  }

  // Expression container: className={...}
  if (valueType === 'JSXExpressionContainer') {
    const container = attr.value as unknown as { expression: Rule.Node }
    return { node: container.expression, value: null }
  }

  return null
}

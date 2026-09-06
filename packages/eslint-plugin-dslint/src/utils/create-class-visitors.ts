import type { Rule } from 'eslint'

import {
  extractStringValues,
  isStringLiteral,
  isTemplateLiteral,
  CLASS_UTILITY_NAMES,
} from './ast-utils.js'

/** Visits class-bearing JSX and utility calls for both design-token rules.
 * @param checkClassString - The rule's policy for each static class list.
 * @returns ESLint listeners with identical traversal for both rules.
 * @example createClassVisitors(checkClassString)
 */
export function createClassVisitors(
  checkClassString: (node: Rule.Node, value: string) => void,
): Rule.RuleListener {
  /**
   * Check all string values extracted from a node
   */
  function checkNode(node: Rule.Node): void {
    const values = extractStringValues(node)
    for (const value of values) {
      checkClassString(node, value)
    }
  }

  return {
    // Handle className="..."
    'JSXAttribute[name.name="className"] > Literal'(node: Rule.Node) {
      if (isStringLiteral(node)) {
        checkClassString(node, node.value)
      }
    },

    // Handle className={`...`}
    'JSXAttribute[name.name="className"] > JSXExpressionContainer > TemplateLiteral'(
      node: Rule.Node,
    ) {
      if (isTemplateLiteral(node)) {
        const tl = node
        for (const quasi of tl.quasis) {
          if (quasi.value.raw) {
            checkClassString(node, quasi.value.raw)
          }
        }
      }
    },

    // One selector covers JSX and ordinary utility calls, including cva, without double reporting.
    [`CallExpression[callee.name=/^(${CLASS_UTILITY_NAMES.join('|')})$/]`](
      node: Rule.Node,
    ) {
      checkNode(node)
    },
  }
}

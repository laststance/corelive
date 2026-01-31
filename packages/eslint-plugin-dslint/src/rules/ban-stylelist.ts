/**
 * ban-stylelist Rule
 *
 * Blacklist mode: Forbid specific hardcoded patterns.
 * Use this for lighter enforcement when you only want to ban certain patterns.
 *
 * Core Concept:
 * デザインシステムのデザイントークンを使ってスタイリングしていたら no warning。
 * デザイントークンに存在しないスタイリングに warning を出す。
 */
import type { Rule } from 'eslint'

import {
  parseClassString,
  hasArbitraryValue,
  isCSSVariableValue,
  isCalcExpression,
  categorizeArbitraryValue,
  type ArbitraryCategory,
} from '../utils/class-parser.js'
import {
  extractStringValues,
  isStringLiteral,
  isTemplateLiteral,
  isClassUtilityCall,
  CLASS_UTILITY_NAMES,
} from '../utils/ast-utils.js'

interface ForbidConfig {
  colors?: boolean
  spacing?: boolean
  sizing?: boolean
  other?: boolean
}

interface BanStylelistOptions {
  forbid?: ForbidConfig
}

const defaultOptions: BanStylelistOptions = {
  forbid: {
    colors: true,
    spacing: true,
    sizing: true,
    other: true,
  },
}

export const banStylelist: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Forbid hardcoded values in Tailwind classes',
      category: 'Design System',
      recommended: false,
      url: 'https://github.com/laststance/corelive/tree/main/packages/eslint-plugin-dslint#ban-stylelist',
    },
    schema: [
      {
        type: 'object',
        properties: {
          forbid: {
            type: 'object',
            properties: {
              colors: {
                type: 'boolean',
                description:
                  'Forbid hardcoded colors like #hex, rgb(), oklch()',
              },
              spacing: {
                type: 'boolean',
                description: 'Forbid hardcoded spacing like p-[17px]',
              },
              sizing: {
                type: 'boolean',
                description: 'Forbid hardcoded sizes like w-[123px]',
              },
              other: {
                type: 'boolean',
                description: 'Forbid other arbitrary values',
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenColor:
        '"{{className}}" uses a hardcoded color. Use design tokens instead.',
      forbiddenSpacing:
        '"{{className}}" uses a hardcoded spacing value. Use design tokens instead.',
      forbiddenSizing:
        '"{{className}}" uses a hardcoded size value. Use design tokens instead.',
      forbiddenArbitrary:
        '"{{className}}" uses an arbitrary value. Use design tokens instead.',
    },
  },

  create(context) {
    const options: BanStylelistOptions = {
      ...defaultOptions,
      forbid: {
        ...defaultOptions.forbid,
        ...(context.options[0] as BanStylelistOptions | undefined)?.forbid,
      },
    }

    const { forbid } = options

    /**
     * Get the message ID for a category
     */
    function getMessageId(category: ArbitraryCategory): string {
      switch (category) {
        case 'color':
          return 'forbiddenColor'
        case 'spacing':
          return 'forbiddenSpacing'
        case 'sizing':
          return 'forbiddenSizing'
        default:
          return 'forbiddenArbitrary'
      }
    }

    /**
     * Check if a category is forbidden
     */
    function isForbidden(category: ArbitraryCategory): boolean {
      switch (category) {
        case 'color':
          return forbid?.colors ?? true
        case 'spacing':
          return forbid?.spacing ?? true
        case 'sizing':
          return forbid?.sizing ?? true
        case 'other':
          return forbid?.other ?? true
        default:
          return false
      }
    }

    /**
     * Check a class name for violations
     */
    function checkClassName(node: Rule.Node, className: string): void {
      // Only check arbitrary values
      if (!hasArbitraryValue(className)) {
        return
      }

      // CSS variables and calc() are always allowed
      if (isCSSVariableValue(className) || isCalcExpression(className)) {
        return
      }

      // Categorize the arbitrary value
      const category = categorizeArbitraryValue(className)
      if (!category) {
        return
      }

      // Check if this category is forbidden
      if (isForbidden(category)) {
        context.report({
          node,
          messageId: getMessageId(category),
          data: { className },
        })
      }
    }

    /**
     * Check a class string for violations
     */
    function checkClassString(node: Rule.Node, value: string): void {
      const classes = parseClassString(value)
      for (const className of classes) {
        checkClassName(node, className)
      }
    }

    /**
     * Check all string values extracted from a node
     */
    function checkNode(node: Rule.Node): void {
      const values = extractStringValues(
        node as unknown as import('estree').Node,
      )
      for (const value of values) {
        checkClassString(node, value)
      }
    }

    return {
      // Handle className="..."
      'JSXAttribute[name.name="className"] > Literal'(node: Rule.Node) {
        if (isStringLiteral(node as unknown as import('estree').Node)) {
          const value = (node as unknown as { value: string }).value
          checkClassString(node, value)
        }
      },

      // Handle className={`...`}
      'JSXAttribute[name.name="className"] > JSXExpressionContainer > TemplateLiteral'(
        node: Rule.Node,
      ) {
        if (isTemplateLiteral(node as unknown as import('estree').Node)) {
          const tl = node as unknown as import('estree').TemplateLiteral
          for (const quasi of tl.quasis) {
            if (quasi.value.raw) {
              checkClassString(node, quasi.value.raw)
            }
          }
        }
      },

      // Handle className={cn(...)} / clsx(...) / cva(...)
      'JSXAttribute[name.name="className"] > JSXExpressionContainer > CallExpression'(
        node: Rule.Node,
      ) {
        const ce = node as unknown as import('estree').CallExpression
        if (isClassUtilityCall(ce)) {
          checkNode(node)
        }
      },

      // Handle direct cn(...) calls
      [`CallExpression[callee.name=/^(${CLASS_UTILITY_NAMES.join('|')})$/]`](
        node: Rule.Node,
      ) {
        checkNode(node)
      },

      // Handle cva() definitions
      'CallExpression[callee.name="cva"]'(node: Rule.Node) {
        checkNode(node)
      },
    }
  },
}

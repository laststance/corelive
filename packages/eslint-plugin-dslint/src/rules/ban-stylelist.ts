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
import { createClassVisitors } from '../utils/create-class-visitors.js'

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
      const optionKeys = {
        color: 'colors',
        spacing: 'spacing',
        sizing: 'sizing',
        other: 'other',
      } as const
      return forbid?.[optionKeys[category]] ?? true
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

    return createClassVisitors(checkClassString)
  },
}

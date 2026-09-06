/**
 * token-only Rule
 *
 * Whitelist mode: Only allow classes that exist in tailwind.config.ts
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
} from '../utils/class-parser.js'
import { createClassVisitors } from '../utils/create-class-visitors.js'
import {
  resolveTokens,
  buildAllowedClasses,
  isAllowedClass,
} from '../utils/token-resolver.js'

interface TokenOnlyOptions {
  tokenSource: string
  ignore?: string[]
}

const defaultOptions: TokenOnlyOptions = {
  tokenSource: './tailwind.config.ts',
  ignore: [],
}

export const tokenOnly: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Only allow Tailwind classes defined in tailwind.config.ts design tokens',
      recommended: true,
      url: 'https://github.com/laststance/corelive/tree/main/packages/eslint-plugin-dslint#token-only',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tokenSource: {
            type: 'string',
            description: 'Path to tailwind.config.ts',
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            description: 'Patterns to ignore (supports * wildcard)',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unknownClass:
        '"{{className}}" is not a design token. Use classes defined in tailwind.config.ts.',
      arbitraryValue:
        '"{{className}}" uses an arbitrary value. Use design tokens instead.',
    },
  },

  create(context) {
    const options: TokenOnlyOptions = {
      ...defaultOptions,
      ...(context.options[0] as Partial<TokenOnlyOptions> | undefined),
    }

    // Resolve tokens from config
    const tokens = resolveTokens({
      tokenSource: options.tokenSource,
      cwd: context.cwd,
    })

    // Build allowed classes set
    const allowedClasses = buildAllowedClasses(tokens)

    /**
     * Report a class name violation
     */
    function reportViolation(node: Rule.Node, className: string): void {
      // Check if it's an arbitrary value (special message)
      if (hasArbitraryValue(className)) {
        // CSS variables and calc() are allowed
        if (isCSSVariableValue(className) || isCalcExpression(className)) {
          return
        }

        context.report({
          node,
          messageId: 'arbitraryValue',
          data: { className },
        })
        return
      }

      // Check against allowed classes
      if (!isAllowedClass(className, allowedClasses, options.ignore)) {
        context.report({
          node,
          messageId: 'unknownClass',
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
        reportViolation(node, className)
      }
    }

    return createClassVisitors(checkClassString)
  },
}

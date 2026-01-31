/**
 * eslint-plugin-dslint
 *
 * Design System Lint - Enforce design token compliance in Tailwind CSS.
 *
 * Core Concept:
 * デザインシステムのデザイントークンを使ってスタイリングしていたら no warning。
 * デザイントークンに存在しないスタイリングに warning を出す。
 */
import type { ESLint } from 'eslint'

import { tokenOnly } from './rules/token-only.js'
import { banStylelist } from './rules/ban-stylelist.js'

const plugin = {
  meta: {
    name: 'eslint-plugin-dslint',
    version: '0.1.0',
  },
  rules: {
    'token-only': tokenOnly,
    'ban-stylelist': banStylelist,
  },
} satisfies ESLint.Plugin

export default plugin
export { tokenOnly, banStylelist }

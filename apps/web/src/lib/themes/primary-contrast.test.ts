/**
 * @fileoverview `--primary` readability (#213, CEO-13 / DES-6).
 *
 * The LiveEditor "Accent" text preset paints text with `var(--primary)`, so
 * `--primary` must stay AA (4.5:1) on both `--background` and `--card` for the
 * Default pair and for Warm Cathedral light/dark.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { CATHEDRAL } from '../../../scripts/generate-theme-css'

import { AA_TEXT_CONTRAST, contrastRatio } from './contrast'

const generatedCss = readFileSync(
  resolve(process.cwd(), '../../packages/live-editor/src/styles/generated.css'),
  'utf-8',
)

/** Reads one token from a generated.css `selector { }` block. */
const readGeneratedToken = (selector: string, token: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block =
    generatedCss.match(new RegExp(`${escaped} \\{([^}]*)\\}`))?.[1] ?? ''
  const value = block.match(new RegExp(`${token}: ([^;]+);`))?.[1]
  if (!value) throw new Error(`${token} missing from ${selector}`)
  return value
}

const PALETTES: ReadonlyArray<{
  name: string
  read: (token: string) => string
}> = [
  {
    name: 'Default light',
    read: (token) => readGeneratedToken(":root[data-theme='light']", token),
  },
  {
    name: 'Default dark',
    read: (token) => readGeneratedToken(":root[data-theme='dark']", token),
  },
  {
    name: 'Warm Cathedral light',
    read: (token) => CATHEDRAL.light[token] ?? '',
  },
  { name: 'Warm Cathedral dark', read: (token) => CATHEDRAL.dark[token] ?? '' },
]

describe('--primary contrast (Accent text preset)', () => {
  test.each(PALETTES)(
    'keeps --primary at or above 4.5:1 on --background and --card in $name',
    ({ read }) => {
      // Arrange
      const primary = read('--primary')

      // Act
      const onBackground = contrastRatio(primary, read('--background'))
      const onCard = contrastRatio(primary, read('--card'))

      // Assert
      expect(onBackground).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
      expect(onCard).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
    },
  )
})

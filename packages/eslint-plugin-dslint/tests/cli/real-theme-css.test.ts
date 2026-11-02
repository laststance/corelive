import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, test, expect } from 'vitest'

import { THEME_REGISTRY } from '../../../live-editor/src/themes/registry.js'
import { parseCSSContent } from '../../src/cli/css-parser.js'

/** Reads a stylesheet that ships in the live-editor package. */
const readStyles = (fileName: string): string =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../live-editor/src/styles/${fileName}`, import.meta.url),
    ),
    'utf-8',
  )

// generated.css is imported before base.css by both apps, so concatenate in that order
const realCss = `${readStyles('generated.css')}\n${readStyles('base.css')}`

describe('parseCSSContent on the real generated.css + base.css', () => {
  test("tags the Default light seed as the 'light' palette so dslint sync reads shadcn Default, not Warm Cathedral", () => {
    // Arrange
    const defaultLightTokens = THEME_REGISTRY.light.tokens

    // Act
    const lightVariables = parseCSSContent(realCss).filter(
      (v) => v.theme === 'light',
    )

    // Assert — every Default light token is present under 'light' with the seed value
    for (const [name, value] of Object.entries(defaultLightTokens)) {
      const tagged = lightVariables.filter((v) => v.name === name)
      expect(tagged.length, name).toBeGreaterThan(0)
      expect(
        tagged.every((v) => v.value.trim() === value),
        `${name} has a non-Default light value: ${tagged.map((v) => v.value.trim()).join(' | ')}`,
      ).toBe(true)
    }
  })

  test("never tags a Default dark value as 'light' or 'base'", () => {
    // Arrange — values that exist only in the dark seed
    const darkOnlyValues = new Set(
      Object.entries(THEME_REGISTRY.dark.tokens)
        .filter(
          ([name, value]) =>
            THEME_REGISTRY.light.tokens[
              name as keyof typeof THEME_REGISTRY.light.tokens
            ] !== value,
        )
        .map(([name, value]) => `${name}=${value}`),
    )

    // Act
    const leaked = parseCSSContent(realCss)
      .filter((v) => v.theme === 'light' || v.theme === 'base')
      .filter((v) => darkOnlyValues.has(`${v.name}=${v.value.trim()}`))

    // Assert
    expect(leaked).toEqual([])
  })
})

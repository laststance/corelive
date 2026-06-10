import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio, AA_TEXT_CONTRAST } from '@/lib/themes/contrast'

/**
 * The skill-tree ships a bespoke TWO-palette identity that is NOT derived from the
 * theme seeds: parchment for every light family ([data-theme$='light']) and
 * dark-fantasy for every dark family (the bare default). Because the generator's
 * per-theme AA gate never sees these hand-authored `--st-*` values, the legibility
 * of the primary ink (`--st-cream`) on its surface is verified here, straight from
 * the CSS — so a future palette tweak that dropped below AA fails CI.
 */
const stylesCss = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/skill-tree/styles.css'),
  'utf-8',
)

/** Reads a `--st-*` value out of a single CSS block body, or fails loudly. */
const stVar = (blockBody: string, name: string): string => {
  const match = blockBody.match(new RegExp(`${name}:\\s*([^;]+);`))
  const value = match?.[1]
  if (value === undefined)
    throw new Error(`${name} not found in skill-tree block`)
  return value.trim()
}

// Dark-fantasy default: the bare `[data-skill-tree='true']` block (line-anchored so
// the descendant parchment selector below is not matched here).
const darkFantasyBlock = stylesCss.match(
  /\n\[data-skill-tree='true'\]\s*\{([^}]+)\}/,
)?.[1]
// Parchment: the `[data-theme$='light'] [data-skill-tree='true']` descendant block.
const parchmentBlock = stylesCss.match(
  /\[data-theme\$='light'\]\s+\[data-skill-tree='true'\]\s*\{([^}]+)\}/,
)?.[1]

describe('skill-tree palette legibility — primary ink stays AA on its surface', () => {
  it('keeps parchment cream readable on the parchment surface for every light family', () => {
    // Arrange
    if (parchmentBlock === undefined)
      throw new Error('parchment block not found')
    const cream = stVar(parchmentBlock, '--st-cream')
    const surface = stVar(parchmentBlock, '--st-surface')

    // Act / Assert
    expect(contrastRatio(cream, surface)).toBeGreaterThanOrEqual(
      AA_TEXT_CONTRAST,
    )
  })

  it('keeps dark-fantasy cream readable on the dark surface for every dark family', () => {
    // Arrange
    if (darkFantasyBlock === undefined)
      throw new Error('dark-fantasy block not found')
    const cream = stVar(darkFantasyBlock, '--st-cream')
    const surface = stVar(darkFantasyBlock, '--st-surface')

    // Act / Assert
    expect(contrastRatio(cream, surface)).toBeGreaterThanOrEqual(
      AA_TEXT_CONTRAST,
    )
  })
})

/**
 * WCAG AA lock for the Warm Cathedral accent CTAs.
 *
 * Cathedral light/dark are hand-authored (the generator skips preserved themes),
 * so the generator's per-family AA gate never covers them. The amber `--primary`
 * carries white `--primary-foreground` on buttons and the active sidebar item;
 * before this lock it sat at L0.62 (white-on-amber 3.75:1, below AA). This test
 * reads the cathedral tokens from the generator's mirror (kept in sync with
 * globals.css by cathedral-css-snapshot.test.ts) and fails if any accent fill
 * stops carrying AA-readable text.
 */
import { describe, it, expect } from 'vitest'

import { CATHEDRAL } from '../../../scripts/generate-theme-css'

import { AA_TEXT_CONTRAST, contrastRatio } from './contrast'
import type { ThemeMode } from './registry'

/** Accent fills whose foreground token renders as overlaid text (CTA, active sidebar item). */
const ACCENT_TEXT_PAIRS = [
  ['--primary', '--primary-foreground'],
  ['--sidebar-primary', '--sidebar-primary-foreground'],
] as const

/** Reads a required token, failing loudly if cathedral is missing it. */
function tokenOf(tokens: Record<string, string>, name: string): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`cathedral is missing ${name}`)
  return value
}

describe('Warm Cathedral accent CTAs carry AA-readable text (≥4.5:1)', () => {
  for (const mode of ['light', 'dark'] as const satisfies ThemeMode[]) {
    for (const [fill, foreground] of ACCENT_TEXT_PAIRS) {
      it(`${mode} ${fill}: ${foreground} text is readable on the accent fill`, () => {
        // Arrange
        const tokens = CATHEDRAL[mode]
        // Act
        const ratio = contrastRatio(
          tokenOf(tokens, foreground),
          tokenOf(tokens, fill),
        )
        // Assert
        expect(ratio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
      })
    }
  }
})

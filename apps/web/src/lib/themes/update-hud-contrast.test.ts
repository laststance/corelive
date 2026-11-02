/**
 * @fileoverview Update-download window (HUD) contrast for every theme (#214, D-2).
 *
 * The Electron HUD paints an opaque `--popover` panel with `--popover-foreground`
 * label text, `--muted-foreground` percent/hint text and a `--primary` bar fill on
 * a `color-mix(in oklch, var(--primary) 20%, transparent)` track. This gate reads
 * the shipped `THEME_TOKENS` map, so every theme a user can pick is covered, not
 * only the screenshot representatives.
 */
import { THEME_TOKENS } from '@corelive/live-editor/theme-tokens'
import { converter, formatRgb } from 'culori'
import { describe, expect, test } from 'vitest'

import { AA_LARGE_CONTRAST, AA_TEXT_CONTRAST, contrastRatio } from './contrast'
import { THEME_IDS } from './registry'

/** Share of `--primary` in the HUD track (`color-mix(… var(--primary) 20%, transparent)`). */
const TRACK_PRIMARY_ALPHA = 0.2

const toRgb = converter('rgb')

/**
 * The color the browser paints for the HUD track: `--primary` at 20% alpha
 * composited over the opaque `--popover` panel in sRGB.
 * @param primary - The theme's `--primary`.
 * @param popover - The theme's `--popover`.
 * @returns the composited track color as an `rgb()` string.
 */
function compositeTrackColor(primary: string, popover: string): string {
  const top = toRgb(primary)
  const bottom = toRgb(popover)
  if (!top || !bottom)
    throw new Error(`Unparsable HUD color ${primary} / ${popover}`)
  return formatRgb({
    mode: 'rgb',
    r: top.r * TRACK_PRIMARY_ALPHA + bottom.r * (1 - TRACK_PRIMARY_ALPHA),
    g: top.g * TRACK_PRIMARY_ALPHA + bottom.g * (1 - TRACK_PRIMARY_ALPHA),
    b: top.b * TRACK_PRIMARY_ALPHA + bottom.b * (1 - TRACK_PRIMARY_ALPHA),
  })
}

describe('update-download window contrast for every theme', () => {
  test.each(THEME_IDS)(
    '%s keeps the HUD label, percent and hint readable on its panel (AA 4.5:1)',
    (themeId) => {
      // Arrange
      const tokens = THEME_TOKENS[themeId]

      // Act
      const labelContrast = contrastRatio(
        tokens['--popover-foreground'],
        tokens['--popover'],
      )
      const mutedContrast = contrastRatio(
        tokens['--muted-foreground'],
        tokens['--popover'],
      )

      // Assert
      expect(labelContrast).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
      expect(mutedContrast).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
    },
  )

  test.each(THEME_IDS)(
    '%s keeps the progress fill visible on the panel and on its own track (3:1)',
    (themeId) => {
      // Arrange
      const tokens = THEME_TOKENS[themeId]
      const trackColor = compositeTrackColor(
        tokens['--primary'],
        tokens['--popover'],
      )

      // Act
      const fillOnPanel = contrastRatio(
        tokens['--primary'],
        tokens['--popover'],
      )
      const fillOnTrack = contrastRatio(tokens['--primary'], trackColor)

      // Assert
      expect(fillOnPanel).toBeGreaterThanOrEqual(AA_LARGE_CONTRAST)
      expect(fillOnTrack).toBeGreaterThanOrEqual(AA_LARGE_CONTRAST)
    },
  )
})

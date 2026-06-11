/**
 * WCAG 1.4.11 lock for the unchecked checkbox/control stroke.
 *
 * globals.css derives `--control-border` as
 * `color-mix(in oklch, var(--input), var(--foreground) 40%)`, which must stay
 * ≥3:1 against the surface behind the control on EVERY theme — the raw `--input`
 * is only ~1.2:1 (the bug this fixes). This test replays that color-mix against
 * each theme's real tokens (cathedral from CATHEDRAL, families via
 * deriveThemeTokens — the same derivation the CSS generator uses) so a future
 * neutral-token tweak that quietly drops the stroke below 3:1 fails CI.
 */
import { converter, wcagContrast } from 'culori'
import { describe, it, expect } from 'vitest'

import {
  CATHEDRAL,
  deriveThemeTokens,
} from '../../../scripts/generate-theme-css'

import { AA_LARGE_CONTRAST } from './contrast'
import { THEME_IDS, THEME_REGISTRY, type ThemeSeed } from './registry'

const toOklch = converter('oklch')
const toRgb = converter('rgb')

/**
 * Foreground weight in the `--control-border` color-mix. MUST stay in sync with
 * the `40%` in globals.css `--control-border` — the CSS is the source of truth.
 */
const MIX_TOWARD_FOREGROUND = 0.4

/**
 * Replicates `color-mix(in oklch, input, foreground 40%)` with CSS premultiplied-
 * alpha semantics (dark themes carry a translucent-white `--input`), returning the
 * mixed color plus its resulting alpha.
 * @param inputCss - The control's base border token (`--input`).
 * @param foregroundCss - The theme's `--foreground` (near-ink light / near-paper dark).
 * @returns the mixed OKLCH color and its alpha (sub-1 only in dark themes).
 * @example
 * mixControlBorder('oklch(0.908 0.022 76)', 'oklch(0.18 0.015 30)')
 * //   → ~oklch(0.617 0.019 57.6) at alpha 1
 */
function mixControlBorder(inputCss: string, foregroundCss: string) {
  const input = toOklch(inputCss)
  const foreground = toOklch(foregroundCss)
  if (!input || !foreground) {
    throw new Error(`Unparsable token: ${inputCss} / ${foregroundCss}`)
  }
  const weightForeground = MIX_TOWARD_FOREGROUND
  const weightInput = 1 - weightForeground
  const alphaInput = input.alpha ?? 1
  const alphaForeground = foreground.alpha ?? 1
  const alpha = alphaInput * weightInput + alphaForeground * weightForeground
  // Premultiplied interpolation for the lightness/chroma channels.
  const channel = (fromInput: number, fromForeground: number) =>
    (fromInput * alphaInput * weightInput +
      fromForeground * alphaForeground * weightForeground) /
    alpha
  // Hue is an angle — interpolate along the shortest arc, not premultiplied.
  const hueInput = input.h ?? 0
  const hueForeground = foreground.h ?? 0
  let hueDelta = hueForeground - hueInput
  if (hueDelta > 180) hueDelta -= 360
  if (hueDelta < -180) hueDelta += 360
  return {
    color: {
      mode: 'oklch' as const,
      l: channel(input.l, foreground.l),
      c: channel(input.c, foreground.c),
      h: hueInput + hueDelta * weightForeground,
    },
    alpha,
  }
}

/**
 * Effective WCAG contrast of the `--control-border` stroke against a surface,
 * compositing the (possibly translucent) stroke over that surface first.
 * @param inputCss - `--input` token.
 * @param foregroundCss - `--foreground` token.
 * @param surfaceCss - The opaque surface behind the control (`--background` or `--card`).
 * @returns the contrast ratio (1–21) of the rendered stroke vs the surface.
 * @example
 * controlBorderContrast(input, foreground, background) // => 3.45
 */
function controlBorderContrast(
  inputCss: string,
  foregroundCss: string,
  surfaceCss: string,
): number {
  const { color, alpha } = mixControlBorder(inputCss, foregroundCss)
  const stroke = toRgb(color)
  const surface = toRgb(surfaceCss)
  if (!stroke || !surface) {
    throw new Error(`Unparsable surface: ${surfaceCss}`)
  }
  const blend = (channel: 'r' | 'g' | 'b') =>
    stroke[channel] * alpha + surface[channel] * (1 - alpha)
  const composited = {
    mode: 'rgb' as const,
    r: blend('r'),
    g: blend('g'),
    b: blend('b'),
  }
  return wcagContrast(composited, surfaceCss)
}

/** A theme's resolved token map — cathedral is hand-authored, families are derived. */
function themeTokens(seed: ThemeSeed): Record<string, string> {
  return seed.preserve ? CATHEDRAL[seed.mode] : deriveThemeTokens(seed)
}

/** Reads a required token, failing loudly if a theme is missing it. */
function tokenOf(tokens: Record<string, string>, name: string): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`theme is missing ${name}`)
  return value
}

describe('control-border stroke meets WCAG 1.4.11 (≥3:1) on every theme', () => {
  for (const id of THEME_IDS) {
    it(`${id}: an unchecked checkbox is distinguishable from its surface`, () => {
      // Arrange
      const tokens = themeTokens(THEME_REGISTRY[id])
      const input = tokenOf(tokens, '--input')
      const foreground = tokenOf(tokens, '--foreground')
      // Act — the control may sit on either the page background or a card
      const vsBackground = controlBorderContrast(
        input,
        foreground,
        tokenOf(tokens, '--background'),
      )
      const vsCard = controlBorderContrast(
        input,
        foreground,
        tokenOf(tokens, '--card'),
      )
      // Assert — worst-case surface still clears the non-text UI threshold
      expect(Math.min(vsBackground, vsCard)).toBeGreaterThanOrEqual(
        AA_LARGE_CONTRAST,
      )
    })
  }
})

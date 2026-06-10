import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { CATHEDRAL } from '../../../scripts/generate-theme-css'

/**
 * Brand pin for the Warm Cathedral default. The theme generator deliberately
 * SKIPS preserved themes (cathedral light/dark stay hand-authored in globals.css),
 * so nothing regenerates them — this snapshot is what guarantees they never drift.
 * If a change here is intentional, it is a deliberate brand change and the
 * snapshot is updated knowingly.
 */
const globalsCss = readFileSync(
  resolve(process.cwd(), 'src/globals.css'),
  'utf-8',
)

/** Pulls a single `selector { … }` block (no nested braces) out of globals.css. */
const extractBlock = (pattern: RegExp): string => {
  const match = globalsCss.match(pattern)
  if (!match) throw new Error(`block not found for ${String(pattern)}`)
  return match[0]
}

describe('Warm Cathedral default CSS — byte-for-byte brand pin', () => {
  it('keeps the :root (cathedral light) token block unchanged', () => {
    // Arrange / Act
    const rootBlock = extractBlock(/:root \{[^}]*\}/)

    // Assert
    expect(rootBlock).toMatchInlineSnapshot(`
      ":root {
        --radius: 0.625rem;
        /* Warm Cathedral — light theme · golden-hour neutrals (warmed paper, dawn, amber, terracotta).
           Neutral surfaces carry OKLCH chroma 0.016–0.024 (was 0.005–0.01) so the room reads as
           late-afternoon light, not clinical white. Accent/text/heatmap are unchanged. WCAG AA holds
           (text/bg 17.5:1, muted-fg/card 5.6:1). See DESIGN.md "App-wide warm-up". */
        --background: oklch(0.975 0.016 80);
        --foreground: oklch(0.18 0.015 30);
        --card: oklch(0.972 0.018 78);
        --card-foreground: oklch(0.18 0.015 30);
        --popover: oklch(0.972 0.018 78);
        --popover-foreground: oklch(0.18 0.015 30);
        --primary: oklch(0.62 0.16 50);
        --primary-foreground: oklch(0.99 0 0);
        --secondary: oklch(0.942 0.024 78);
        --secondary-foreground: oklch(0.18 0.015 30);
        --muted: oklch(0.942 0.024 78);
        --muted-foreground: oklch(0.5 0.026 56);
        --accent: oklch(0.942 0.024 78);
        --accent-foreground: oklch(0.18 0.015 30);
        --destructive: oklch(0.6 0.2 25);
        --border: oklch(0.908 0.022 76);
        --input: oklch(0.908 0.022 76);
        --ring: oklch(0.62 0.16 50);
        --chart-1: oklch(0.62 0.16 50);
        --chart-2: oklch(0.65 0.13 145);
        --chart-3: oklch(0.6 0.1 230);
        --chart-4: oklch(0.7 0.14 80);
        --chart-5: oklch(0.55 0.16 40);
        --sidebar: oklch(0.972 0.018 78);
        --sidebar-foreground: oklch(0.18 0.015 30);
        --sidebar-primary: oklch(0.62 0.16 50);
        --sidebar-primary-foreground: oklch(0.99 0 0);
        --sidebar-accent: oklch(0.942 0.024 78);
        --sidebar-accent-foreground: oklch(0.18 0.015 30);
        --sidebar-border: oklch(0.908 0.022 76);
        --sidebar-ring: oklch(0.62 0.16 50);
        /* Heatmap temperature gradient — paper → dawn → amber → honey → terracotta */
        --hm-0: oklch(0.96 0.008 80);
        --hm-1: oklch(0.89 0.06 75);
        --hm-2: oklch(0.78 0.11 70);
        --hm-3: oklch(0.65 0.14 60);
        --hm-4: oklch(0.55 0.16 40);
      }"
    `)
  })

  it("keeps the [data-theme='dark'] (cathedral dark) token block unchanged", () => {
    // Arrange / Act
    const darkBlock = extractBlock(/\[data-theme='dark'\] \{[^}]*\}/)

    // Assert
    expect(darkBlock).toMatchInlineSnapshot(`
      "[data-theme='dark'] {
        /* Warm Cathedral — dark theme · golden-hour neutrals (warm coal, ember, copper, warm sun).
           Coal surfaces carry OKLCH chroma 0.026–0.028 (was 0.012–0.015) so the dark room glows like
           embers, not slate. Accent/text/heatmap unchanged. WCAG AA holds (text/bg 17:1, muted-fg/card
           7.3:1). See DESIGN.md "App-wide warm-up". */
        --background: oklch(0.172 0.026 40);
        --foreground: oklch(0.96 0.005 75);
        --card: oklch(0.235 0.028 44);
        --card-foreground: oklch(0.96 0.005 75);
        --popover: oklch(0.235 0.028 44);
        --popover-foreground: oklch(0.96 0.005 75);
        --primary: oklch(0.7 0.16 55);
        --primary-foreground: oklch(0.16 0.012 35);
        --secondary: oklch(0.285 0.026 44);
        --secondary-foreground: oklch(0.96 0.005 75);
        --muted: oklch(0.285 0.026 44);
        --muted-foreground: oklch(0.74 0.026 66);
        --accent: oklch(0.285 0.026 44);
        --accent-foreground: oklch(0.96 0.005 75);
        --destructive: oklch(0.7 0.19 25);
        --border: oklch(1 0 0 / 8%);
        --input: oklch(1 0 0 / 12%);
        --ring: oklch(0.7 0.16 55);
        --chart-1: oklch(0.7 0.16 55);
        --chart-2: oklch(0.65 0.13 145);
        --chart-3: oklch(0.6 0.1 230);
        --chart-4: oklch(0.7 0.14 80);
        --chart-5: oklch(0.7 0.15 65);
        --sidebar: oklch(0.235 0.028 44);
        --sidebar-foreground: oklch(0.96 0.005 75);
        --sidebar-primary: oklch(0.7 0.16 55);
        --sidebar-primary-foreground: oklch(0.16 0.012 35);
        --sidebar-accent: oklch(0.285 0.026 44);
        --sidebar-accent-foreground: oklch(0.96 0.005 75);
        --sidebar-border: oklch(1 0 0 / 8%);
        --sidebar-ring: oklch(0.7 0.16 55);
        /* Heatmap temperature gradient — warm coal → ember → copper → brass → warm sun */
        --hm-0: oklch(0.22 0.012 40);
        --hm-1: oklch(0.32 0.06 50);
        --hm-2: oklch(0.45 0.1 55);
        --hm-3: oklch(0.58 0.13 60);
        --hm-4: oklch(0.7 0.15 65);
      }"
    `)
  })
})

describe('generator cathedral ladder mirrors globals.css', () => {
  it('emits every cathedral token at the globals.css value so derived themes never derive from a stale ladder', () => {
    // Arrange — the generator hardcodes the cathedral L/C ladder; it must match
    // the hand-authored source, or colored families (T7) would derive wrong values
    const drifted: string[] = []

    // Act — every ladder entry must appear verbatim in globals.css
    for (const mode of ['light', 'dark'] as const) {
      for (const [tokenName, value] of Object.entries(CATHEDRAL[mode])) {
        if (!globalsCss.includes(`${tokenName}: ${value};`)) {
          drifted.push(`${mode} ${tokenName}: ${value}`)
        }
      }
    }

    // Assert
    expect(drifted).toEqual([])
  })
})

describe('generator ladder covers every globals.css color token (reverse drift-guard)', () => {
  // --radius is a layout token (only in :root, absent from the dark block); the
  // color ladder deliberately omits it, so it is excluded from this coverage check.
  const LAYOUT_TOKENS_NOT_IN_LADDER = ['--radius']

  /** Every `--token` name declared in a CSS block, in source order. */
  const declaredTokens = (block: string): string[] => {
    const names: string[] = []
    for (const match of block.matchAll(/--[\w-]+(?=:)/g)) {
      names.push(match[0])
    }
    return names
  }

  it('classifies every cathedral light token so derived themes never derive from a stale ladder', () => {
    // Arrange
    const block = extractBlock(/:root \{[^}]*\}/)

    // Act — globals.css light tokens the generator ladder fails to carry
    const missing = declaredTokens(block).filter(
      (token) =>
        !LAYOUT_TOKENS_NOT_IN_LADDER.includes(token) &&
        !Object.hasOwn(CATHEDRAL.light, token),
    )

    // Assert
    expect(missing).toEqual([])
  })

  it('classifies every cathedral dark token so derived themes never derive from a stale ladder', () => {
    // Arrange
    const block = extractBlock(/\[data-theme='dark'\] \{[^}]*\}/)

    // Act — globals.css dark tokens the generator ladder fails to carry
    const missing = declaredTokens(block).filter(
      (token) =>
        !LAYOUT_TOKENS_NOT_IN_LADDER.includes(token) &&
        !Object.hasOwn(CATHEDRAL.dark, token),
    )

    // Assert
    expect(missing).toEqual([])
  })
})

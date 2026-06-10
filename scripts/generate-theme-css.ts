/**
 * Theme CSS generator — reads the theme registry and writes
 * `src/lib/themes/generated.css` with one block per DERIVED (colored) theme.
 *
 * Preserved themes (Warm Cathedral light/dark) are SKIPPED: their CSS stays
 * hand-authored in globals.css and is pinned by a snapshot test, so the brand
 * never drifts. Derived themes get their ~36 color tokens computed from OKLCH
 * seed params at the fixed cathedral lightness ladder (this file mirrors that
 * ladder), with `--primary-foreground` contrast-computed (never hardcoded white).
 *
 * Run via `pnpm theme:generate`. CI re-runs it and fails on any diff, so
 * generated.css can never be stale. BUILD-TIME ONLY (imports culori via
 * contrast.ts); nothing here ships to the client bundle.
 *
 * @example
 * // add a family seed to registry.ts, then:
 * // $ pnpm theme:generate   → rewrites src/lib/themes/generated.css
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { converter } from 'culori'

import { readableForeground } from '../src/lib/themes/contrast'
import {
  THEME_REGISTRY,
  type DerivedTheme,
  type ThemeMode,
  type ThemeSeed,
} from '../src/lib/themes/registry'

const toOklch = converter('oklch')

/**
 * Cathedral token values, copied verbatim from globals.css `:root` /
 * `[data-theme='dark']`. This is the fixed lightness ladder (neutral L per token)
 * plus the fixed-identity palette (destructive, charts) reused by every theme.
 * Cathedral is `preserve` (never recomputed, never drifts) and globals.css is
 * pinned by the cathedral snapshot test, so this mirror cannot silently diverge.
 */
export const CATHEDRAL: Record<ThemeMode, Record<string, string>> = {
  light: {
    '--background': 'oklch(0.975 0.016 80)',
    '--foreground': 'oklch(0.18 0.015 30)',
    '--card': 'oklch(0.972 0.018 78)',
    '--card-foreground': 'oklch(0.18 0.015 30)',
    '--popover': 'oklch(0.972 0.018 78)',
    '--popover-foreground': 'oklch(0.18 0.015 30)',
    '--primary': 'oklch(0.62 0.16 50)',
    '--primary-foreground': 'oklch(0.99 0 0)',
    '--secondary': 'oklch(0.942 0.024 78)',
    '--secondary-foreground': 'oklch(0.18 0.015 30)',
    '--muted': 'oklch(0.942 0.024 78)',
    '--muted-foreground': 'oklch(0.5 0.026 56)',
    '--accent': 'oklch(0.942 0.024 78)',
    '--accent-foreground': 'oklch(0.18 0.015 30)',
    '--destructive': 'oklch(0.6 0.2 25)',
    '--border': 'oklch(0.908 0.022 76)',
    '--input': 'oklch(0.908 0.022 76)',
    '--ring': 'oklch(0.62 0.16 50)',
    '--chart-1': 'oklch(0.62 0.16 50)',
    '--chart-2': 'oklch(0.65 0.13 145)',
    '--chart-3': 'oklch(0.6 0.1 230)',
    '--chart-4': 'oklch(0.7 0.14 80)',
    '--chart-5': 'oklch(0.55 0.16 40)',
    '--sidebar': 'oklch(0.972 0.018 78)',
    '--sidebar-foreground': 'oklch(0.18 0.015 30)',
    '--sidebar-primary': 'oklch(0.62 0.16 50)',
    '--sidebar-primary-foreground': 'oklch(0.99 0 0)',
    '--sidebar-accent': 'oklch(0.942 0.024 78)',
    '--sidebar-accent-foreground': 'oklch(0.18 0.015 30)',
    '--sidebar-border': 'oklch(0.908 0.022 76)',
    '--sidebar-ring': 'oklch(0.62 0.16 50)',
    '--hm-0': 'oklch(0.96 0.008 80)',
    '--hm-1': 'oklch(0.89 0.06 75)',
    '--hm-2': 'oklch(0.78 0.11 70)',
    '--hm-3': 'oklch(0.65 0.14 60)',
    '--hm-4': 'oklch(0.55 0.16 40)',
  },
  dark: {
    '--background': 'oklch(0.172 0.026 40)',
    '--foreground': 'oklch(0.96 0.005 75)',
    '--card': 'oklch(0.235 0.028 44)',
    '--card-foreground': 'oklch(0.96 0.005 75)',
    '--popover': 'oklch(0.235 0.028 44)',
    '--popover-foreground': 'oklch(0.96 0.005 75)',
    '--primary': 'oklch(0.7 0.16 55)',
    '--primary-foreground': 'oklch(0.16 0.012 35)',
    '--secondary': 'oklch(0.285 0.026 44)',
    '--secondary-foreground': 'oklch(0.96 0.005 75)',
    '--muted': 'oklch(0.285 0.026 44)',
    '--muted-foreground': 'oklch(0.74 0.026 66)',
    '--accent': 'oklch(0.285 0.026 44)',
    '--accent-foreground': 'oklch(0.96 0.005 75)',
    '--destructive': 'oklch(0.7 0.19 25)',
    '--border': 'oklch(1 0 0 / 8%)',
    '--input': 'oklch(1 0 0 / 12%)',
    '--ring': 'oklch(0.7 0.16 55)',
    '--chart-1': 'oklch(0.7 0.16 55)',
    '--chart-2': 'oklch(0.65 0.13 145)',
    '--chart-3': 'oklch(0.6 0.1 230)',
    '--chart-4': 'oklch(0.7 0.14 80)',
    '--chart-5': 'oklch(0.7 0.15 65)',
    '--sidebar': 'oklch(0.235 0.028 44)',
    '--sidebar-foreground': 'oklch(0.96 0.005 75)',
    '--sidebar-primary': 'oklch(0.7 0.16 55)',
    '--sidebar-primary-foreground': 'oklch(0.16 0.012 35)',
    '--sidebar-accent': 'oklch(0.285 0.026 44)',
    '--sidebar-accent-foreground': 'oklch(0.96 0.005 75)',
    '--sidebar-border': 'oklch(1 0 0 / 8%)',
    '--sidebar-ring': 'oklch(0.7 0.16 55)',
    '--hm-0': 'oklch(0.22 0.012 40)',
    '--hm-1': 'oklch(0.32 0.06 50)',
    '--hm-2': 'oklch(0.45 0.1 55)',
    '--hm-3': 'oklch(0.58 0.13 60)',
    '--hm-4': 'oklch(0.7 0.15 65)',
  },
}

/** How a token's value is produced for a derived theme. */
type TokenCategory = 'neutral' | 'accent' | 'computedFg' | 'fixed' | 'heatmap'

/**
 * Per-token derivation rule (the classification map). Every token in CATHEDRAL
 * must appear here, or generation throws.
 * - neutral — keep cathedral L (+ alpha), apply the family's neutral hue/chroma
 * - accent — the family signature color (cathedral makes `--ring`/sidebar primary === `--primary`)
 * - computedFg — pick AA-readable text for the accent it sits on (see FOREGROUND_OF)
 * - fixed — emit the cathedral value unchanged for ALL themes (warm chart/destructive identity, decision #15)
 * - heatmap — keep the cathedral L/C ramp, apply the family's hue path (handled separately)
 */
const TOKEN_CATEGORY: Record<string, TokenCategory> = {
  '--background': 'neutral',
  '--foreground': 'neutral',
  '--card': 'neutral',
  '--card-foreground': 'neutral',
  '--popover': 'neutral',
  '--popover-foreground': 'neutral',
  '--primary': 'accent',
  '--primary-foreground': 'computedFg',
  '--secondary': 'neutral',
  '--secondary-foreground': 'neutral',
  '--muted': 'neutral',
  '--muted-foreground': 'neutral',
  '--accent': 'neutral',
  '--accent-foreground': 'neutral',
  '--destructive': 'fixed',
  '--border': 'neutral',
  '--input': 'neutral',
  '--ring': 'accent',
  '--chart-1': 'fixed',
  '--chart-2': 'fixed',
  '--chart-3': 'fixed',
  '--chart-4': 'fixed',
  '--chart-5': 'fixed',
  '--sidebar': 'neutral',
  '--sidebar-foreground': 'neutral',
  '--sidebar-primary': 'accent',
  '--sidebar-primary-foreground': 'computedFg',
  '--sidebar-accent': 'neutral',
  '--sidebar-accent-foreground': 'neutral',
  '--sidebar-border': 'neutral',
  '--sidebar-ring': 'accent',
  '--hm-0': 'heatmap',
  '--hm-1': 'heatmap',
  '--hm-2': 'heatmap',
  '--hm-3': 'heatmap',
  '--hm-4': 'heatmap',
}

/** Each computed foreground → the (already-derived) token it must read on. */
const FOREGROUND_OF: Record<string, string> = {
  '--primary-foreground': '--primary',
  '--sidebar-primary-foreground': '--sidebar-primary',
}

/** The five heatmap tokens, coolest→warmest (index aligns with `heatmapHues`). */
const HEATMAP_TOKENS: readonly string[] = [
  '--hm-0',
  '--hm-1',
  '--hm-2',
  '--hm-3',
  '--hm-4',
]

/**
 * Contrast candidates for every computed foreground: the brand near-white and
 * near-ink, so `--primary-foreground` lands on whichever clears AA on the accent.
 */
const FOREGROUND_CANDIDATES = [
  'oklch(0.99 0 0)',
  'oklch(0.16 0.012 35)',
] as const

/** Rounds to 4 decimals and trims trailing zeros for clean CSS numbers. */
function num(value: number): string {
  return Number(value.toFixed(4)).toString()
}

/** Formats an OKLCH triple (with optional sub-1 alpha as a percentage). */
function formatOklch(l: number, c: number, h: number, alpha = 1): string {
  const triple = `oklch(${num(l)} ${num(c)} ${num(h)}`
  return alpha < 1 ? `${triple} / ${num(alpha * 100)}%)` : `${triple})`
}

/** Parses a cathedral OKLCH string to the L/C/alpha the ladder rules need. */
function ladderColor(value: string): { l: number; c: number; alpha: number } {
  const parsed = toOklch(value)
  if (!parsed) throw new Error(`Unparsable cathedral color: ${value}`)
  return { l: parsed.l, c: parsed.c, alpha: parsed.alpha ?? 1 }
}

/**
 * The OKLCH params the derivation needs — the seed fields of a derived theme,
 * minus identity/metadata. Structural so tests can exercise the derivation
 * without a registered family/id (none exist besides cathedral until T7).
 */
export type DerivationSeed = Pick<
  DerivedTheme,
  | 'mode'
  | 'accentL'
  | 'accentChroma'
  | 'accentHue'
  | 'neutralChroma'
  | 'neutralHue'
  | 'heatmapHues'
>

/**
 * Derives the full token→value map for one derived theme. Two passes: first the
 * neutral/accent/fixed/heatmap tokens, then the computed foregrounds (which read
 * the accent values produced in pass one). Foreground keys are pre-seeded so the
 * output keeps cathedral token order (stable output = stable generated.css).
 * @param seed - A derived theme's OKLCH derivation params.
 * @returns a map of every cathedral color token to this theme's value.
 */
export function deriveThemeTokens(
  seed: DerivationSeed,
): Record<string, string> {
  const ladder = CATHEDRAL[seed.mode]
  const tokens: Record<string, string> = {}

  // Pass 1 — everything except computed foregrounds (placeholders hold their slot)
  for (const [token, cathedralValue] of Object.entries(ladder)) {
    const category = TOKEN_CATEGORY[token]
    if (category === undefined) {
      throw new Error(`Token ${token} has no classification`)
    }
    if (category === 'computedFg') {
      tokens[token] = ''
      continue
    }
    if (category === 'accent') {
      tokens[token] = formatOklch(
        seed.accentL,
        seed.accentChroma,
        seed.accentHue,
      )
    } else if (category === 'neutral') {
      const { l, alpha } = ladderColor(cathedralValue)
      tokens[token] = formatOklch(l, seed.neutralChroma, seed.neutralHue, alpha)
    } else if (category === 'fixed') {
      tokens[token] = cathedralValue
    } else {
      // heatmap: keep the cathedral L/C ramp, swap to the family hue at this stop
      const stop = HEATMAP_TOKENS.indexOf(token)
      const { l, c } = ladderColor(cathedralValue)
      tokens[token] = formatOklch(
        l,
        c,
        seed.heatmapHues[stop] ?? seed.heatmapHues[0],
      )
    }
  }

  // Pass 2 — computed foregrounds read their now-derived accent background
  for (const [fgToken, bgToken] of Object.entries(FOREGROUND_OF)) {
    const background = tokens[bgToken]
    if (background === undefined) {
      throw new Error(`Foreground ${fgToken} references missing ${bgToken}`)
    }
    tokens[fgToken] = readableForeground(background, FOREGROUND_CANDIDATES)
  }

  return tokens
}

/**
 * Renders one derived theme as a CSS block. Uses `:root[data-theme='id']`
 * (specificity 0,2,0) so a derived theme always wins over cathedral's `:root`
 * regardless of `@import` order — unlike cathedral's hand-authored
 * `[data-theme='dark']`, which relies on coming after `:root` in globals.css.
 * @param theme - A derived theme seed.
 * @returns the `:root[data-theme='…'] { … }` CSS block.
 */
export function deriveThemeCss(theme: DerivedTheme): string {
  const tokens = deriveThemeTokens(theme)
  const lines = [`  color-scheme: ${theme.colorScheme};`]
  for (const [token, value] of Object.entries(tokens)) {
    lines.push(`  ${token}: ${value};`)
  }
  return `:root[data-theme='${theme.id}'] {\n${lines.join('\n')}\n}`
}

/** Header marking generated.css as machine-written. */
const GENERATED_HEADER = `/* AUTO-GENERATED by scripts/generate-theme-css.ts — DO NOT EDIT.
   Run \`pnpm theme:generate\` to regenerate. Preserved (Warm Cathedral) themes
   live in globals.css; only derived colored families appear here. */`

/**
 * Builds the full generated.css content from the registry: the header plus one
 * block per derived theme (preserved themes are skipped). With only cathedral
 * registered, the output is the header alone.
 * @param themes - The registry entries.
 * @returns the complete generated.css file content.
 */
export function generateThemesCss(themes: readonly ThemeSeed[]): string {
  const blocks = themes
    .filter((theme): theme is DerivedTheme => !theme.preserve)
    .map(deriveThemeCss)
  return blocks.length > 0
    ? `${GENERATED_HEADER}\n\n${blocks.join('\n\n')}\n`
    : `${GENERATED_HEADER}\n`
}

// Write the file when run directly (tsx scripts/generate-theme-css.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outPath = fileURLToPath(
    new URL('../src/lib/themes/generated.css', import.meta.url),
  )
  writeFileSync(
    outPath,
    generateThemesCss(Object.values(THEME_REGISTRY)),
    'utf-8',
  )
  // eslint-disable-next-line no-console -- build script progress output
  console.log(`Wrote ${outPath}`)
}

/**
 * Theme CSS generator — reads the theme registry and writes
 * `packages/live-editor/src/styles/generated.css` with one block per generator-emitted theme:
 * the DERIVED (colored) families and the STATIC shadcn Default pair.
 *
 * Preserved themes (Warm Cathedral `cathedral-light`/`cathedral-dark`) are
 * SKIPPED: their CSS stays hand-authored in base.css and is pinned by a snapshot
 * test, so the brand never drifts. Derived themes get their ~36 color tokens computed from OKLCH
 * seed params at the fixed cathedral lightness ladder (this file mirrors that
 * ladder), with `--primary-foreground` contrast-computed (never hardcoded white).
 * Static themes are copied verbatim from their registry `tokens`. The Default
 * pair is the applied default, so it is emitted as SEPARATE blocks (never
 * selector lists, which the dslint CSS parser would mis-tag): bare `:root` and
 * `[data-theme='light']` plus one block per legacy alias for light; `dark`, the
 * legacy dark alias and a `prefers-color-scheme: dark` first-paint block for dark.
 *
 * Run via `pnpm theme:generate`. CI re-runs it and fails on any diff, so
 * generated.css can never be stale. BUILD-TIME ONLY (imports culori via
 * contrast.ts); nothing here ships to the client bundle.
 *
 * @example
 * // add a family seed to registry.ts, then:
 * // $ pnpm theme:generate   → rewrites packages/live-editor/src/styles/generated.css
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { converter } from 'culori'

import { readableForeground } from '../src/lib/themes/contrast'
import {
  isDerivedTheme,
  isStaticTheme,
  LEGACY_THEME_ID_ALIASES,
  THEME_REGISTRY,
  type DerivedTheme,
  type StaticTheme,
  type ThemeMode,
  type ThemeSeed,
} from '../src/lib/themes/registry'

const toOklch = converter('oklch')

/** Repo-relative registry path, quoted in validation errors so the fix location is obvious. */
const REGISTRY_SOURCE_PATH = 'packages/live-editor/src/themes/registry.ts'

/** Longest expected/actual line excerpt printed in a drift diagnostic. */
const MAX_EXCERPT_LENGTH = 200

/** Repo-relative generated file, quoted in drift diagnostics. */
const GENERATED_CSS_PATH = 'packages/live-editor/src/styles/generated.css'

/**
 * Cathedral token values, copied verbatim from base.css
 * `:root[data-theme='cathedral-light']` / `:root[data-theme='cathedral-dark']`. This is the fixed lightness ladder (neutral L per token)
 * plus the fixed-identity palette (destructive, charts) reused by every theme.
 * Cathedral is `preserve` (never recomputed, never drifts) and base.css is
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
    '--primary': 'oklch(0.56 0.16 50)',
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
    '--ring': 'oklch(0.56 0.16 50)',
    '--chart-1': 'oklch(0.62 0.16 50)',
    '--chart-2': 'oklch(0.65 0.13 145)',
    '--chart-3': 'oklch(0.6 0.1 230)',
    '--chart-4': 'oklch(0.7 0.14 80)',
    '--chart-5': 'oklch(0.55 0.16 40)',
    '--sidebar': 'oklch(0.972 0.018 78)',
    '--sidebar-foreground': 'oklch(0.18 0.015 30)',
    '--sidebar-primary': 'oklch(0.56 0.16 50)',
    '--sidebar-primary-foreground': 'oklch(0.99 0 0)',
    '--sidebar-accent': 'oklch(0.942 0.024 78)',
    '--sidebar-accent-foreground': 'oklch(0.18 0.015 30)',
    '--sidebar-border': 'oklch(0.908 0.022 76)',
    '--sidebar-ring': 'oklch(0.56 0.16 50)',
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

/**
 * Parses a cathedral OKLCH string to the L/C/alpha the ladder rules need.
 * @param value - A cathedral ladder color.
 * @param context - Theme id, mode and token, quoted in the error so a bad ladder entry is findable.
 * @returns the lightness, chroma and alpha of the color.
 * @throws when the value is not a parsable color.
 */
function ladderColor(
  value: string,
  context: { themeId: string; mode: ThemeMode; token: string },
): { l: number; c: number; alpha: number } {
  const parsed = toOklch(value)
  if (!parsed) {
    throw new Error(
      `Unparsable cathedral color theme=${context.themeId} mode=${context.mode} token=${context.token} value=${value}`,
    )
  }
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
 * @param themeId - Theme id quoted in ladder errors (defaults to `'unknown'` for bare seeds).
 * @returns a map of every cathedral color token to this theme's value.
 * @example
 * deriveThemeTokens({ mode: 'light', accentL: 0.555, accentChroma: 0.135,
 *   accentHue: 250, neutralChroma: 0.012, neutralHue: 250,
 *   heatmapHues: [235, 220, 95, 60, 42] })['--primary'] // => 'oklch(0.555 0.135 250)'
 */
export function deriveThemeTokens(
  seed: DerivationSeed,
  themeId = 'unknown',
): Record<string, string> {
  const ladder = CATHEDRAL[seed.mode]
  const tokens: Record<string, string> = {}
  // the id is optional (a DerivationSeed has none); mode + token still pinpoint the ladder entry
  const ladderContext = (token: string) => ({
    themeId,
    mode: seed.mode,
    token,
  })

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
      const { l, alpha } = ladderColor(cathedralValue, ladderContext(token))
      tokens[token] = formatOklch(l, seed.neutralChroma, seed.neutralHue, alpha)
    } else if (category === 'fixed') {
      tokens[token] = cathedralValue
    } else {
      // heatmap: keep the cathedral L/C ramp, swap to the family hue at this stop
      const stop = HEATMAP_TOKENS.indexOf(token)
      const { l, c } = ladderColor(cathedralValue, ladderContext(token))
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
 * Renders a token map as one CSS block under any selector. The shared writer for
 * every theme block so indentation and token order stay identical.
 * @param selector - The full selector, e.g. `:root[data-theme='harbor-light']`.
 * @param colorScheme - Emitted first as `color-scheme` (hints UA form controls).
 * @param tokens - Token to value map, emitted in insertion order.
 * @param indent - Leading spaces of the selector line (nested blocks pass 2).
 * @returns the `selector { ... }` CSS block.
 * @example
 * renderBlock(':root', 'light', { '--background': 'oklch(1 0 0)' })
 * // => ":root {\n  color-scheme: light;\n  --background: oklch(1 0 0);\n}"
 */
function renderBlock(
  selector: string,
  colorScheme: ThemeMode,
  tokens: Readonly<Record<string, string>>,
  indent = 0,
): string {
  const outer = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const lines = [`${inner}color-scheme: ${colorScheme};`]
  for (const [token, value] of Object.entries(tokens)) {
    lines.push(`${inner}${token}: ${value};`)
  }
  return `${outer}${selector} {\n${lines.join('\n')}\n${outer}}`
}

/**
 * Renders a token map as one theme's CSS block. Uses `:root[data-theme='id']`
 * (specificity 0,2,0) so an emitted theme always wins over the bare `:root`
 * regardless of `@import` order.
 * @param theme - The emitted theme's identity (id + color-scheme).
 * @param tokens - Its token to value map, emitted in insertion order.
 * @returns the `:root[data-theme='...'] { ... }` CSS block.
 * @example
 * renderThemeBlock(harborLight, deriveThemeTokens(harborLight))
 * // => ":root[data-theme='harbor-light'] {\n  color-scheme: light;\n  --background: oklch(0.975 0.012 250);\n  ...\n}"
 */
function renderThemeBlock(
  theme: { id: string; colorScheme: ThemeMode },
  tokens: Readonly<Record<string, string>>,
): string {
  return renderBlock(
    `:root[data-theme='${theme.id}']`,
    theme.colorScheme,
    tokens,
  )
}

/**
 * Renders one derived theme as a CSS block (its tokens computed from the seed).
 * @param theme - A derived theme seed.
 * @returns the `:root[data-theme='...'] { ... }` CSS block.
 * @example
 * deriveThemeCss(harborLight)
 * // => ":root[data-theme='harbor-light'] {\n  color-scheme: light;\n  --background: oklch(0.975 0.012 250);\n  ...\n}"
 */
export function deriveThemeCss(theme: DerivedTheme): string {
  return renderThemeBlock(theme, deriveThemeTokens(theme, theme.id))
}

/**
 * Renders one static theme as its plain `:root[data-theme='id']` block, tokens
 * copied verbatim (no derivation).
 * @param theme - A static theme seed.
 * @returns the `:root[data-theme='...'] { ... }` CSS block.
 * @example
 * staticThemeCss(THEME_REGISTRY.light)
 * // => ":root[data-theme='light'] {\n  color-scheme: light;\n  --background: oklch(1 0 0);\n  ...\n}"
 */
export function staticThemeCss(theme: StaticTheme): string {
  return renderThemeBlock(theme, theme.tokens)
}

/**
 * Renders the Default family's extra blocks so the neutral palette paints before
 * (and without) any stored theme. Light gets the bare `:root` fallback; every
 * legacy alias targeting this theme gets its own block (a stale stored
 * `default-dark` paints Default on the first frame); dark gets the
 * `prefers-color-scheme: dark` first-paint block for windows with no attribute
 * yet (the desktop editor before React mounts). Always separate blocks, never
 * selector lists: the dslint CSS parser tags a list as the wrong theme.
 * @param theme - A static Default theme (family `default`).
 * @param aliases - Legacy alias to target-id map.
 * @returns the CSS blocks for this theme in emission order.
 * @example
 * defaultFamilyBlocks(THEME_REGISTRY.light, LEGACY_THEME_ID_ALIASES)
 * // => [":root {...}", ":root[data-theme='light'] {...}", ":root[data-theme='default-light'] {...}"]
 */
function defaultFamilyBlocks(
  theme: StaticTheme,
  aliases: Readonly<Record<string, string>>,
): string[] {
  const blocks: string[] = []
  if (theme.mode === 'light') {
    blocks.push(renderBlock(':root', theme.colorScheme, theme.tokens))
  }
  blocks.push(staticThemeCss(theme))
  for (const [alias, target] of Object.entries(aliases)) {
    if (target === theme.id) {
      blocks.push(
        renderThemeBlock(
          { id: alias, colorScheme: theme.colorScheme },
          theme.tokens,
        ),
      )
    }
  }
  if (theme.mode === 'dark') {
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n${renderBlock(':root:not([data-theme])', theme.colorScheme, theme.tokens, 2)}\n}`,
    )
  }
  return blocks
}

/**
 * Throws when any color token of an emitted theme is not a parsable color, so a
 * typo in a static seed (or a derivation bug) fails the generator before any
 * write instead of shipping an invalid declaration.
 * @param themes - Registry entries.
 * @throws `THEME_INVALID_COLOR theme=<id> token=<token> value=<value> source=...`
 */
function assertThemeColorsParse(themes: readonly ThemeSeed[]): void {
  for (const theme of themes) {
    // preserved themes are hand-authored in base.css, nothing to validate here
    if (theme.preserve) continue
    const tokens = isStaticTheme(theme)
      ? theme.tokens
      : isDerivedTheme(theme)
        ? deriveThemeTokens(theme, theme.id)
        : {}
    for (const [token, value] of Object.entries(tokens)) {
      if (!toOklch(value)) {
        throw new Error(
          `THEME_INVALID_COLOR theme=${theme.id} token=${token} value=${value} source=${REGISTRY_SOURCE_PATH}`,
        )
      }
    }
  }
}

/**
 * Throws unless every legacy alias points at an emitted (non-preserved) theme,
 * because the alias CSS block copies that theme's tokens.
 * @param themes - Registry entries.
 * @param aliases - Legacy alias to target-id map.
 * @throws `THEME_ALIAS_TARGET alias=<alias> target=<target>`
 */
function assertAliasTargetsEmitted(
  themes: readonly ThemeSeed[],
  aliases: Readonly<Record<string, string>>,
): void {
  for (const [alias, target] of Object.entries(aliases)) {
    const targetTheme = themes.find((theme) => theme.id === target)
    if (!targetTheme || targetTheme.preserve) {
      throw new Error(`THEME_ALIAS_TARGET alias=${alias} target=${target}`)
    }
  }
}

/** Header marking generated.css as machine-written. */
const GENERATED_HEADER = `/* AUTO-GENERATED by apps/web/scripts/generate-theme-css.ts — DO NOT EDIT.
   Run \`pnpm theme:generate\` to regenerate. Preserved (Warm Cathedral) themes
   live in packages/live-editor/src/styles/base.css; the shadcn Default pair
   (with its legacy-alias and first-paint blocks) and the derived colored
   families appear here. */`

/**
 * Builds the full generated.css content from the registry: the header plus the
 * blocks of every emitted theme. Static Default themes expand to the bare
 * `:root`, alias and first-paint blocks; other static and derived themes get one
 * block each; preserved themes are skipped. Validates colors and alias targets
 * first, so nothing is produced from a bad registry.
 * @param themes - The registry entries.
 * @param aliases - Legacy alias map (defaults to the registry's; tests inject bad ones).
 * @returns the complete generated.css file content.
 * @throws `THEME_INVALID_COLOR` / `THEME_ALIAS_TARGET` for an invalid registry.
 * @example
 * generateThemesCss(Object.values(THEME_REGISTRY))
 * // => header comment + one block per emitted theme (Default expands to six)
 */
export function generateThemesCss(
  themes: readonly ThemeSeed[],
  aliases: Readonly<Record<string, string>> = LEGACY_THEME_ID_ALIASES,
): string {
  assertThemeColorsParse(themes)
  assertAliasTargetsEmitted(themes, aliases)
  const blocks: string[] = []
  for (const theme of themes) {
    // Preserved (Warm Cathedral) stays hand-authored in base.css, emit nothing.
    if (isStaticTheme(theme)) {
      if (theme.family === 'default') {
        blocks.push(...defaultFamilyBlocks(theme, aliases))
      } else {
        blocks.push(staticThemeCss(theme))
      }
    } else if (isDerivedTheme(theme)) blocks.push(deriveThemeCss(theme))
  }
  return blocks.length > 0
    ? `${GENERATED_HEADER}\n\n${blocks.join('\n\n')}\n`
    : `${GENERATED_HEADER}\n`
}

/**
 * Explains why generated.css differs from a fresh generation: the first differing
 * line (1-based) with the expected and actual text, plus the recovery steps.
 * Used by `--check` so a CI failure is actionable without diffing by hand.
 * @param expected - Freshly generated content.
 * @param actual - Content currently on disk.
 * @returns a multi-line diagnostic, bounded to one line each for expected and actual.
 * @example
 * describeThemeCssDrift('a\nb\nc', 'a\nb\nX')
 * // => message naming generated.css, "line 3", `expected: c`, `actual:   X`
 */
export function describeThemeCssDrift(
  expected: string,
  actual: string,
): string {
  const expectedLines = expected.split('\n')
  const actualLines = actual.split('\n')
  const lineCount = Math.max(expectedLines.length, actualLines.length)
  let firstDifferentIndex = 0
  while (
    firstDifferentIndex < lineCount &&
    expectedLines[firstDifferentIndex] === actualLines[firstDifferentIndex]
  ) {
    firstDifferentIndex += 1
  }
  const excerpt = (line: string | undefined): string =>
    line === undefined ? '<end of file>' : line.slice(0, MAX_EXCERPT_LENGTH)
  return [
    `Theme CSS is stale: ${GENERATED_CSS_PATH} differs from the registry output.`,
    `First difference at line ${firstDifferentIndex + 1}:`,
    `  expected: ${excerpt(expectedLines[firstDifferentIndex])}`,
    `  actual:   ${excerpt(actualLines[firstDifferentIndex])}`,
    "Fix: from the repository root run `pnpm theme:generate`, review that file's diff, rerun `pnpm theme:check` and `pnpm test`, then commit.",
  ].join('\n')
}

// Write the file when run directly (tsx scripts/generate-theme-css.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outPath = fileURLToPath(
    new URL(
      '../../../packages/live-editor/src/styles/generated.css',
      import.meta.url,
    ),
  )
  // Validation runs inside generateThemesCss, before any write in both modes.
  let generated: string
  try {
    generated = generateThemesCss(Object.values(THEME_REGISTRY))
  } catch (error) {
    // keep the original error as `cause` so an unexpected failure stays debuggable
    throw new Error(
      `Theme CSS generation failed; nothing was written. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  // Validation compares content without modifying the golden file or relying on Git staging.
  if (process.argv.includes('--check')) {
    const onDisk = readFileSync(outPath, 'utf-8')
    if (onDisk !== generated) {
      throw new Error(describeThemeCssDrift(generated, onDisk))
    }
  } else {
    writeFileSync(outPath, generated, 'utf-8')
    // eslint-disable-next-line no-console -- build script progress output
    console.log(`Wrote ${outPath}`)
  }
}

/**
 * @fileoverview Guard against hard-coded Warm Cathedral amber in hand-authored UI.
 *
 * #213: the applied default is stock shadcn Default (neutral). Amber belongs only
 * to the Warm Cathedral theme definition, the user-picked category palette and the
 * content-colour heatmap/chart ramps. Everything else must use theme tokens.
 *
 * Coverage is PARTIAL by design: only `oklch()` literals (hue 30-80, chroma >= 0.1)
 * and Tailwind `*-amber-NNN` classes are detected. hex/hsl/rgb are not parsed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/** Repository root (vitest runs with cwd = apps/web). */
const REPO_ROOT = resolve(process.cwd(), '../..')

/** Directories scanned for hand-authored UI code (repo-relative). */
const SCAN_ROOTS = [
  'apps/web/src',
  'apps/desktop/renderer',
  'apps/desktop/electron',
  ...readdirSync(join(REPO_ROOT, 'packages'))
    .filter((name) =>
      statSync(join(REPO_ROOT, 'packages', name, 'src'), {
        throwIfNoEntry: false,
      })?.isDirectory(),
    )
    .map((name) => `packages/${name}/src`),
]

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css', '.html']

/** Path fragments that are never hand-authored UI (build output, vendored). */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'out'])

/**
 * Files out of the guard's scope by design: theme definition/tooling files and
 * generated output, which legitimately contain hue literals.
 */
const THEME_DEFINITION_PATHS = [
  'packages/live-editor/src/styles/generated.css',
  'packages/live-editor/src/themes/registry.ts',
  'apps/web/scripts/generate-theme-css.ts',
  'packages/live-editor/src/themes/preview.ts',
  'apps/web/src/lib/themes/contrast.ts',
]

/** Hand-reviewed exceptions; every entry says why amber is allowed there. */
const ALLOWLIST: ReadonlyArray<{
  path: string
  reason: string
  issue?: number
}> = [
  {
    path: 'apps/desktop/electron/update-progress-window-html.ts',
    reason: '#214 themes this window',
    issue: 214,
  },
  {
    path: 'apps/web/src/lib/category-colors.ts',
    reason: 'user-picked category palette, not theme chrome',
  },
  {
    path: 'packages/desktop-contract/src/category.ts',
    reason: 'user-picked category palette, not theme chrome',
  },
]

const OKLCH_PATTERN =
  /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)/g
const TAILWIND_AMBER_PATTERN = /[a-z-]+-amber-[0-9]{2,3}/g
const AMBER_HUE_MIN = 30
const AMBER_HUE_MAX = 80
const AMBER_CHROMA_MIN = 0.1

interface AmberHit {
  path: string
  line: number
  literal: string
  fix: string
}

/**
 * Suggests the token replacement from the property context of the offending line.
 * @param lineText - The source line containing the literal.
 * @returns the fix line shown under the diagnostic.
 * @example
 * suggestFix('<p className="text-amber-600">') // => 'Fix: use text-primary / var(--primary) or text-muted-foreground'
 */
function suggestFix(lineText: string): string {
  if (/border|ring|outline|stroke/i.test(lineText)) {
    return 'Fix: use border-border / ring-ring'
  }
  if (/\bbg-|background/i.test(lineText)) {
    return 'Fix: use bg-primary, bg-muted or bg-card'
  }
  return 'Fix: use text-primary / var(--primary) or text-muted-foreground'
}

/**
 * Names the innermost open selector for every line of a CSS file, so base.css
 * hits can be judged by the block they sit in.
 * @param lines - The CSS file split into lines.
 * @returns one selector string per line ('' outside any block).
 * @example
 * selectorsPerLine([':root[data-theme="x"] {', '  --a: 1;', '}']) // => [':root[data-theme="x"] {', ':root[data-theme="x"] {', '']
 */
function selectorsPerLine(lines: string[]): string[] {
  const stack: string[] = []
  return lines.map((lineText) => {
    const opened = lineText.includes('{') ? lineText.trim() : null
    if (opened) stack.push(opened)
    const innermost = stack[stack.length - 1] ?? ''
    if (lineText.includes('}')) stack.pop()
    return innermost
  })
}

/**
 * Finds amber literals in one source file.
 * @param path - Repo-relative path (decides the base.css block rules).
 * @param content - File text.
 * @returns every hit with its line, literal and fix hint.
 * @example
 * scanSource('a.tsx', 'color: oklch(0.56 0.16 50)') // => [{ path: 'a.tsx', line: 1, literal: 'oklch(0.56 0.16 50)', ... }]
 */
function scanSource(path: string, content: string): AmberHit[] {
  const lines = content.split('\n')
  const isBaseCss = path === 'packages/live-editor/src/styles/base.css'
  const selectors = isBaseCss ? selectorsPerLine(lines) : []
  const hits: AmberHit[] = []

  lines.forEach((lineText, index) => {
    // base.css: cathedral blocks and --hm-*/--chart-* declarations may carry amber.
    if (isBaseCss) {
      const isCathedralBlock = (selectors[index] ?? '').includes('cathedral-')
      const isContentRamp = /^\s*--(hm|chart)-/.test(lineText)
      if (isCathedralBlock || isContentRamp) return
    }
    const literals: string[] = []
    for (const match of lineText.matchAll(OKLCH_PATTERN)) {
      const chroma = Number(match[2])
      const hue = Number(match[3])
      if (
        chroma >= AMBER_CHROMA_MIN &&
        hue >= AMBER_HUE_MIN &&
        hue <= AMBER_HUE_MAX
      ) {
        literals.push(match[0])
      }
    }
    literals.push(...(lineText.match(TAILWIND_AMBER_PATTERN) ?? []))
    for (const literal of literals) {
      hits.push({ path, line: index + 1, literal, fix: suggestFix(lineText) })
    }
  })
  return hits
}

/**
 * Formats hits into the one actionable assertion message (not an array diff).
 * @param hits - Hits from {@link scanSource}.
 * @returns the multi-line diagnostic, or '' when there are no hits.
 */
function formatHits(hits: AmberHit[]): string {
  if (hits.length === 0) return ''
  const body = hits
    .map(
      (hit) =>
        `THEME_AMBER_LITERAL ${hit.path}:${hit.line} ${hit.literal}\n  ${hit.fix}`,
    )
    .join('\n')
  return `${body}\nWarm Cathedral amber belongs only in its base.css :root[data-theme='cathedral-*'] blocks (DESIGN.md#theme-system).\nRerun: pnpm --filter @corelive/web exec vitest run src/lib/themes/no-hardcoded-amber.test.ts`
}

/** Collects every in-scope hand-authored file, repo-relative. */
function collectFiles(): string[] {
  const files: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
      } else if (
        SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ) {
        files.push(relative(REPO_ROOT, absolute))
      }
    }
  }
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root))
  return files.filter(
    (path) =>
      !/\.(test|spec)\.[tj]sx?$/.test(path) &&
      !path.includes('/__tests__/') &&
      !THEME_DEFINITION_PATHS.includes(path) &&
      !ALLOWLIST.some((entry) => entry.path === path),
  )
}

describe('no hard-coded amber (partial coverage: oklch hue 30-80 chroma >= 0.1 and Tailwind amber classes; hex/hsl/rgb not parsed)', () => {
  test('flags an oklch amber literal with path, line and a token fix', () => {
    // Arrange
    const source = 'const a = 1\nconst color = "oklch(0.56 0.16 50)"'

    // Act
    const hits = scanSource('apps/web/src/example.tsx', source)

    // Assert
    expect(hits).toEqual([
      {
        path: 'apps/web/src/example.tsx',
        line: 2,
        literal: 'oklch(0.56 0.16 50)',
        fix: 'Fix: use text-primary / var(--primary) or text-muted-foreground',
      },
    ])
    expect(formatHits(hits)).toContain(
      'THEME_AMBER_LITERAL apps/web/src/example.tsx:2 oklch(0.56 0.16 50)',
    )
  })

  test('flags a Tailwind text-amber-600 class and leaves neutral oklch alone', () => {
    // Arrange
    const source =
      '<p className="text-amber-600">x</p>\nconst grey = "oklch(0.6 0.02 50)"'

    // Act
    const hits = scanSource('apps/web/src/example.tsx', source)

    // Assert
    expect(hits.map((hit) => `${hit.line}:${hit.literal}`)).toEqual([
      '1:text-amber-600',
    ])
  })

  test('allows amber in base.css cathedral blocks and --hm-/--chart- declarations only', () => {
    // Arrange
    const css = [
      ":root[data-theme='cathedral-light'] {",
      '  --primary: oklch(0.56 0.16 50);',
      '}',
      ":root[data-theme='default'] {",
      '  --hm-4: oklch(0.55 0.16 40);',
      '  --accent: oklch(0.56 0.16 50);',
      '}',
    ].join('\n')

    // Act
    const hits = scanSource('packages/live-editor/src/styles/base.css', css)

    // Assert
    expect(hits.map((hit) => hit.line)).toEqual([6])
  })

  test('finds no hard-coded amber in hand-authored UI code', () => {
    // Arrange
    const files = collectFiles()

    // Act
    const hits = files.flatMap((path) =>
      scanSource(path, readFileSync(join(REPO_ROOT, path), 'utf-8')),
    )

    // Assert
    expect(files.length).toBeGreaterThan(100)
    expect(formatHits(hits)).toBe('')
  })

  test('documents a reason for every allowlisted path', () => {
    // Arrange / Act
    const reasons = ALLOWLIST.map((entry) => entry.reason)

    // Assert
    expect(reasons.every((reason) => reason.length > 0)).toBe(true)
    expect(ALLOWLIST.find((entry) => entry.issue === 214)?.path).toBe(
      'apps/desktop/electron/update-progress-window-html.ts',
    )
  })
})

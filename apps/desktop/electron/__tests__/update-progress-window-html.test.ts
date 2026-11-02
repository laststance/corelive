import type { UpdaterDownloadProgress } from '@corelive/desktop-contract/ipc'
import { THEME_TOKENS } from '@corelive/live-editor/theme-tokens'
import { THEME_IDS } from '@corelive/live-editor/themes'
import { describe, expect, test } from 'vitest'

import {
  buildUpdateProgressWindowHtml,
  buildUpdateProgressWindowUpdateScript,
} from '../update-progress-window-html'

const halfwayProgress: UpdaterDownloadProgress = {
  percent: 42,
  bytesPerSecond: 1024,
  transferred: 42,
  total: 100,
}

describe('update progress window markup', () => {
  test('renders accessible progressbar markup with the initial percent', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-label="Update download progress"')
    expect(html).toContain('aria-valuenow="42"')
    expect(html).toContain('42%')
  })

  test('renders a complete standalone document without external assets', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).not.toMatch(/rel=["']stylesheet/)
    expect(html).not.toContain('fonts.googleapis.com')
  })

  test('stays click-through so the native progress window never blocks work', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('pointer-events: none')
    expect(html).toContain('user-select: none')
  })

  test('honors reduced motion for progress updates', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('transition: none')
  })

  test('builds a tiny update script for an already-loaded window', () => {
    // Arrange + Act
    const script = buildUpdateProgressWindowUpdateScript(halfwayProgress)

    // Assert
    expect(script).toBe('window.__coreliveSetUpdateProgress?.(42)')
  })
})

/** Extracts every theme token block (`.panel { color-scheme …; --token …; }`) from the HUD document. */
const themeTokenBlocks = (html: string): string[] =>
  [
    ...html.matchAll(
      /\.panel \{\n((?:[ ]+(?:color-scheme|--[a-z-]+): [^;\n]+;\n)+)[ ]+\}/g,
    ),
  ].map((match) => match[1] ?? '')

/** The dark-media part of a System HUD (everything after the media query opens). */
const darkMediaPart = (html: string): string =>
  html.slice(html.indexOf('@media (prefers-color-scheme: dark) {\n'))

describe('update progress window theme (#214)', () => {
  test('paints the Default light theme, switching to Default dark with the OS, when no theme is stored', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    const [lightBlock, darkBlock] = themeTokenBlocks(html)
    expect(lightBlock).toContain('color-scheme: light;')
    expect(lightBlock).toContain('--popover: oklch(1 0 0);')
    expect(lightBlock).toContain('--primary: oklch(0.205 0 0);')
    expect(darkMediaPart(html)).toContain('color-scheme: dark;')
    expect(darkBlock).toContain('--popover: oklch(0.205 0 0);')
    expect(darkBlock).toContain('--primary: oklch(0.922 0 0);')
  })

  test.each(['system', 'cathedral-lite', ''])(
    'treats the stored value %j like no stored theme (Default following the OS)',
    (storedTheme) => {
      // Arrange
      const noThemeHtml = buildUpdateProgressWindowHtml(halfwayProgress)

      // Act
      const html = buildUpdateProgressWindowHtml(halfwayProgress, storedTheme)

      // Assert
      expect(html).toBe(noThemeHtml)
    },
  )

  test('never paints Warm Cathedral amber unless a Warm Cathedral theme is picked', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).not.toContain('oklch(0.56 0.16 50)')
    expect(html).not.toContain('oklch(0.7 0.16 55)')
    expect(html).not.toContain('--surface')
  })

  test('paints Warm Cathedral light when picked and ignores the OS appearance', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(
      halfwayProgress,
      'cathedral-light',
    )

    // Assert
    expect(themeTokenBlocks(html)).toEqual([
      [
        '        color-scheme: light;',
        '        --popover: oklch(0.972 0.018 78);',
        '        --popover-foreground: oklch(0.18 0.015 30);',
        '        --muted-foreground: oklch(0.5 0.026 56);',
        '        --border: oklch(0.908 0.022 76);',
        '        --primary: oklch(0.56 0.16 50);',
        '',
      ].join('\n'),
    ])
    expect(html).not.toContain('prefers-color-scheme: dark')
  })

  test('paints Warm Cathedral dark when picked', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(
      halfwayProgress,
      'cathedral-dark',
    )

    // Assert
    const [block] = themeTokenBlocks(html)
    expect(block).toContain('color-scheme: dark;')
    expect(block).toContain('--popover: oklch(0.235 0.028 44);')
    expect(block).toContain('--primary: oklch(0.7 0.16 55);')
  })

  test('paints a derived family (Harbor dark) with its generated colors', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress, 'harbor-dark')

    // Assert
    const [block] = themeTokenBlocks(html)
    expect(block).toContain('color-scheme: dark;')
    expect(block).toContain('--popover: oklch(0.235 0.014 250);')
    expect(block).toContain('--popover-foreground: oklch(0.96 0.014 250);')
    expect(block).toContain('--muted-foreground: oklch(0.74 0.014 250);')
    expect(block).toContain('--border: oklch(1 0.014 250 / 8%);')
    expect(block).toContain('--primary: oklch(0.7 0.135 250);')
  })

  test('paints Default dark for the legacy stored id default-dark', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress, 'default-dark')

    // Assert
    const [block] = themeTokenBlocks(html)
    expect(themeTokenBlocks(html)).toHaveLength(1)
    expect(block).toContain('color-scheme: dark;')
    expect(block).toContain('--primary: oklch(0.922 0 0);')
  })

  test.each(THEME_IDS)(
    'paints the picked theme %s with its own popover and primary colors',
    (themeId) => {
      // Arrange + Act
      const html = buildUpdateProgressWindowHtml(halfwayProgress, themeId)

      // Assert
      const [block] = themeTokenBlocks(html)
      expect(block).toContain(
        `--popover: ${THEME_TOKENS[themeId]['--popover']};`,
      )
      expect(block).toContain(
        `--primary: ${THEME_TOKENS[themeId]['--primary']};`,
      )
    },
  )

  test('declares only the five HUD theme tokens and color-scheme in each theme block', () => {
    // Arrange + Act
    const blocks = themeTokenBlocks(
      buildUpdateProgressWindowHtml(halfwayProgress),
    )

    // Assert
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      const declaredNames = [...block.matchAll(/([a-z-]+):/g)].map(
        (match) => match[1],
      )
      expect(declaredNames).toEqual([
        'color-scheme',
        '--popover',
        '--popover-foreground',
        '--muted-foreground',
        '--border',
        '--primary',
      ])
    }
  })

  test.each(['</style><script>alert(1)</script>', '__proto__', 'constructor'])(
    'never writes the hostile stored value %j into the window document',
    (hostileTheme) => {
      // Arrange
      const systemHtml = buildUpdateProgressWindowHtml(
        halfwayProgress,
        'system',
      )

      // Act
      const html = buildUpdateProgressWindowHtml(halfwayProgress, hostileTheme)

      // Assert
      expect(html).toBe(systemHtml)
    },
  )

  test('paints an opaque popover panel with no backdrop blur', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('background: var(--popover);')
    expect(html).not.toContain('backdrop-filter')
  })

  test('paints the progress bar with the theme primary on a 20% primary track', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain(
      'background: color-mix(in oklch, var(--primary) 20%, transparent);',
    )
    expect(html).toMatch(/\.fill \{[^}]*background: var\(--primary\);/)
  })

  test('keeps the transparent window root free of a theme color-scheme', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress, 'harbor-dark')

    // Assert
    expect(html).not.toMatch(/:root\s*\{/)
    expect(html).toMatch(/body \{[^}]*background: transparent;/)
  })
})

import { describe, expect, it } from 'vitest'

import { buildStartupPillHtml } from '../startup-pill-html'

describe('cold-boot startup pill markup', () => {
  it('greets the user with the reassuring "Opening CoreLive…" copy', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert: the exact reassurance string the user reads while windows wake up.
    expect(html).toContain('Opening CoreLive…')
  })

  it('renders a complete standalone HTML document', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert: a full doc so it can load directly as a data: URL.
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
  })

  it('stays click-through so the floating pill never steals a desktop click', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert
    expect(html).toContain('pointer-events: none')
    expect(html).toContain('user-select: none')
  })

  it('holds the dot steady when the OS prefers reduced motion', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert: the reduce-motion query disables the breathing animation.
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('animation: none')
  })

  it('adapts its palette to the OS dark-mode preference', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert
    expect(html).toContain('@media (prefers-color-scheme: dark)')
  })

  it('uses the editorial serif, never a productivity-convergence sans', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert: DESIGN.md serif with an instant-paint Georgia fallback; the
    // forbidden AI-default sans must never appear in the brand surface.
    expect(html).toContain("'Newsreader', Georgia")
    expect(html).not.toMatch(/\bInter\b/)
  })

  it('paints offline by never emitting a render-blocking web-font link', () => {
    // Arrange + Act
    const html = buildStartupPillHtml()

    // Assert: an external stylesheet link blocks the first paint until it loads
    // or times out, leaving bare desktop on a slow/offline cold boot — so the
    // markup must carry no stylesheet link and never reach for Google Fonts.
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toMatch(/rel=["']stylesheet/)
  })
})

import { describe, expect, it } from 'vitest'

import { buildShareCard } from './export-day-as-image'

/**
 * Regression guards for the html-to-image blank-PNG bug.
 *
 * html-to-image's `cloneCSSStyle` copies the captured node's
 * `getComputedStyle().cssText` onto the clone mounted in an SVG
 * `<foreignObject>`. Any hiding style on the captured node (off-screen
 * `top`, `opacity: 0`, `visibility: hidden`, `transform: translate`)
 * propagates to the clone and produces a blank PNG.
 *
 * The fix puts hiding styles on the OUTER wrapper while the INNER card
 * — which is the node passed to `toPng` — stays "naked" (no hiding
 * styles). These tests lock that invariant down so a future contributor
 * adding `transform: translate(...)` to nudge the card or `opacity: 0`
 * for a fade-in cannot silently reintroduce the blank-PNG bug.
 */
describe('buildShareCard', () => {
  it('card style must not contain any hiding property (regression: blank PNG)', () => {
    const { card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 8,
      topCategoryName: 'writing',
    })
    const cssText = card.style.cssText
    // `position` of any value moves the card out of the wrapper's
    // overflow-hidden clip and back into the live viewport.
    expect(cssText).not.toMatch(/(^|;\s*|^\s*)position\s*:/i)
    // `opacity` propagates through `cssText` and renders the captured
    // clone transparent → only the canvas backgroundColor survives.
    expect(cssText).not.toMatch(/(^|;\s*|^\s*)opacity\s*:/i)
    // `visibility: hidden` hides the clone outright.
    expect(cssText).not.toMatch(/(^|;\s*|^\s*)visibility\s*:\s*hidden/i)
    // `transform: translate(...)` moves the clone outside the
    // foreignObject (0,0) viewBox → clipped to blank.
    expect(cssText).not.toMatch(/(^|;\s*|^\s*)transform\s*:/i)
    // `clip-path` similarly clips the clone.
    expect(cssText).not.toMatch(/(^|;\s*|^\s*)clip-path\s*:/i)
  })

  it('wrapper carries the hiding styles (0×0 fixed + overflow hidden)', () => {
    const { wrapper } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 1,
    })
    // Direct property assertions on the parsed style declaration rather
    // than regexing `cssText` — `/width\s*:\s*0/` would also accept
    // `0.5px` or `0vw`, which would silently let the wrapper grow to a
    // visible size.
    expect(wrapper.style.position).toBe('fixed')
    expect(wrapper.style.width).toBe('0px')
    expect(wrapper.style.height).toBe('0px')
    expect(wrapper.style.overflow).toBe('hidden')
    // `aria-hidden` so screen readers skip the temporary tree.
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
  })

  it('wrapper contains the card as its only child', () => {
    const { wrapper, card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 4,
    })
    expect(wrapper.children.length).toBe(1)
    expect(wrapper.firstElementChild).toBe(card)
  })

  it('card preserves full 480×600 dimensions for html-to-image capture', () => {
    const { card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 3,
    })
    const cssText = card.style.cssText
    expect(cssText).toMatch(/width\s*:\s*480px/i)
    expect(cssText).toMatch(/height\s*:\s*600px/i)
  })

  it('renders singular copy when totalCompleted is 1', () => {
    const { card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 1,
    })
    expect(card.innerHTML).toContain('thing done — a good day.')
    expect(card.innerHTML).not.toContain('things done')
  })

  it('renders plural copy when totalCompleted is not 1', () => {
    const { card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 8,
    })
    expect(card.innerHTML).toContain('things done — a good day.')
  })

  it('omits the "mostly <category>" line when topCategoryName is missing', () => {
    const { card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 3,
    })
    expect(card.innerHTML).not.toContain('mostly')
  })

  it('escapes HTML in topCategoryName to prevent injection via category names', () => {
    const { card } = buildShareCard({
      isoDate: '2026-05-12',
      totalCompleted: 3,
      topCategoryName: '<script>alert("xss")</script>',
    })
    // The raw tag must NOT appear; only its escaped form should.
    expect(card.innerHTML).not.toContain('<script>alert')
    expect(card.innerHTML).toContain('&lt;script&gt;')
  })
})

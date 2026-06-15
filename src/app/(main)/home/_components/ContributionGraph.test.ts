import { describe, expect, it } from 'vitest'

import { calculateHeatmapLayout } from './ContributionGraph'

/**
 * The Activity heatmap shows a trailing one year, which lays out as 53 Sunday-
 * aligned week columns. These specs lock the sizing contract that lets the
 * heatmap sit full-content-width without a horizontal scrollbar (the bug Task 5
 * fixed by promoting it out of the half-width column) while still honoring the
 * DESIGN.md "Heatmap Cathedral D6" cell-size lock (12px min, 32px max).
 */
const WEEKS_IN_TRAILING_YEAR = 53

describe('Activity heatmap sizing', () => {
  it('fits the whole year inside the card at desktop content width, so no horizontal scrollbar appears', () => {
    // Arrange — the home page now gives the heatmap the full ~1180px content width.
    const containerWidth = 1180

    // Act
    const layout = calculateHeatmapLayout(
      containerWidth,
      WEEKS_IN_TRAILING_YEAR,
    )

    // Assert — the rendered grid is no wider than its card, so it never overflows.
    expect(layout.rectSize).toBe(19)
    expect(layout.width).toBe(1141)
    expect(layout.width).toBeLessThanOrEqual(containerWidth)
  })

  it('never grows cells past the 32px Cathedral maximum even in an unusually wide card', () => {
    // Arrange — a very wide container that could otherwise over-grow the cells.
    const containerWidth = 3000

    // Act
    const layout = calculateHeatmapLayout(
      containerWidth,
      WEEKS_IN_TRAILING_YEAR,
    )

    // Assert — cells cap at the DESIGN.md D6 maximum.
    expect(layout.rectSize).toBe(32)
  })

  it('holds the 12px minimum cell and lets the grid overflow when the card is narrower than a full year', () => {
    // Arrange — the old half-width column (~578px) cannot fit 53 weeks at the 12px floor.
    const containerWidth = 578

    // Act
    const layout = calculateHeatmapLayout(
      containerWidth,
      WEEKS_IN_TRAILING_YEAR,
    )

    // Assert — the cell holds the floor and the grid stays wider than the card,
    // so overflow-x-auto scrolls it (the only D6-legal behavior below ~770px).
    expect(layout.rectSize).toBe(12)
    expect(layout.width).toBe(770)
    expect(layout.width).toBeGreaterThan(containerWidth)
  })

  it('falls back to the minimum-size layout before the container width has been measured', () => {
    // Arrange — width is null on the first render, before the ResizeObserver fires.
    const unmeasuredWidth = null

    // Act
    const layout = calculateHeatmapLayout(
      unmeasuredWidth,
      WEEKS_IN_TRAILING_YEAR,
    )

    // Assert — a stable minimum-size layout avoids a layout jump on first paint.
    expect(layout.rectSize).toBe(12)
    expect(layout.width).toBe(770)
  })
})

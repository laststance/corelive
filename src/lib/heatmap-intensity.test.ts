import { describe, it, expect } from 'vitest'

import {
  HEATMAP_CATHEDRAL_MIN,
  HEATMAP_FULL_DAY_MIN,
  HEATMAP_GOOD_DAY_MIN,
  HEATMAP_LEVEL_TOKENS,
  getHeatmapIntensityFromCount,
} from './heatmap-intensity'

describe('getHeatmapIntensityFromCount', () => {
  it('shows the coolest level on a rest day with nothing completed', () => {
    // Arrange
    const dayCount = 0

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(0)
  })

  it('warms to the started band on the very first completion', () => {
    // Arrange
    const dayCount = 1

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(1)
  })

  it('stays in the started band through three completions', () => {
    // Arrange — the count is raw: three completions whether distinct tasks or the
    // same task repeated (DESIGN.md: repeats are XP, never deduplicated)
    const dayCount = 3

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(1)
  })

  it('crosses into the good-day band at four completions', () => {
    // Arrange
    const dayCount = 4

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(2)
  })

  it('holds the good-day band through nine completions', () => {
    // Arrange
    const dayCount = 9

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(2)
  })

  it('crosses into the full-day band at ten completions', () => {
    // Arrange
    const dayCount = 10

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(3)
  })

  it('holds the full-day band through nineteen completions', () => {
    // Arrange
    const dayCount = 19

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(3)
  })

  it('reaches cathedral-lit at twenty completions', () => {
    // Arrange
    const dayCount = 20

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(4)
  })

  it('stays cathedral-lit for an unusually huge count', () => {
    // Arrange
    const dayCount = 100

    // Act
    const intensity = getHeatmapIntensityFromCount(dayCount)

    // Assert
    expect(intensity).toBe(4)
  })
})

describe('HEATMAP_LEVEL_TOKENS', () => {
  it('lists the five --hm CSS tokens in cool-to-warm order so band index maps to token', () => {
    // Arrange / Act / Assert
    expect(HEATMAP_LEVEL_TOKENS).toEqual([
      'var(--hm-0)',
      'var(--hm-1)',
      'var(--hm-2)',
      'var(--hm-3)',
      'var(--hm-4)',
    ])
  })
})

describe('heatmap band thresholds', () => {
  it('locks the band boundaries so heatmap cells and the dialog never drift', () => {
    // Arrange / Act / Assert — these feed both the dialog bands and
    // ContributionGraph's panelColors; changing one without the other would
    // desync a cell's color from its dialog level
    expect(HEATMAP_GOOD_DAY_MIN).toBe(4)
    expect(HEATMAP_FULL_DAY_MIN).toBe(10)
    expect(HEATMAP_CATHEDRAL_MIN).toBe(20)
  })
})

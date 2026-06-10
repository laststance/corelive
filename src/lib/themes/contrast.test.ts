import { describe, it, expect } from 'vitest'

import { contrastRatio, meetsAA, readableForeground } from './contrast'

describe('contrastRatio', () => {
  it('reaches the maximum ratio of 21 for black on white', () => {
    // Arrange / Act
    const ratio = contrastRatio('#000000', '#ffffff')

    // Assert
    expect(ratio).toBeCloseTo(21)
  })

  it('is 1 for a color against itself', () => {
    // Arrange / Act
    const ratio = contrastRatio('#777777', '#777777')

    // Assert
    expect(ratio).toBeCloseTo(1)
  })
})

describe('meetsAA', () => {
  it('passes white text on black, far above the AA body threshold', () => {
    // Arrange / Act
    const passes = meetsAA('#ffffff', '#000000')

    // Assert
    expect(passes).toBe(true)
  })

  it('fails faint gray text on white, below the AA body threshold', () => {
    // Arrange — #cccccc on white is ~1.6, well under 4.5

    // Act
    const passes = meetsAA('#cccccc', '#ffffff')

    // Assert
    expect(passes).toBe(false)
  })

  it('applies the lenient large-text threshold so a mid-contrast pair passes large but fails body', () => {
    // Arrange — #8a8a8a on white is ~3.45: above the 3.0 large/UI floor, below the 4.5 body floor
    const foreground = '#8a8a8a'
    const background = '#ffffff'

    // Act
    const passesLarge = meetsAA(foreground, background, true)
    const passesBody = meetsAA(foreground, background, false)

    // Assert
    expect(passesLarge).toBe(true)
    expect(passesBody).toBe(false)
  })
})

describe('readableForeground', () => {
  it('chooses the dark candidate on a light background', () => {
    // Arrange / Act
    const foreground = readableForeground('#ffffff', ['#ffffff', '#000000'])

    // Assert
    expect(foreground).toBe('#000000')
  })

  it('chooses the light candidate on a dark background', () => {
    // Arrange / Act
    const foreground = readableForeground('#000000', ['#ffffff', '#000000'])

    // Assert
    expect(foreground).toBe('#ffffff')
  })

  it('picks the brand ink over near-white on a light surface by default', () => {
    // Arrange — default candidates are the brand near-white and near-ink

    // Act
    const foreground = readableForeground('#ffffff')

    // Assert
    expect(foreground).toBe('oklch(0.18 0.015 30)')
  })
})

/**
 * @fileoverview Unit tests for the clampDimension utility.
 *
 * Validates every input category: valid in-range, undersized, oversized, NaN,
 * zero, negative, Infinity, and undefined. These edge cases guard the
 * persisted settingsPopover width/height from corrupting the window creation
 * call in WindowManager.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- clampDimension
 */
import { describe, expect, it } from 'vitest'

import { clampDimension } from '../utils/clampDimension'

describe('clampDimension', () => {
  const MIN = 320
  const MAX = 800
  const DEFAULT = 360

  it('returns a valid in-range value unchanged', () => {
    // Arrange + Act + Assert
    expect(clampDimension(500, MIN, MAX, DEFAULT)).toBe(500)
  })

  it('clamps an undersized positive value up to min', () => {
    // Arrange + Act + Assert
    expect(clampDimension(100, MIN, MAX, DEFAULT)).toBe(MIN)
  })

  it('clamps an oversized value down to max', () => {
    // Arrange + Act + Assert
    expect(clampDimension(99999, MIN, MAX, DEFAULT)).toBe(MAX)
  })

  it('returns defaultValue for NaN', () => {
    // Arrange + Act + Assert
    expect(clampDimension(NaN, MIN, MAX, DEFAULT)).toBe(DEFAULT)
  })

  it('returns defaultValue for zero', () => {
    // Arrange + Act + Assert
    expect(clampDimension(0, MIN, MAX, DEFAULT)).toBe(DEFAULT)
  })

  it('returns defaultValue for a negative number', () => {
    // Arrange + Act + Assert
    expect(clampDimension(-1, MIN, MAX, DEFAULT)).toBe(DEFAULT)
  })

  it('returns defaultValue for Infinity', () => {
    // Arrange + Act + Assert
    expect(clampDimension(Infinity, MIN, MAX, DEFAULT)).toBe(DEFAULT)
  })

  it('returns defaultValue for undefined', () => {
    // Arrange + Act + Assert
    expect(clampDimension(undefined, MIN, MAX, DEFAULT)).toBe(DEFAULT)
  })

  it('rounds a fractional value to the nearest integer', () => {
    // Arrange + Act + Assert
    expect(clampDimension(400.7, MIN, MAX, DEFAULT)).toBe(401)
  })
})

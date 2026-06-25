import { describe, expect, it } from 'vitest'

import {
  createNativeBinding,
  formatNativeBindingForDisplay,
  isNativeBinding,
  LONE_MODIFIER_DISPLAY,
  LONE_MODIFIER_IDS,
  type LoneModifierId,
  parseNativeBinding,
} from '../nativeBinding'

describe('native lone-modifier binding model', () => {
  it('routes a lone-modifier value down the native path and an accelerator down the globalShortcut path', () => {
    // Arrange
    const loneModifierValue = 'lone-modifier:rightOption'
    const acceleratorValue = 'CommandOrControl+B'

    // Act
    const loneIsNative = isNativeBinding(loneModifierValue)
    const acceleratorIsNative = isNativeBinding(acceleratorValue)

    // Assert
    expect(loneIsNative).toBe(true)
    expect(acceleratorIsNative).toBe(false)
  })

  it('treats the empty/disabled value as a non-native binding', () => {
    // Arrange
    const disabledValue = ''

    // Act
    const result = isNativeBinding(disabledValue)

    // Assert
    expect(result).toBe(false)
  })

  it('builds a Right Option binding as a sentinel-prefixed compat string', () => {
    // Arrange
    const modifier: LoneModifierId = 'rightOption'

    // Act
    const persistedValue = createNativeBinding(modifier)

    // Assert
    expect(persistedValue).toBe('lone-modifier:rightOption')
  })

  it('parses a Right Option binding into its structured modifier', () => {
    // Arrange
    const persistedValue = 'lone-modifier:rightOption'

    // Act
    const binding = parseNativeBinding(persistedValue)

    // Assert
    expect(binding).toEqual({ kind: 'lone-modifier', modifier: 'rightOption' })
  })

  it('refuses to parse an accelerator as a native binding', () => {
    // Arrange
    const acceleratorValue = 'CommandOrControl+Shift+B'

    // Act
    const binding = parseNativeBinding(acceleratorValue)

    // Assert
    expect(binding).toBeNull()
  })

  it('rejects a native binding whose modifier id is unknown (corrupt config / bad IPC payload)', () => {
    // Arrange
    const corruptValue = 'lone-modifier:bogusModifier'

    // Act
    const binding = parseNativeBinding(corruptValue)

    // Assert
    expect(binding).toBeNull()
  })

  it('round-trips every canonical lone modifier through create then parse', () => {
    // Arrange + Act + Assert (one canonical id per loop iteration)
    for (const modifier of LONE_MODIFIER_IDS) {
      const persistedValue = createNativeBinding(modifier)
      const binding = parseNativeBinding(persistedValue)
      expect(binding).toEqual({ kind: 'lone-modifier', modifier })
    }
  })

  it('displays a native binding as its macOS label, never the raw sentinel string', () => {
    // Arrange
    const persistedValue = 'lone-modifier:rightOption'

    // Act
    const label = formatNativeBindingForDisplay(persistedValue)

    // Assert
    expect(label).toBe('Right ⌥')
    expect(label).not.toContain('lone-modifier:')
  })

  it('passes an accelerator through the display formatter unchanged', () => {
    // Arrange
    const acceleratorValue = 'CommandOrControl+B'

    // Act
    const label = formatNativeBindingForDisplay(acceleratorValue)

    // Assert
    expect(label).toBe('CommandOrControl+B')
  })

  it('has a non-empty display label for every canonical lone modifier so none renders blank in the tray', () => {
    // Arrange + Act + Assert
    for (const modifier of LONE_MODIFIER_IDS) {
      const label = LONE_MODIFIER_DISPLAY[modifier]
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

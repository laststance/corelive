import { describe, expect, it } from 'vitest'

import { keyboardEventToLoneModifierBinding } from './keyboardEventToLoneModifierBinding'

/**
 * Build a `keydown` event with the given physical code + modifier state.
 * @param init - `code` plus any KeyboardEvent flags (altKey, repeat, …).
 * @returns A real KeyboardEvent for the converter under test.
 * @example keydown({ code: 'AltRight', altKey: true })
 */
function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('keyboardEventToLoneModifierBinding', () => {
  it('arms a Right Option binding when the right Option key is pressed alone', () => {
    // Arrange
    const event = keydown({ code: 'AltRight', altKey: true })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)

    // Assert
    expect(binding).toBe('lone-modifier:rightOption')
  })

  it('distinguishes left from right for the same modifier key', () => {
    // Arrange
    const event = keydown({ code: 'AltLeft', altKey: true })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)

    // Assert
    expect(binding).toBe('lone-modifier:leftOption')
  })

  it('maps each physical modifier key to its own left/right binding', () => {
    // Arrange: every modifier code + the flag its own key-down sets.
    const cases = [
      { code: 'AltLeft', altKey: true, expected: 'lone-modifier:leftOption' },
      { code: 'AltRight', altKey: true, expected: 'lone-modifier:rightOption' },
      {
        code: 'ControlLeft',
        ctrlKey: true,
        expected: 'lone-modifier:leftControl',
      },
      {
        code: 'ControlRight',
        ctrlKey: true,
        expected: 'lone-modifier:rightControl',
      },
      {
        code: 'ShiftLeft',
        shiftKey: true,
        expected: 'lone-modifier:leftShift',
      },
      {
        code: 'ShiftRight',
        shiftKey: true,
        expected: 'lone-modifier:rightShift',
      },
      {
        code: 'MetaLeft',
        metaKey: true,
        expected: 'lone-modifier:leftCommand',
      },
      {
        code: 'MetaRight',
        metaKey: true,
        expected: 'lone-modifier:rightCommand',
      },
    ]

    // Act + Assert
    for (const { expected, ...init } of cases) {
      expect(keyboardEventToLoneModifierBinding(keydown(init))).toBe(expected)
    }
  })

  it('rejects a modifier that is part of a forming chord (a second modifier is held)', () => {
    // Arrange: Control pressed while Command is already down → two modifiers.
    const event = keydown({ code: 'ControlLeft', ctrlKey: true, metaKey: true })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)

    // Assert
    expect(binding).toBeNull()
  })

  it('rejects a non-modifier key so a normal keypress never arms a lone binding', () => {
    // Arrange
    const event = keydown({ code: 'KeyA' })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)

    // Assert
    expect(binding).toBeNull()
  })

  it('ignores a modifier pressed during IME composition', () => {
    // Arrange
    const event = keydown({ code: 'AltRight', altKey: true, isComposing: true })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)

    // Assert
    expect(binding).toBeNull()
  })

  it('ignores OS auto-repeat so a held modifier arms only once', () => {
    // Arrange
    const event = keydown({ code: 'AltRight', altKey: true, repeat: true })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)

    // Assert
    expect(binding).toBeNull()
  })
})

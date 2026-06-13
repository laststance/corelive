import { describe, expect, it } from 'vitest'

import { keyboardEventToAccelerator } from './keyboardEventToAccelerator'

/**
 * Build a `keydown` event with the given physical code + modifier state.
 * @param init - `code` plus any KeyboardEvent flags (metaKey, repeat, …).
 * @returns A real KeyboardEvent for the converter under test.
 * @example keydown({ code: 'Digit3', metaKey: true })
 */
function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('keyboardEventToAccelerator', () => {
  it('maps Cmd + digit to a CommandOrControl accelerator', () => {
    // Arrange
    const event = keydown({ code: 'Digit3', metaKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBe('CommandOrControl+3')
  })

  it('maps Option + Space to the BrainDump-style accelerator', () => {
    // Arrange
    const event = keydown({ code: 'Space', altKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBe('Alt+Space')
  })

  it('emits modifiers in canonical Command-then-Shift order', () => {
    // Arrange
    const event = keydown({ code: 'KeyN', metaKey: true, shiftKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBe('CommandOrControl+Shift+N')
  })

  it('captures a function key pressed with no modifier', () => {
    // Arrange
    const event = keydown({ code: 'F5' })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBe('F5')
  })

  it('rejects a bare letter with no modifier so it cannot grab the keyboard', () => {
    // Arrange
    const event = keydown({ code: 'KeyA' })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBeNull()
  })

  it('stays incomplete while only a modifier is held down', () => {
    // Arrange: MetaLeft is the physical Cmd key — not a bindable accelerator key.
    const event = keydown({ code: 'MetaLeft', metaKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBeNull()
  })

  it('ignores keys pressed during IME composition', () => {
    // Arrange
    const event = keydown({ code: 'KeyN', metaKey: true, isComposing: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBeNull()
  })

  it('ignores OS auto-repeat so a held key is captured only once', () => {
    // Arrange
    const event = keydown({ code: 'KeyN', metaKey: true, repeat: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBeNull()
  })

  it('uses the physical key so Shift + Equal stays "=" and never "+"', () => {
    // Arrange
    const event = keydown({ code: 'Equal', shiftKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBe('Shift+=')
  })

  it('maps a numpad key to its Electron num token', () => {
    // Arrange
    const event = keydown({ code: 'Numpad5', metaKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBe('CommandOrControl+num5')
  })

  it('returns null for an unmapped physical key even with a modifier held', () => {
    // Arrange: 'IntlBackslash' has no accelerator mapping, so holding Cmd must
    // still resolve to null — never a bogus "CommandOrControl+undefined".
    const event = keydown({ code: 'IntlBackslash', metaKey: true })

    // Act
    const accelerator = keyboardEventToAccelerator(event)

    // Assert
    expect(accelerator).toBeNull()
  })
})

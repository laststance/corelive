import { describe, expect, it } from 'vitest'

import { formatAcceleratorForDisplay } from './formatAcceleratorForDisplay'
import { keyboardEventToAccelerator } from './keyboardEventToAccelerator'
import { keyboardEventToLoneModifierBinding } from './keyboardEventToLoneModifierBinding'

describe('formatAcceleratorForDisplay', () => {
  it('renders Cmd + digit as a tight ⌘ glyph group on macOS', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay('CommandOrControl+3', 'darwin')

    // Assert
    expect(display).toBe('⌘3')
  })

  it('renders Option + Space with the ⌥ glyph on macOS', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay('Alt+Space', 'darwin')

    // Assert
    expect(display).toBe('⌥Space')
  })

  it('orders modifiers Shift-before-Command per Apple HIG', () => {
    // Arrange + Act: capture util emits Command first; display must reorder.
    const display = formatAcceleratorForDisplay(
      'CommandOrControl+Shift+N',
      'darwin',
    )

    // Assert
    expect(display).toBe('⇧⌘N')
  })

  it('renders Control as the ⌃ caret glyph on macOS', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay('Control+Shift+A', 'darwin')

    // Assert
    expect(display).toBe('⌃⇧A')
  })

  it('renders an arrow key as its glyph on macOS', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay('CommandOrControl+Up', 'darwin')

    // Assert
    expect(display).toBe('⌘↑')
  })

  it('renders ASCII labels joined with plus off macOS', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay('CommandOrControl+3', 'other')

    // Assert
    expect(display).toBe('Ctrl+3')
  })

  it('returns an empty string for an unbound accelerator', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay('', 'darwin')

    // Assert
    expect(display).toBe('')
  })

  it('renders a native lone-modifier binding as its labelled glyph on macOS', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay(
      'lone-modifier:rightOption',
      'darwin',
    )

    // Assert
    expect(display).toBe('Right ⌥')
  })

  it('renders a native lone-modifier binding the same off macOS (no token to split)', () => {
    // Arrange + Act
    const display = formatAcceleratorForDisplay(
      'lone-modifier:leftCommand',
      'other',
    )

    // Assert
    expect(display).toBe('Left ⌘')
  })

  it('round-trips a captured lone modifier from keydown to display label', () => {
    // Arrange: the lone-modifier handoff — whatever the capture util emits on a
    // clean single-modifier press must render cleanly here.
    const event = new KeyboardEvent('keydown', {
      code: 'AltRight',
      altKey: true,
    })

    // Act
    const binding = keyboardEventToLoneModifierBinding(event)
    const display = binding
      ? formatAcceleratorForDisplay(binding, 'darwin')
      : ''

    // Assert
    expect(binding).toBe('lone-modifier:rightOption')
    expect(display).toBe('Right ⌥')
  })

  it('round-trips a captured chord from keydown to display glyphs', () => {
    // Arrange: the exact handoff the capture box relies on — whatever
    // keyboardEventToAccelerator emits must render cleanly here.
    const event = new KeyboardEvent('keydown', {
      code: 'KeyN',
      metaKey: true,
      shiftKey: true,
    })

    // Act
    const accelerator = keyboardEventToAccelerator(event)
    const display = accelerator
      ? formatAcceleratorForDisplay(accelerator, 'darwin')
      : ''

    // Assert
    expect(accelerator).toBe('CommandOrControl+Shift+N')
    expect(display).toBe('⇧⌘N')
  })
})

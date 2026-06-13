import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { KeybindingCaptureInput } from './KeybindingCaptureInput'

/**
 * Render the capture box as a controlled field so the displayed glyph reflects
 * captured chords, while still exposing the raw onChange payload for assertions.
 * @param initialValue - Starting accelerator (`''` = unbound).
 * @returns The onChange spy and the box's button element (resolved by aria-label).
 * @example const { onChange, button } = renderCaptureBox()
 */
function renderCaptureBox(initialValue = ''): {
  onChange: ReturnType<typeof vi.fn>
  button: HTMLElement
} {
  const onChange = vi.fn()
  function Harness(): React.ReactElement {
    const [value, setValue] = useState(initialValue)
    return (
      <KeybindingCaptureInput
        value={value}
        ariaLabel="Toggle BrainDump"
        onChange={(accelerator) => {
          onChange(accelerator)
          setValue(accelerator)
        }}
      />
    )
  }
  render(<Harness />)
  return { onChange, button: screen.getByLabelText('Toggle BrainDump') }
}

describe('KeybindingCaptureInput', () => {
  it('shows the empty invite, then the recording prompt once activated', () => {
    // Arrange
    const { button } = renderCaptureBox()

    // Assert: unbound state invites the click that starts recording.
    expect(button).toHaveTextContent('Click to set')

    // Act
    fireEvent.click(button)

    // Assert: clicking enters recording and prompts for the chord.
    expect(button).toHaveTextContent('Press keys…')
  })

  it('captures ⌘+3 as a CommandOrControl accelerator', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox()

    // Act: enter recording, then press the chord.
    fireEvent.click(button)
    fireEvent.keyDown(button, { code: 'Digit3', metaKey: true })

    // Assert: metaKey maps to CommandOrControl (matches the app's defaults).
    expect(onChange).toHaveBeenCalledWith('CommandOrControl+3')
  })

  it('captures Alt+Space even though Space would otherwise activate the button', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox()

    // Act
    fireEvent.click(button)
    fireEvent.keyDown(button, { code: 'Space', altKey: true })

    // Assert: the recording box owns Space, so Alt+Space binds rather than clicking.
    expect(onChange).toHaveBeenCalledWith('Alt+Space')
  })

  it('keeps recording when an incomplete chord (bare Space, no modifier) is pressed', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox()

    // Act
    fireEvent.click(button)
    fireEvent.keyDown(button, { code: 'Space' })

    // Assert: a modifier-less key is not bindable, so nothing commits and the
    // box stays in recording mode waiting for a real chord.
    expect(onChange).not.toHaveBeenCalled()
    expect(button).toHaveTextContent('Press keys…')
  })

  it('does not capture the activation keypress that precedes recording', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox()

    // Act: a keydown BEFORE recording (the Enter/Space that triggers the click
    // which starts recording) must be left for the native button.
    const enter = createEvent.keyDown(button, { code: 'Enter' })
    fireEvent(button, enter)

    // Assert: nothing captured, and the event is not swallowed.
    expect(onChange).not.toHaveBeenCalled()
    expect(enter.defaultPrevented).toBe(false)
  })

  it('traps Tab while recording but releases it after Escape (keyboard escape hatch)', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox('Alt+Space')
    fireEvent.click(button)

    // Act + Assert: while recording, Tab is swallowed so focus can't silently
    // leave mid-capture and Shift+Tab-style chords stay capturable.
    const tabWhileRecording = createEvent.keyDown(button, { code: 'Tab' })
    fireEvent(button, tabWhileRecording)
    expect(tabWhileRecording.defaultPrevented).toBe(true)

    // Escape ends recording without changing the binding.
    fireEvent.keyDown(button, { code: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
    expect(button).toHaveTextContent('⌥Space')

    // After Escape, Tab is no longer trapped — the user can leave by keyboard.
    const tabAfterEscape = createEvent.keyDown(button, { code: 'Tab' })
    fireEvent(button, tabAfterEscape)
    expect(tabAfterEscape.defaultPrevented).toBe(false)
  })

  it('clears the binding when Backspace is pressed while recording', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox('Alt+Space')

    // Act
    fireEvent.click(button)
    fireEvent.keyDown(button, { code: 'Backspace' })

    // Assert: Backspace unbinds (emits the empty accelerator).
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('clears the binding when Delete is pressed while recording', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox('Alt+Space')

    // Act
    fireEvent.click(button)
    fireEvent.keyDown(button, { code: 'Delete' })

    // Assert: Delete unbinds (emits the empty accelerator).
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('ignores keydowns while an IME is composing so it never hijacks voice/IME input', () => {
    // Arrange
    const { onChange, button } = renderCaptureBox()
    fireEvent.click(button)

    // Act: a composing keydown must pass through untouched (the JP voice-input
    // user relies on the composition reaching the OS).
    const composing = createEvent.keyDown(button, {
      code: 'Digit3',
      metaKey: true,
      isComposing: true,
    })
    fireEvent(button, composing)

    // Assert: nothing captured and the key is not swallowed.
    expect(onChange).not.toHaveBeenCalled()
    expect(composing.defaultPrevented).toBe(false)
  })

  it('does not start recording when disabled', () => {
    // Arrange
    const onChange = vi.fn()
    render(
      <KeybindingCaptureInput
        value=""
        ariaLabel="Toggle BrainDump"
        disabled
        onChange={onChange}
      />,
    )
    const button = screen.getByLabelText('Toggle BrainDump')

    // Act
    fireEvent.click(button)
    fireEvent.keyDown(button, { code: 'Digit3', metaKey: true })

    // Assert: a disabled box captures nothing.
    expect(onChange).not.toHaveBeenCalled()
  })
})

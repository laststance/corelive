'use client'

import { useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  KEYBINDING_CAPTURE_EMPTY_LABEL,
  KEYBINDING_CAPTURE_RECORDING_LABEL,
} from '@/lib/constants/keybinding'
import { cn } from '@/lib/utils'

import { formatAcceleratorForDisplay } from './utils/formatAcceleratorForDisplay'
import { keyboardEventToAccelerator } from './utils/keyboardEventToAccelerator'

/** A keydown fired mid-IME-composition reports this sentinel keyCode (legacy but still emitted). */
const IME_COMPOSITION_KEYCODE = 229

interface KeybindingCaptureInputProps {
  /** Current accelerator string; `''` means unbound. Controlled by the parent. */
  value: string
  /**
   * Emits the captured accelerator, or `''` when the user clears the binding.
   * The parent owns persistence (buffer-then-Save, or commit-and-rollback).
   */
  onChange: (accelerator: string) => void
  /** Accessible name — set to the shortcut's human description so `getByLabelText` resolves here. */
  ariaLabel: string
  /** Stable id so a sibling `<Label htmlFor>` associates with this control. */
  id?: string
  /** Display platform; defaults to `'darwin'` (CoreLive ships macOS-only). */
  platform?: 'darwin' | 'other'
  /** Disables capture (e.g. while a save is in flight). */
  disabled?: boolean
  /** Extra classes merged onto the button (e.g. width overrides per call site). */
  className?: string
}

/**
 * Pick the button's visible label for the current state — recording prompt wins,
 * then the bound chord as macOS glyphs, then the empty-state invite.
 * @param isRecording - Whether the box is actively capturing a chord.
 * @param value - The bound accelerator string (`''` when unbound).
 * @param platform - Glyph platform passed through to {@link formatAcceleratorForDisplay}.
 * @returns
 * - `'Press keys…'` while recording
 * - the glyph string (e.g. `'⌥Space'`) when a chord is bound
 * - `'Click to set'` when unbound
 * @example
 * getCaptureLabel(true, 'Alt+Space', 'darwin')  // 'Press keys…'
 * getCaptureLabel(false, 'Alt+Space', 'darwin') // '⌥Space'
 * getCaptureLabel(false, '', 'darwin')          // 'Click to set'
 */
function getCaptureLabel(
  isRecording: boolean,
  value: string,
  platform: 'darwin' | 'other',
): string {
  if (isRecording) return KEYBINDING_CAPTURE_RECORDING_LABEL
  if (value) return formatAcceleratorForDisplay(value, platform)
  return KEYBINDING_CAPTURE_EMPTY_LABEL
}

/**
 * VSCode-style keybinding capture: click (or focus + Enter/Space) to start
 * recording, then press a key combination to bind it. Exists so users set
 * shortcuts by pressing the keys instead of typing Electron accelerator syntax;
 * rendered in the Electron keyboard-shortcut and BrainDump settings panels.
 * Built on the native-button primitive so a `<Label htmlFor>` still associates,
 * and reads `event.code` (physical key) so capture is keyboard-layout-independent.
 *
 * @param props - See {@link KeybindingCaptureInputProps}.
 * @returns A button showing the bound keys as glyphs (`⌥Space`), `Click to set`
 *   when unbound, or `Press keys…` while recording.
 * @example
 * <KeybindingCaptureInput value="Alt+Space" ariaLabel="Toggle BrainDump" onChange={setAccel} />
 */
export const KeybindingCaptureInput = function KeybindingCaptureInput({
  value,
  onChange,
  ariaLabel,
  id,
  platform = 'darwin',
  disabled = false,
  className,
}: KeybindingCaptureInputProps) {
  const [isRecording, setIsRecording] = useState(false)

  // Recording starts on explicit activation — a click, or keyboard Enter/Space,
  // both of which fire the button's onClick. Deliberately NOT on focus: auto-
  // recording on focus would trap keyboard users, because a recording box
  // preventDefaults Tab (Escape is the only keyboard exit).
  const startRecording = () => {
    if (disabled) return
    setIsRecording(true)
  }

  const stopRecording = () => {
    setIsRecording(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nativeEvent = event.nativeEvent
    // Mirror useKeyboardNav: never swallow a key while an IME is composing —
    // the JP voice-input flow needs the composition to reach the OS.
    if (
      nativeEvent.isComposing ||
      nativeEvent.keyCode === IME_COMPOSITION_KEYCODE
    ) {
      return
    }
    // Not recording yet: let the native button handle Enter/Space so it can
    // fire onClick → startRecording. This is the keypress that ENTERS
    // recording, so it must never be captured as the binding itself.
    if (!isRecording) return

    // Recording: trap every key — including Tab — so the chord is captured and
    // focus cannot escape mid-recording. Escape is the deliberate exit.
    event.preventDefault()
    event.stopPropagation()

    // OS auto-repeat is a held key, not a fresh chord.
    if (event.repeat) return

    // Escape cancels without changing the binding; focus stays so Tab resumes.
    if (event.code === 'Escape') {
      stopRecording()
      return
    }
    // Backspace/Delete clears the binding (unbinds the shortcut).
    if (event.code === 'Backspace' || event.code === 'Delete') {
      onChange('')
      stopRecording()
      return
    }

    // A complete chord commits and ends recording; an incomplete one (a bare
    // modifier, or an unmapped key) returns null and keeps the box recording.
    const accelerator = keyboardEventToAccelerator(nativeEvent)
    if (accelerator) {
      onChange(accelerator)
      stopRecording()
    }
  }

  return (
    <Button
      type="button"
      id={id}
      aria-label={ariaLabel}
      aria-keyshortcuts={value || undefined}
      variant="outline"
      disabled={disabled}
      onClick={startRecording}
      onBlur={stopRecording}
      onKeyDown={handleKeyDown}
      data-recording={isRecording || undefined}
      className={cn(
        'w-36 font-mono font-medium tabular-nums',
        // Recording emphasis uses scale ring tokens (ring-2), not an arbitrary
        // ring-[3px] — the latter is dslint-exempt only inside components/ui/**.
        isRecording && 'ring-ring/50 border-ring ring-2',
        className,
      )}
    >
      {getCaptureLabel(isRecording, value, platform)}
    </Button>
  )
}

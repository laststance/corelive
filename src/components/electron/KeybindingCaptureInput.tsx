'use client'

import { useRef, useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  KEYBINDING_CAPTURE_EMPTY_LABEL,
  KEYBINDING_CAPTURE_RECORDING_LABEL,
} from '@/lib/constants/keybinding'
import { cn } from '@/lib/utils'

import { formatAcceleratorForDisplay } from './utils/formatAcceleratorForDisplay'
import { keyboardEventToAccelerator } from './utils/keyboardEventToAccelerator'
import { keyboardEventToLoneModifierBinding } from './utils/keyboardEventToLoneModifierBinding'

/**
 * A lone-modifier candidate armed on key-down: the physical key still held and
 * the binding it commits to if released cleanly. `null` whenever no clean single
 * modifier is down — any intervening key (a chord, a second modifier) clears it.
 */
interface LoneModifierCandidate {
  /** `KeyboardEvent.code` of the held modifier — matched on key-up to commit. */
  code: string
  /** The binding string to emit, e.g. `'lone-modifier:rightOption'`. */
  binding: string
}

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
  // Lone-modifier capture is key-up based: a clean single-modifier key-down arms
  // this candidate, and the matching key-up commits it — but only if no other key
  // intervened. A ref (not state) because it changes within one capture gesture
  // and must never trigger a re-render mid-recording.
  const loneModifierCandidateRef = useRef<LoneModifierCandidate | null>(null)

  // Recording starts on explicit activation — a click, or keyboard Enter/Space,
  // both of which fire the button's onClick. Deliberately NOT on focus: auto-
  // recording on focus would trap keyboard users, because a recording box
  // preventDefaults Tab (Escape is the only keyboard exit).
  const startRecording = () => {
    if (disabled) return
    loneModifierCandidateRef.current = null
    setIsRecording(true)
  }

  const stopRecording = () => {
    loneModifierCandidateRef.current = null
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
      loneModifierCandidateRef.current = null
      stopRecording()
      return
    }

    // No chord yet. Arm a lone-modifier candidate only for a clean single-modifier
    // key-down; any other key (a non-modifier, or a second modifier forming a
    // chord) returns null and disarms it, so a later modifier key-up won't commit.
    const loneModifierBinding = keyboardEventToLoneModifierBinding(nativeEvent)
    loneModifierCandidateRef.current = loneModifierBinding
      ? { code: nativeEvent.code, binding: loneModifierBinding }
      : null
  }

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Only commit a lone modifier while recording; ignore the Enter/Space key-up
    // that activated the button (its code is never a modifier, so candidate is null).
    if (!isRecording) return

    const candidate = loneModifierCandidateRef.current
    // Commit only when the SAME physical modifier that was armed is released with
    // nothing else pressed in between — that is the lone-modifier gesture.
    if (candidate && event.code === candidate.code) {
      event.preventDefault()
      event.stopPropagation()
      onChange(candidate.binding)
      loneModifierCandidateRef.current = null
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
      onKeyUp={handleKeyUp}
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

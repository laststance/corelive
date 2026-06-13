import {
  CODE_TO_ACCELERATOR_KEY,
  FUNCTION_KEY_TOKENS,
} from '@/lib/constants/keybinding'

/**
 * Convert a captured `keydown` into an Electron accelerator string, or `null`
 * while the chord is incomplete/invalid — powers the VSCode-style "press the
 * keys" capture in keybinding settings. Reads `event.code` (physical key) so the
 * result is layout- and shift-independent (Shift+3 stays `Shift+3`, not `#`);
 * `event.metaKey` maps to `CommandOrControl` to match the existing defaults.
 *
 * @param event - The `keydown` event captured while a binding box is recording.
 * @returns
 * - A valid accelerator string when a non-modifier key is held with the required modifiers (e.g. `'CommandOrControl+Shift+N'`)
 * - `null` when the chord is not yet bindable: only modifiers are down, an IME composition is active, the event is an auto-repeat, the key is unmapped, or a non-function key is pressed with no modifier
 * @example
 * keyboardEventToAccelerator(cmdThree)   // ⌘ + 3      → 'CommandOrControl+3'
 * keyboardEventToAccelerator(altSpace)   // ⌥ + Space  → 'Alt+Space'
 * keyboardEventToAccelerator(f5)         // F5 (no mod) → 'F5'
 * keyboardEventToAccelerator(letterA)    // A  (no mod) → null
 */
export function keyboardEventToAccelerator(
  event: KeyboardEvent,
): string | null {
  // IME composition and OS auto-repeat are not deliberate new chords — ignore.
  if (event.isComposing || event.repeat) return null

  const key = CODE_TO_ACCELERATOR_KEY[event.code]
  // A bare modifier press (or an unmapped key) is not yet a complete chord.
  if (!key) return null

  // Canonical internal order; display reorders to Apple HIG separately.
  const modifiers: string[] = []
  if (event.metaKey) modifiers.push('CommandOrControl')
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')

  // Require a modifier for everything except F-keys, so a stray letter can't be
  // bound as a global shortcut that swallows normal typing.
  if (modifiers.length === 0 && !FUNCTION_KEY_TOKENS.has(key)) return null

  return [...modifiers, key].join('+')
}

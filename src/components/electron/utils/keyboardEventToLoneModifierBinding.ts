import {
  CODE_TO_LONE_MODIFIER,
  NATIVE_LONE_MODIFIER_PREFIX,
} from '@/lib/constants/keybinding'

/** Exactly one modifier flag may be active for a lone-modifier press to qualify. */
const SOLE_MODIFIER_COUNT = 1

/**
 * Map a `keydown` to a native lone-modifier binding string when — and only when —
 * it is a CLEAN single-modifier press (e.g. Right ⌥ with nothing else held), the
 * candidate the capture box arms and commits on the matching key-up. Reads
 * `event.code` so left/right are distinct (the reason for the native path), and
 * counts the modifier flags so a second held modifier reads as a chord-in-
 * progress, not a lone press.
 *
 * @param event - The `keydown` captured while a binding box is recording.
 * @returns
 * - the binding string (e.g. `'lone-modifier:rightOption'`) when the pressed key is a modifier AND it is the only modifier down
 * - `null` for a non-modifier key, a second simultaneous modifier, an IME composition, or an auto-repeat
 * @example
 * keyboardEventToLoneModifierBinding(rightOptDown) // ⌥ʀ alone     → 'lone-modifier:rightOption'
 * keyboardEventToLoneModifierBinding(cmdThenOpt)   // ⌘ held + ⌥   → null (chord)
 * keyboardEventToLoneModifierBinding(letterA)      // A            → null
 */
export function keyboardEventToLoneModifierBinding(
  event: KeyboardEvent,
): string | null {
  // IME composition and OS auto-repeat are not deliberate new presses — ignore.
  if (event.isComposing || event.repeat) return null

  const modifierId = CODE_TO_LONE_MODIFIER[event.code]
  // Only physical modifier keys can be a lone-modifier binding.
  if (!modifierId) return null

  // A lone press has exactly one modifier flag active (the one being pressed); a
  // second held modifier means a chord is forming, so this is not a lone press.
  const activeModifierCount =
    Number(event.metaKey) +
    Number(event.ctrlKey) +
    Number(event.altKey) +
    Number(event.shiftKey)
  if (activeModifierCount !== SOLE_MODIFIER_COUNT) return null

  return `${NATIVE_LONE_MODIFIER_PREFIX}${modifierId}`
}

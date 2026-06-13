/**
 * @fileoverview Keybinding capture + display constants.
 *
 * Source-of-truth maps for converting a browser `KeyboardEvent` into an Electron
 * accelerator string (`keyboardEventToAccelerator`) and rendering an accelerator
 * back as human-readable keys (`formatAcceleratorForDisplay`). Kept here — not
 * inline in the utils — per the repo rule that magic values live in `constants/`.
 *
 * Electron accelerator format reference (modifiers + key tokens):
 * https://www.electronjs.org/docs/latest/api/accelerator
 *
 * @module lib/constants/keybinding
 */

// Intrinsic alphabet/number ranges — named so the generated maps below carry no
// bare magic numbers.
const LETTER_COUNT = 26
const DIGIT_COUNT = 10
const FUNCTION_KEY_COUNT = 24
const UPPERCASE_A_CHARCODE = 65 // 'A'

/**
 * `KeyboardEvent.code` (physical key, layout/shift-independent) → Electron
 * accelerator key token. Letters/digits/function/numpad ranges are generated;
 * navigation, whitespace, and punctuation are explicit. Modifier keys are
 * intentionally absent — they are read from `event.metaKey/ctrlKey/altKey/shiftKey`.
 */
export const CODE_TO_ACCELERATOR_KEY: Record<string, string> = {
  // A–Z → 'A'–'Z'
  ...Object.fromEntries(
    Array.from({ length: LETTER_COUNT }, (_unused, index) => {
      const letter = String.fromCharCode(UPPERCASE_A_CHARCODE + index)
      return [`Key${letter}`, letter]
    }),
  ),
  // Digit0–Digit9 (top row) → '0'–'9'
  ...Object.fromEntries(
    Array.from({ length: DIGIT_COUNT }, (_unused, index) => [
      `Digit${index}`,
      String(index),
    ]),
  ),
  // F1–F24 → same token
  ...Object.fromEntries(
    Array.from({ length: FUNCTION_KEY_COUNT }, (_unused, index) => {
      const token = `F${index + 1}`
      return [token, token]
    }),
  ),
  // Numpad0–Numpad9 → 'num0'–'num9'
  ...Object.fromEntries(
    Array.from({ length: DIGIT_COUNT }, (_unused, index) => [
      `Numpad${index}`,
      `num${index}`,
    ]),
  ),
  // Numpad operators
  NumpadDecimal: 'numdec',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  // Whitespace / editing keys that are valid accelerator keys
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  // Navigation
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  // Punctuation (physical keys → literal accelerator chars; '=' not 'Plus' since
  // '+' is the accelerator separator).
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

/**
 * Accelerator key tokens that need no modifier to be valid (F1–F24). Every other
 * key requires at least one modifier so a stray letter can't grab the keyboard
 * as a global shortcut.
 */
export const FUNCTION_KEY_TOKENS: ReadonlySet<string> = new Set(
  Array.from(
    { length: FUNCTION_KEY_COUNT },
    (_unused, index) => `F${index + 1}`,
  ),
)

/** Every Electron modifier token, used to split an accelerator into modifiers vs key. */
export const ACCELERATOR_MODIFIER_TOKENS: ReadonlySet<string> = new Set([
  'CommandOrControl',
  'CmdOrCtrl',
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
])

/** Modifier token → macOS glyph. */
export const MAC_MODIFIER_GLYPHS: Record<string, string> = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Super: '⌘',
  Meta: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  AltGr: '⌥',
  Shift: '⇧',
}

/**
 * Apple HIG modifier display order — Control, Option, Shift, Command (⌃⌥⇧⌘),
 * Command nearest the key. The capture util may emit modifiers in a different
 * order, so display sorts by this index.
 */
export const MAC_MODIFIER_DISPLAY_ORDER: Record<string, number> = {
  Control: 0,
  Ctrl: 0,
  Alt: 1,
  Option: 1,
  AltGr: 1,
  Shift: 2,
  CommandOrControl: 3,
  CmdOrCtrl: 3,
  Command: 3,
  Cmd: 3,
  Meta: 3,
  Super: 3,
}

/** Accelerator key token → macOS glyph (keys without an entry display literally). */
export const MAC_KEY_GLYPHS: Record<string, string> = {
  Return: '⏎',
  Enter: '⏎',
  Escape: '⎋',
  Esc: '⎋',
  Tab: '⇥',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Backspace: '⌫',
  Delete: '⌦',
}

/** Modifier token → ASCII label for non-macOS display (the app is macOS-only; this keeps the util pure + testable). */
export const ASCII_MODIFIER_LABELS: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Control: 'Ctrl',
  Ctrl: 'Ctrl',
  Command: 'Cmd',
  Cmd: 'Cmd',
  Super: 'Super',
  Meta: 'Meta',
  Alt: 'Alt',
  Option: 'Alt',
  AltGr: 'Alt',
  Shift: 'Shift',
}

// ---------------------------------------------------------------------------
// KeybindingCaptureInput microcopy — gentle, no-shame voice per DESIGN.md. The
// box is a button whose label cycles through these three states.
// ---------------------------------------------------------------------------

/** Shown when a binding box is unbound — invites the click that starts recording. */
export const KEYBINDING_CAPTURE_EMPTY_LABEL = 'Click to set'

/** Shown while a binding box is recording — prompts the user to press the chord. */
export const KEYBINDING_CAPTURE_RECORDING_LABEL = 'Press keys…'

/** Surfaced when the captured chord is already registered elsewhere (register returned false). */
export const KEYBINDING_CONFLICT_MESSAGE =
  "That combo's already in use — try another."

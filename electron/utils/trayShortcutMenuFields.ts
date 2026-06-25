/**
 * @fileoverview Build the `{ label, accelerator? }` fields for a tray menu item
 * whose hotkey is shown live. Electron's `MenuItem.accelerator` only parses
 * Electron accelerators, so a native lone-modifier binding (`lone-modifier:*`)
 * must NOT go in that field — it would fail to parse and show garbage. Instead it
 * is appended to the label as its glyph. Shared by the SystemTrayManager hotkey
 * rows so chord and lone-modifier bindings both display correctly.
 *
 * @module electron/utils/trayShortcutMenuFields
 */

import {
  formatNativeBindingForDisplay,
  isNativeBinding,
  parseNativeBinding,
} from '../nativeBinding'

/** Spacer between a tray item's text and an appended lone-modifier glyph. */
const LABEL_GLYPH_SEPARATOR = '  '

/** The tray-menu fields a hotkey row spreads onto its `MenuItemConstructorOptions`. */
export interface TrayShortcutMenuFields {
  /** The visible row text — with the lone-modifier glyph appended when applicable. */
  label: string
  /** The Electron accelerator to right-align; absent for native or unset bindings. */
  accelerator?: string
}

/**
 * Pick how a tray hotkey row shows its binding: a chord uses Electron's native
 * right-aligned `accelerator`; a lone-modifier binding (which Electron can't
 * parse) is appended to the label as its glyph; an empty/unset value shows the
 * plain label with no hotkey.
 * @param label - The row's base text, e.g. `'Toggle BrainDump'`.
 * @param accelerator - The live binding: a chord, a `lone-modifier:*` string, or `''`/undefined when unset.
 * @returns
 * - `{ label, accelerator }` for a chord (e.g. `'Alt+Space'`)
 * - `{ label: 'Toggle BrainDump  Right ⌥' }` for a lone-modifier binding (no `accelerator` field)
 * - `{ label }` when the binding is empty or undefined
 * @example
 * trayShortcutMenuFields('Toggle BrainDump', 'Alt+Space')               // { label: 'Toggle BrainDump', accelerator: 'Alt+Space' }
 * trayShortcutMenuFields('Toggle BrainDump', 'lone-modifier:rightOption') // { label: 'Toggle BrainDump  Right ⌥' }
 * trayShortcutMenuFields('Toggle BrainDump', '')                        // { label: 'Toggle BrainDump' }
 */
export function trayShortcutMenuFields(
  label: string,
  accelerator: string | undefined,
): TrayShortcutMenuFields {
  if (!accelerator) return { label }

  if (isNativeBinding(accelerator)) {
    // A corrupt native value (e.g. 'lone-modifier:bogus') has no glyph —
    // formatNativeBindingForDisplay would echo the raw sentinel, so show the
    // plain label instead of leaking the internal format into the tray.
    if (parseNativeBinding(accelerator) === null) return { label }
    const glyph = formatNativeBindingForDisplay(accelerator)
    return { label: `${label}${LABEL_GLYPH_SEPARATOR}${glyph}` }
  }

  return { label, accelerator }
}

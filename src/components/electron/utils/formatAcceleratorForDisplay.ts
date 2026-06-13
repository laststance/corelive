import {
  ACCELERATOR_MODIFIER_TOKENS,
  ASCII_MODIFIER_LABELS,
  MAC_KEY_GLYPHS,
  MAC_MODIFIER_DISPLAY_ORDER,
  MAC_MODIFIER_GLYPHS,
} from '@/lib/constants/keybinding'

/**
 * Render an Electron accelerator as readable keys — macOS glyphs in Apple HIG
 * order (⌃⌥⇧⌘, Command nearest the key, joined tight) or ASCII (`Ctrl+…`) — for
 * the keybinding settings UI and any tray-hotkey mirroring.
 *
 * @param accelerator - An Electron accelerator string, e.g. `'CommandOrControl+Shift+N'`. An empty string means "unbound".
 * @param platform - `'darwin'` renders mac glyphs joined with no separator; anything else renders ASCII labels joined with `'+'`.
 * @returns
 * - The display string, e.g. `'⇧⌘N'` (darwin) or `'Ctrl+Shift+N'` (other)
 * - `''` when `accelerator` is empty (the unbound state)
 * @example
 * formatAcceleratorForDisplay('CommandOrControl+3', 'darwin')       // '⌘3'
 * formatAcceleratorForDisplay('Alt+Space', 'darwin')               // '⌥Space'
 * formatAcceleratorForDisplay('CommandOrControl+Shift+N', 'darwin') // '⇧⌘N'
 * formatAcceleratorForDisplay('CommandOrControl+3', 'other')        // 'Ctrl+3'
 */
export function formatAcceleratorForDisplay(
  accelerator: string,
  platform: 'darwin' | 'other',
): string {
  if (!accelerator) return ''

  const segments = accelerator.split('+')
  const modifiers = segments.filter((segment) =>
    ACCELERATOR_MODIFIER_TOKENS.has(segment),
  )
  const keys = segments.filter(
    (segment) =>
      segment.length > 0 && !ACCELERATOR_MODIFIER_TOKENS.has(segment),
  )

  // macOS: glyphs in HIG order, no separator (⇧⌘N).
  if (platform === 'darwin') {
    const orderedModifierGlyphs = modifiers
      .slice()
      .sort(
        (left, right) =>
          (MAC_MODIFIER_DISPLAY_ORDER[left] ?? Number.MAX_SAFE_INTEGER) -
          (MAC_MODIFIER_DISPLAY_ORDER[right] ?? Number.MAX_SAFE_INTEGER),
      )
      .map((modifier) => MAC_MODIFIER_GLYPHS[modifier] ?? modifier)
    const keyGlyphs = keys.map((key) => MAC_KEY_GLYPHS[key] ?? key)
    return [...orderedModifierGlyphs, ...keyGlyphs].join('')
  }

  // Other platforms: ASCII labels joined with '+'.
  const modifierLabels = modifiers.map(
    (modifier) => ASCII_MODIFIER_LABELS[modifier] ?? modifier,
  )
  return [...modifierLabels, ...keys].join('+')
}

import { describe, expect, it } from 'vitest'

import { trayShortcutMenuFields } from '../utils/trayShortcutMenuFields'

describe('trayShortcutMenuFields', () => {
  it('right-aligns a chord through Electron’s accelerator field', () => {
    // Arrange + Act
    const fields = trayShortcutMenuFields('Toggle BrainDump', 'Alt+Space')

    // Assert
    expect(fields).toEqual({
      label: 'Toggle BrainDump',
      accelerator: 'Alt+Space',
    })
  })

  it('appends a lone-modifier binding to the label as a glyph instead of the accelerator field', () => {
    // Arrange + Act: Electron’s MenuItem.accelerator can’t parse 'lone-modifier:*',
    // so it must render in the label, with no accelerator field that would fail to parse.
    const fields = trayShortcutMenuFields(
      'Toggle BrainDump',
      'lone-modifier:rightOption',
    )

    // Assert
    expect(fields).toEqual({ label: 'Toggle BrainDump  Right ⌥' })
    expect(fields.accelerator).toBeUndefined()
  })

  it('shows the plain label for a corrupt lone-modifier value instead of leaking the sentinel', () => {
    // Arrange + Act: a malformed native value (unknown id) has no glyph — it must
    // not surface the raw 'lone-modifier:*' sentinel in the tray label.
    const fields = trayShortcutMenuFields(
      'Toggle BrainDump',
      'lone-modifier:bogus',
    )

    // Assert
    expect(fields).toEqual({ label: 'Toggle BrainDump' })
    expect(fields.accelerator).toBeUndefined()
  })

  it('shows the plain label with no hotkey when the binding is unset', () => {
    // Arrange + Act
    const fields = trayShortcutMenuFields('Toggle BrainDump', '')

    // Assert
    expect(fields).toEqual({ label: 'Toggle BrainDump' })
  })

  it('shows the plain label with no hotkey when the binding is undefined', () => {
    // Arrange + Act: an absent provider value must not crash or print 'undefined'.
    const fields = trayShortcutMenuFields('Toggle BrainDump', undefined)

    // Assert
    expect(fields).toEqual({ label: 'Toggle BrainDump' })
  })
})

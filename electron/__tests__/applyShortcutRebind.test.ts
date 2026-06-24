import { describe, expect, it, vi } from 'vitest'

import {
  applyShortcutRebind,
  type ShortcutRebinder,
} from '../utils/applyShortcutRebind'

/**
 * Builds a ShortcutManager stand-in whose `updateShortcuts` result and
 * `getRegisteredShortcuts` map are scripted per test, so we can drive the exact
 * "bound cleanly / failed / silently substituted" branches without a real
 * globalShortcut registry.
 *
 * @param options.updateResult - What every `updateShortcuts` call returns.
 * @param options.effective - The id → actually-bound-accelerator map read back.
 */
function createRebinder(options: {
  updateResult: boolean
  effective: Record<string, string>
}): ShortcutRebinder & {
  updateShortcuts: ReturnType<typeof vi.fn>
  getRegisteredShortcuts: ReturnType<typeof vi.fn>
} {
  return {
    updateShortcuts: vi.fn().mockReturnValue(options.updateResult),
    getRegisteredShortcuts: vi.fn().mockReturnValue(options.effective),
  }
}

describe('applyShortcutRebind', () => {
  it('keeps the requested accelerator when it binds exactly as asked', () => {
    // Arrange — the requested chord registers and is what comes back.
    const rebinder = createRebinder({
      updateResult: true,
      effective: { toggleFloatingNavigator: 'CommandOrControl+3' },
    })

    // Act
    const didApply = applyShortcutRebind(
      rebinder,
      'toggleFloatingNavigator',
      'CommandOrControl+3',
      'CommandOrControl+Shift+3',
    )

    // Assert — success, and we never rolled back to the previous binding.
    expect(didApply).toBe(true)
    expect(rebinder.updateShortcuts).toHaveBeenCalledTimes(1)
    expect(rebinder.updateShortcuts).toHaveBeenCalledWith({
      toggleFloatingNavigator: 'CommandOrControl+3',
    })
  })

  it('restores the previous binding when nothing could register', () => {
    // Arrange — the new accelerator fails to bind, but restoring the previous
    // (just-live) accelerator succeeds, as it does in a single-threaded main.
    const rebinder = {
      updateShortcuts: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
      getRegisteredShortcuts: vi.fn().mockReturnValue({}),
    }

    // Act
    const didApply = applyShortcutRebind(
      rebinder,
      'toggleBrainDump',
      'Alt+Space',
      'Alt+Shift+Space',
    )

    // Assert — reports conflict and re-applies the previous accelerator.
    expect(didApply).toBe(false)
    expect(rebinder.updateShortcuts).toHaveBeenNthCalledWith(2, {
      toggleBrainDump: 'Alt+Shift+Space',
    })
  })

  it('throws when even restoring the previous binding fails', () => {
    // Arrange — both the new accelerator AND the restore fail to bind, so the
    // helper cannot honestly report a clean rollback and must surface it.
    const rebinder = {
      updateShortcuts: vi.fn().mockReturnValue(false),
      getRegisteredShortcuts: vi.fn().mockReturnValue({}),
    }

    // Act + Assert — the restore failure is surfaced for the caller to log.
    expect(() =>
      applyShortcutRebind(
        rebinder,
        'toggleBrainDump',
        'Alt+Space',
        'Alt+Shift+Space',
      ),
    ).toThrow('Failed to restore previous shortcut for toggleBrainDump')
  })

  it('rejects a silently substituted fallback and restores the previous binding', () => {
    // Arrange — updateShortcuts returns true, but ShortcutManager swapped in a
    // DIFFERENT accelerator because the requested one was already taken.
    const rebinder = createRebinder({
      updateResult: true,
      effective: { toggleBrainDump: 'Alt+CommandOrControl+Space' },
    })

    // Act — the user asked for Alt+Space.
    const didApply = applyShortcutRebind(
      rebinder,
      'toggleBrainDump',
      'Alt+Space',
      'Alt+Shift+Space',
    )

    // Assert — treated as a conflict; the previous binding is restored so the UI
    // never shows the substituted key the user never chose.
    expect(didApply).toBe(false)
    expect(rebinder.updateShortcuts).toHaveBeenNthCalledWith(2, {
      toggleBrainDump: 'Alt+Shift+Space',
    })
  })

  it('disables the shortcut on empty string without reading the registration back', () => {
    // Arrange — '' means "unbind"; nothing is expected to be registered after.
    const rebinder = createRebinder({ updateResult: true, effective: {} })

    // Act
    const didApply = applyShortcutRebind(
      rebinder,
      'toggleFloatingNavigator',
      '',
      'CommandOrControl+3',
    )

    // Assert — success with no read-back (an empty registration is not a conflict).
    expect(didApply).toBe(true)
    expect(rebinder.getRegisteredShortcuts).not.toHaveBeenCalled()
    expect(rebinder.updateShortcuts).toHaveBeenCalledTimes(1)
  })
})

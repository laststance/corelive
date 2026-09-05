import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  globalShortcut: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}))

import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

/**
 * Creates a minimal WindowManager stand-in for default-shortcut tests.
 * @returns WindowManager-compatible stub with no focused windows.
 * @example
 * const manager = new ShortcutManager(createWindowManagerStub(), null)
 */
function createWindowManagerStub(): WindowManager {
  return {
    toggleLiveEditor: vi.fn(() => true),
    getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
  } as unknown as WindowManager
}

describe('ShortcutManager default shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ships Option+Space for the LiveEditor toggle and no other global toggle', () => {
    // Arrange
    const shortcutManager = new ShortcutManager(createWindowManagerStub(), null)

    // Act
    const defaults = shortcutManager.getDefaultShortcuts()

    // Assert: exactly the four surviving ids with their shipped keys — a retired
    // toggle creeping back in would re-register its key on every launch.
    expect(defaults).toEqual({
      newTask: 'CommandOrControl+N',
      minimize: 'CommandOrControl+M',
      toggleLiveEditor: 'Alt+Space',
      toggleLiveEditorSecondary: '',
    })
  })
})

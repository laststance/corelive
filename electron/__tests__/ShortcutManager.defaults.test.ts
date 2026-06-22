import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
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
    getFloatingNavigator: vi.fn(() => null),
    getMainWindow: vi.fn(() => null),
    toggleBrainDump: vi.fn(() => true),
    toggleFloatingNavigator: vi.fn(),
    setOnFloatingNavigatorCreated: vi.fn(),
  } as unknown as WindowManager
}

describe('ShortcutManager default shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Option+Space for BrainDump and Command+3 for Floating Navigator defaults', () => {
    // Arrange
    const shortcutManager = new ShortcutManager(createWindowManagerStub(), null)

    // Act
    const defaults = shortcutManager.getDefaultShortcuts()

    // Assert
    expect(defaults.toggleBrainDump).toBe('Alt+Space')
    expect(defaults.toggleFloatingNavigator).toBe('CommandOrControl+3')
  })
})

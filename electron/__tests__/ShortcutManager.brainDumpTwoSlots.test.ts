import { globalShortcut } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigManager } from '../ConfigManager'
import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

/**
 * BrainDump can be bound to TWO keys at once (`toggleBrainDump` +
 * `toggleBrainDumpSecondary`, one shared handler). These specs fail if the
 * registration loop ever drops a slot — which would look like "my second key
 * stopped opening BrainDump" with nothing in the logs.
 */

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  globalShortcut: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}))

const globalRegisterMock = vi.mocked(globalShortcut.register)

/**
 * Builds a WindowManager stand-in whose BrainDump toggle is a spy, so a test can
 * prove a registered accelerator actually reaches the BrainDump window.
 * @returns The stub plus its `toggleBrainDump` spy.
 * @example
 * const { windowManager, toggleBrainDump } = createWindowManagerHarness()
 */
function createWindowManagerHarness() {
  const toggleBrainDump = vi.fn(() => true)
  const windowManager = {
    getFloatingNavigator: vi.fn(() => null),
    toggleBrainDump,
    toggleFloatingNavigator: vi.fn(),
    setOnFloatingNavigatorCreated: vi.fn(),
  } as unknown as WindowManager
  return { windowManager, toggleBrainDump }
}

/**
 * Builds a ConfigManager stand-in that serves one persisted `shortcuts` section.
 * @param shortcuts - The persisted `shortcuts.*` values the manager should load.
 * @returns A ConfigManager-compatible stub.
 * @example
 * createConfigManagerStub({ toggleBrainDump: 'Alt+Space' })
 */
function createConfigManagerStub(
  shortcuts: Record<string, string | boolean>,
): ConfigManager {
  return {
    getSection: vi.fn(() => ({ enabled: true, ...shortcuts })),
    get: vi.fn(() => undefined),
    set: vi.fn(),
  } as unknown as ConfigManager
}

describe('BrainDump two-slot toggle shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens BrainDump from either of the two configured toggle keys', () => {
    // Arrange
    const { windowManager, toggleBrainDump } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        toggleBrainDump: 'Alt+Space',
        toggleBrainDumpSecondary: 'Control+Shift+B',
      }),
    )

    // Act
    shortcutManager.registerGlobalShortcuts()

    // Assert — both accelerators are live…
    expect(globalRegisterMock).toHaveBeenCalledWith(
      'Alt+Space',
      expect.any(Function),
    )
    expect(globalRegisterMock).toHaveBeenCalledWith(
      'Control+Shift+B',
      expect.any(Function),
    )

    // …and both fire the same BrainDump toggle.
    for (const accelerator of ['Alt+Space', 'Control+Shift+B']) {
      const call = globalRegisterMock.mock.calls.find(
        ([registered]) => registered === accelerator,
      )
      call?.[1]()
    }
    expect(toggleBrainDump).toHaveBeenCalledTimes(2)
  })

  it('refuses a settings save that would point both toggle keys at one key', () => {
    // Arrange: the generic Shortcut Settings screen submits every registered id,
    // including the second slot (which has no row there), so a user rebinding the
    // visible "Toggle BrainDump" row onto the second slot's key arrives as a
    // duplicate batch. Accepting it would orphan one of the two bindings.
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        toggleBrainDump: 'Alt+Space',
        toggleBrainDumpSecondary: 'Control+Shift+B',
      }),
    )
    shortcutManager.registerGlobalShortcuts()
    globalRegisterMock.mockClear()

    // Act
    const didUpdate = shortcutManager.updateShortcuts({
      toggleBrainDump: 'Control+Shift+B',
      toggleBrainDumpSecondary: 'Control+Shift+B',
    })

    // Assert: rejected outright, and nothing was re-registered along the way.
    expect(didUpdate).toBe(false)
    expect(globalRegisterMock).not.toHaveBeenCalled()
    expect(shortcutManager.getRegisteredShortcuts().toggleBrainDump).toBe(
      'Alt+Space',
    )
  })

  it('still lets the two toggle keys swap accelerators in one save', () => {
    // Arrange: a swap ends with two DIFFERENT keys, so the duplicate guard must
    // not reject it just because each new value collides with the current other.
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        toggleBrainDump: 'Alt+Space',
        toggleBrainDumpSecondary: 'Control+Shift+B',
      }),
    )
    shortcutManager.registerGlobalShortcuts()

    // Act
    const didUpdate = shortcutManager.updateShortcuts({
      toggleBrainDump: 'Control+Shift+B',
      toggleBrainDumpSecondary: 'Alt+Space',
    })

    // Assert
    expect(didUpdate).toBe(true)
    expect(shortcutManager.getRegisteredShortcuts().toggleBrainDump).toBe(
      'Control+Shift+B',
    )
    expect(
      shortcutManager.getRegisteredShortcuts().toggleBrainDumpSecondary,
    ).toBe('Alt+Space')
  })

  it('leaves the second toggle key unbound until the user sets one', () => {
    // Arrange
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({ toggleBrainDump: 'Alt+Space' }),
    )

    // Act
    shortcutManager.registerGlobalShortcuts()

    // Assert — the empty second slot must never reach globalShortcut as ''
    expect(shortcutManager.getDefaultShortcuts().toggleBrainDumpSecondary).toBe(
      '',
    )
    expect(globalRegisterMock).not.toHaveBeenCalledWith('', expect.anything())
    expect(shortcutManager.getRegisteredShortcuts()).not.toHaveProperty(
      'toggleBrainDumpSecondary',
    )
  })
})

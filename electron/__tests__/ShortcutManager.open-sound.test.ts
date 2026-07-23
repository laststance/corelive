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

import type { ConfigManager } from '../ConfigManager'
import type { ShortcutOpenSoundSelection } from '../constants'
import ShortcutManager from '../ShortcutManager'
import type { ShortcutOpenSoundController } from '../ShortcutOpenSoundPlayer'
import type { WindowManager } from '../WindowManager'

/**
 * Creates the config seam ShortcutManager reads for accelerators and sound opt-out.
 * @param isSoundEnabled - Saved user choice for the shortcut opening cue.
 * @param soundSelection - Saved shuffled or fixed cue selection.
 * @returns A ConfigManager-compatible read-only test seam.
 * @example
 * createConfigManager(true, 'balanced-deep-thock')
 */
function createConfigManager(
  isSoundEnabled: unknown,
  soundSelection: ShortcutOpenSoundSelection = 'shuffle',
): ConfigManager {
  return {
    get: vi.fn((configPath: string, defaultValue?: unknown) => {
      if (configPath === 'behavior.shortcutOpenSoundEnabled') {
        return isSoundEnabled
      }
      if (configPath === 'behavior.shortcutOpenSoundSelection') {
        return soundSelection
      }
      return defaultValue
    }),
    getSection: vi.fn(() => ({ enabled: true })),
  } as unknown as ConfigManager
}

/**
 * Creates window toggles whose return/callback behavior is controlled per test.
 * @param toggleFloatingNavigator - Reports whether Floating opened or closed.
 * @param toggleBrainDump - Delivers the actual-shown callback for BrainDump.
 * @returns A WindowManager-compatible shortcut boundary.
 * @example
 * createWindowManager(vi.fn(() => true), vi.fn(() => true))
 */
function createWindowManager(
  toggleFloatingNavigator: () => boolean,
  toggleBrainDump: (onShown?: () => void) => boolean,
): WindowManager {
  return {
    getFloatingNavigator: vi.fn(() => null),
    getMainWindow: vi.fn(() => null),
    setOnFloatingNavigatorCreated: vi.fn(),
    toggleBrainDump,
    toggleFloatingNavigator,
  } as unknown as WindowManager
}

/**
 * Creates an observable shortcut cue controller without touching macOS audio.
 * @returns A controller compatible with ShortcutManager's native sound boundary.
 * @example
 * const soundController = createSoundController()
 */
function createSoundController(): ShortcutOpenSoundController {
  return {
    cleanup: vi.fn(),
    play: vi.fn(),
  }
}

describe('ShortcutManager shortcut opening sound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('plays once when the Floating shortcut opens and stays silent when it closes', () => {
    // Arrange
    const toggleFloatingNavigator = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(
        toggleFloatingNavigator,
        vi.fn(() => false),
      ),
      null,
      createConfigManager(true, 'walnut-desk-thock'),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleFloatingNavigator()
    shortcutManager.handleToggleFloatingNavigator()

    // Assert
    expect(soundController.play).toHaveBeenCalledOnce()
    expect(soundController.play).toHaveBeenCalledWith('walnut-desk-thock')
  })

  it('waits for BrainDump to become visible before playing its opening cue', () => {
    // Arrange
    let onShown: (() => void) | undefined
    const toggleBrainDump = vi.fn((nextOnShown?: () => void) => {
      onShown = nextOnShown
      return true
    })
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(
        vi.fn(() => false),
        toggleBrainDump,
      ),
      null,
      createConfigManager(true),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleBrainDump()

    // Assert
    expect(soundController.play).not.toHaveBeenCalled()

    // Act
    onShown?.()

    // Assert
    expect(soundController.play).toHaveBeenCalledTimes(1)
  })

  it('does not crash after BrainDump becomes visible when opening sound playback fails', () => {
    // Arrange
    let onShown: (() => void) | undefined
    const toggleBrainDump = vi.fn((nextOnShown?: () => void) => {
      onShown = nextOnShown
      return true
    })
    const soundController: ShortcutOpenSoundController = {
      cleanup: vi.fn(),
      play: vi.fn(() => {
        throw new Error('Native sound playback failed')
      }),
    }
    const shortcutManager = new ShortcutManager(
      createWindowManager(
        vi.fn(() => false),
        toggleBrainDump,
      ),
      null,
      createConfigManager(true),
      undefined,
      soundController,
    )
    shortcutManager.handleToggleBrainDump()

    // Act / Assert
    expect(() => onShown?.()).not.toThrow()
    expect(soundController.play).toHaveBeenCalledTimes(1)
  })

  it('opens both shortcut windows silently after the user turns the cue off', () => {
    // Arrange
    const toggleBrainDump = vi.fn((onShown?: () => void) => {
      onShown?.()
      return true
    })
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(
        vi.fn(() => true),
        toggleBrainDump,
      ),
      null,
      createConfigManager(false),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleFloatingNavigator()
    shortcutManager.handleToggleBrainDump()

    // Assert
    expect(soundController.play).not.toHaveBeenCalled()
  })

  it('keeps shortcut windows silent when the enabled setting is malformed', () => {
    // Arrange
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(
        vi.fn(() => true),
        vi.fn((onShown?: () => void) => {
          onShown?.()
          return true
        }),
      ),
      null,
      createConfigManager('false'),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleFloatingNavigator()
    shortcutManager.handleToggleBrainDump()

    // Assert
    expect(soundController.play).not.toHaveBeenCalled()
  })
})

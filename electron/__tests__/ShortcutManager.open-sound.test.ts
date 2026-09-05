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

// The browser handoff is an OS side effect; capture the call instead.
vi.mock('../utils/openWebAppInBrowser', () => ({
  openWebAppInBrowser: vi.fn(),
}))

import type { ConfigManager } from '../ConfigManager'
import type { ShortcutOpenSoundSelection } from '../constants'
import ShortcutManager from '../ShortcutManager'
import type { ShortcutOpenSoundController } from '../ShortcutOpenSoundPlayer'
import { openWebAppInBrowser } from '../utils/openWebAppInBrowser'
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

/** Spies for every window action a shortcut may reach. */
interface WindowManagerHarness {
  windowManager: WindowManager
  restoreFromTray: ReturnType<typeof vi.fn>
  showLiveEditor: ReturnType<typeof vi.fn>
}

/**
 * Creates the LiveEditor toggle whose return/callback behavior is controlled per test.
 * @param toggleLiveEditor - Delivers the actual-shown callback for LiveEditor.
 * @returns A WindowManager-compatible shortcut boundary plus its spies.
 * @example
 * createWindowManager(vi.fn(() => true))
 */
function createWindowManager(
  toggleLiveEditor: (onShown?: () => void) => boolean,
): WindowManagerHarness {
  const restoreFromTray = vi.fn()
  const showLiveEditor = vi.fn()
  return {
    restoreFromTray,
    showLiveEditor,
    windowManager: {
      toggleLiveEditor,
      restoreFromTray,
      showLiveEditor,
      getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
    } as unknown as WindowManager,
  }
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

  it('plays after LiveEditor becomes visible and again when the shortcut closes it', () => {
    // Arrange
    let onShown: (() => void) | undefined
    const toggleLiveEditor = vi
      .fn()
      .mockImplementationOnce((nextOnShown?: () => void) => {
        onShown = nextOnShown
        return true
      })
      .mockReturnValueOnce(false)
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(toggleLiveEditor).windowManager,
      null,
      createConfigManager(true),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleLiveEditor()

    // Assert
    expect(soundController.play).not.toHaveBeenCalled()

    // Act
    onShown?.()

    // Assert
    expect(soundController.play).toHaveBeenCalledTimes(1)

    // Act: the next shortcut closes the visible LiveEditor.
    shortcutManager.handleToggleLiveEditor()

    // Assert: a completed close gets the same shortcut feedback.
    expect(soundController.play).toHaveBeenCalledTimes(2)
  })

  it('plays the selected fixed cue instead of a shuffled one', () => {
    // Arrange
    const toggleLiveEditor = vi.fn((onShown?: () => void) => {
      onShown?.()
      return true
    })
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(toggleLiveEditor).windowManager,
      null,
      createConfigManager(true, 'walnut-desk-thock'),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleLiveEditor()

    // Assert
    expect(soundController.play).toHaveBeenCalledOnce()
    expect(soundController.play).toHaveBeenCalledWith('walnut-desk-thock')
  })

  it('plays once when a second LiveEditor toggle cancels its pending reveal', () => {
    // Arrange
    const toggleLiveEditor = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(toggleLiveEditor).windowManager,
      null,
      createConfigManager(true),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleLiveEditor()
    shortcutManager.handleToggleLiveEditor()

    // Assert
    expect(soundController.play).toHaveBeenCalledTimes(1)
  })

  it('does not crash after LiveEditor becomes visible when opening sound playback fails', () => {
    // Arrange
    let onShown: (() => void) | undefined
    const toggleLiveEditor = vi.fn((nextOnShown?: () => void) => {
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
      createWindowManager(toggleLiveEditor).windowManager,
      null,
      createConfigManager(true),
      undefined,
      soundController,
    )
    shortcutManager.handleToggleLiveEditor()

    // Act / Assert
    expect(() => onShown?.()).not.toThrow()
    expect(soundController.play).toHaveBeenCalledTimes(1)
  })

  it('opens LiveEditor silently after the user turns the cue off', () => {
    // Arrange
    const toggleLiveEditor = vi.fn((onShown?: () => void) => {
      onShown?.()
      return true
    })
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(toggleLiveEditor).windowManager,
      null,
      createConfigManager(false),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleLiveEditor()

    // Assert
    expect(soundController.play).not.toHaveBeenCalled()
  })

  it('keeps LiveEditor silent when the enabled setting is malformed', () => {
    // Arrange
    const soundController = createSoundController()
    const shortcutManager = new ShortcutManager(
      createWindowManager(
        vi.fn((onShown?: () => void) => {
          onShown?.()
          return true
        }),
      ).windowManager,
      null,
      createConfigManager('false'),
      undefined,
      soundController,
    )

    // Act
    shortcutManager.handleToggleLiveEditor()

    // Assert
    expect(soundController.play).not.toHaveBeenCalled()
  })
})

describe('ShortcutManager new-task shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens /live-editor in the browser without surfacing any Electron window (regression)', () => {
    // Arrange: Cmd+N used to call restoreFromTray, which now shows LiveEditor —
    // that would open the panel AND the browser tab at once.
    const harness = createWindowManager(vi.fn(() => true))
    const shortcutManager = new ShortcutManager(
      harness.windowManager,
      null,
      createConfigManager(true),
    )

    // Act
    shortcutManager.handleNewTaskShortcut()

    // Assert
    expect(openWebAppInBrowser).toHaveBeenCalledWith(
      'https://corelive.app',
      '/live-editor',
    )
    expect(harness.restoreFromTray).not.toHaveBeenCalled()
    expect(harness.showLiveEditor).not.toHaveBeenCalled()
  })
})

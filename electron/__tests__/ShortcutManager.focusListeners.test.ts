import { EventEmitter } from 'node:events'

import { globalShortcut } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

/**
 * Regression coverage for the T18 main-window-retirement focus-listener bug:
 * contextual shortcuts hang off the Floating navigator's focus/blur, but the
 * old setup used a sticky boolean that, once set while Floating was absent (or
 * for a since-closed window), blocked rebinding to a Floating window created
 * later — leaving its contextual shortcuts permanently dead.
 *
 * `vi.mock` is hoisted above these imports by Vitest, so `globalShortcut`
 * resolves to the mock below even though it is imported at the top.
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

/** The mocked globalShortcut.register — asserted to prove a contextual bind fired. */
const registerMock = vi.mocked(globalShortcut.register)

/** Default 'newTask' contextual accelerator — the observable proof a focus bound. */
const NEW_TASK_ACCELERATOR = 'CommandOrControl+N'

/**
 * Minimal BrowserWindow stand-in: an EventEmitter exposing the id / focus /
 * destroyed surface that ShortcutManager.setupFocusListeners reads.
 */
class FakeFloatingWindow extends EventEmitter {
  focused = false
  destroyed = false
  constructor(public readonly id: number) {
    super()
  }
  isFocused(): boolean {
    return this.focused
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
}

/**
 * WindowManager stand-in modeling Floating (re)creation: `createFloating` fires
 * the chokepoint callback exactly as WindowManager.createFloatingNavigator does,
 * and `closeFloating` reproduces the real blur→closed sequence on window close.
 * @returns harness with the WindowManager stub plus create/close drivers.
 */
function createWindowManagerHarness() {
  let floatingWindow: FakeFloatingWindow | null = null
  let onFloatingCreated: (() => void) | null = null
  let nextWindowId = 1

  const windowManager = {
    getFloatingNavigator: vi.fn(() => floatingWindow),
    getMainWindow: vi.fn(() => null),
    toggleBrainDump: vi.fn(() => true),
    toggleFloatingNavigator: vi.fn(),
    setOnFloatingNavigatorCreated: vi.fn((handler: () => void) => {
      onFloatingCreated = handler
    }),
  } as unknown as WindowManager

  return {
    windowManager,
    createFloating(): FakeFloatingWindow {
      floatingWindow = new FakeFloatingWindow(nextWindowId++)
      onFloatingCreated?.()
      return floatingWindow
    },
    closeFloating(): void {
      const closing = floatingWindow
      floatingWindow = null
      if (closing) {
        closing.focused = false
        closing.emit('blur')
        closing.destroyed = true
        closing.emit('closed')
      }
    },
  }
}

describe('ShortcutManager contextual shortcuts on a later-created Floating window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers contextual shortcuts when Floating opens after a no-Floating startup (BrainDump-only)', () => {
    // Arrange: startup with no Floating window (showFloating:false); the initial
    // focus-listener setup runs with Floating absent — the old sticky flag locked here.
    const harness = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(harness.windowManager, null)
    shortcutManager.setupFocusListeners()

    // Act: user opens Floating later via Cmd+3 (fires the WindowManager hook), then focuses it.
    const floating = harness.createFloating()
    floating.focused = true
    floating.emit('focus')

    // Assert: focusing the new Floating registered the contextual 'newTask' shortcut.
    expect(registerMock).toHaveBeenCalledWith(
      NEW_TASK_ACCELERATOR,
      expect.any(Function),
    )
  })

  it('rebinds focus listeners to a replacement Floating window after the previous one closed', () => {
    // Arrange: Floating exists at startup, is bound, then the user closes it.
    const harness = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(harness.windowManager, null)
    const firstFloating = harness.createFloating()
    shortcutManager.setupFocusListeners()
    harness.closeFloating()

    // Act: user reopens Floating — a new BrowserWindow with a different id.
    const secondFloating = harness.createFloating()

    // Assert: the replacement window got fresh focus/blur listeners (rebind happened).
    expect(secondFloating.id).not.toBe(firstFloating.id)
    expect(secondFloating.listenerCount('focus')).toBe(1)
    expect(secondFloating.listenerCount('blur')).toBe(1)
  })

  it('does not double-bind focus handlers when setup runs twice for the same Floating window', () => {
    // Arrange: one Floating window, bound once.
    const harness = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(harness.windowManager, null)
    const floating = harness.createFloating()
    shortcutManager.setupFocusListeners()

    // Act: setup runs again for the SAME window (e.g. enable() after initialize()).
    shortcutManager.setupFocusListeners()

    // Assert: exactly one focus/blur listener stays attached (no duplicate handlers).
    expect(floating.listenerCount('focus')).toBe(1)
    expect(floating.listenerCount('blur')).toBe(1)
  })
})

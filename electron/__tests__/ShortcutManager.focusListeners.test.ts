import { app, BrowserWindow, globalShortcut } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

/**
 * Contextual shortcuts (Cmd+N / Cmd+M) follow app-level focus: they are
 * registered while ANY CoreLive window is focused and released when none is.
 * `browser-window-focus` / `browser-window-blur` are app events whose order is
 * not guaranteed on a window-to-window switch, so both handlers resolve the
 * truth from `BrowserWindow.getFocusedWindow()` instead of trusting the event.
 *
 * `vi.mock` is hoisted above these imports by Vitest, so `app`, `BrowserWindow`
 * and `globalShortcut` resolve to the mocks below.
 */

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
  globalShortcut: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}))

const registerMock = vi.mocked(globalShortcut.register)
const unregisterMock = vi.mocked(globalShortcut.unregister)
const getFocusedWindowMock = vi.mocked(BrowserWindow.getFocusedWindow)
const appOnMock = vi.mocked(app.on)

/** Default contextual accelerators — the observable proof a focus bound. */
const NEW_TASK_ACCELERATOR = 'CommandOrControl+N'
const MINIMIZE_ACCELERATOR = 'CommandOrControl+M'

/** A stand-in for whatever CoreLive window currently has focus. */
const FOCUSED_WINDOW = {} as unknown as BrowserWindow

/**
 * Finds the app-level listener ShortcutManager registered for an event.
 * @param eventName - `browser-window-focus` or `browser-window-blur`.
 * @returns The registered handler.
 * @example
 * getAppListener('browser-window-focus')()
 */
function getAppListener(eventName: string): () => void {
  const registration = appOnMock.mock.calls.find(
    ([registeredEvent]) => registeredEvent === eventName,
  )
  if (!registration) {
    throw new Error(`Expected an app listener for ${eventName}`)
  }
  return registration[1] as () => void
}

/** WindowManager stand-in: contextual shortcuts no longer read any window from it. */
function createWindowManager(): WindowManager {
  return {
    toggleLiveEditor: vi.fn(() => true),
    getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
  } as unknown as WindowManager
}

describe('ShortcutManager contextual shortcuts follow app-level window focus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFocusedWindowMock.mockReturnValue(null)
  })

  it('registers the app focus/blur listeners once even when setup runs twice', () => {
    // Arrange
    const shortcutManager = new ShortcutManager(createWindowManager(), null)

    // Act: initialize() and enable() both call setup.
    shortcutManager.setupFocusListeners()
    shortcutManager.setupFocusListeners()

    // Assert: exactly one listener per app event.
    const focusRegistrations = appOnMock.mock.calls.filter(
      ([eventName]) => eventName === 'browser-window-focus',
    )
    const blurRegistrations = appOnMock.mock.calls.filter(
      ([eventName]) => eventName === 'browser-window-blur',
    )
    expect(focusRegistrations).toHaveLength(1)
    expect(blurRegistrations).toHaveLength(1)
  })

  it('binds Cmd+N when a CoreLive window gains focus and releases it when focus leaves the app', () => {
    // Arrange
    const shortcutManager = new ShortcutManager(createWindowManager(), null)
    shortcutManager.setupFocusListeners()

    // Act: LiveEditor (or Settings, or the login window) gains focus.
    getFocusedWindowMock.mockReturnValue(FOCUSED_WINDOW)
    getAppListener('browser-window-focus')()

    // Assert
    expect(registerMock).toHaveBeenCalledWith(
      NEW_TASK_ACCELERATOR,
      expect.any(Function),
    )

    // Act: the user switches to another app — no CoreLive window is focused.
    getFocusedWindowMock.mockReturnValue(null)
    getAppListener('browser-window-blur')()

    // Assert: Cmd+N is no longer hijacked system-wide.
    expect(unregisterMock).toHaveBeenCalledWith(NEW_TASK_ACCELERATOR)
    expect(shortcutManager.getRegisteredShortcuts()).not.toHaveProperty(
      'newTask',
    )
  })

  it('stays registered across a LiveEditor → Settings switch whether focus fires before or after blur', () => {
    // Arrange: LiveEditor is focused and bound.
    const shortcutManager = new ShortcutManager(createWindowManager(), null)
    shortcutManager.setupFocusListeners()
    getFocusedWindowMock.mockReturnValue(FOCUSED_WINDOW)
    getAppListener('browser-window-focus')()

    // Act: order 1 — Settings' focus arrives before LiveEditor's blur; by the
    // time blur runs, Settings already holds focus.
    getAppListener('browser-window-focus')()
    getAppListener('browser-window-blur')()

    // Assert
    expect(shortcutManager.getRegisteredShortcuts()).toHaveProperty(
      'newTask',
      NEW_TASK_ACCELERATOR,
    )

    // Act: order 2 — blur first (nothing focused for a moment), then focus.
    getFocusedWindowMock.mockReturnValue(null)
    getAppListener('browser-window-blur')()
    getFocusedWindowMock.mockReturnValue(FOCUSED_WINDOW)
    getAppListener('browser-window-focus')()

    // Assert: the final state is registered either way.
    expect(shortcutManager.getRegisteredShortcuts()).toHaveProperty(
      'newTask',
      NEW_TASK_ACCELERATOR,
    )
  })

  it('binds contextual shortcuts immediately on enable() when a window is already focused', () => {
    // Arrange: a window is focused before shortcuts are enabled.
    const shortcutManager = new ShortcutManager(createWindowManager(), null)
    getFocusedWindowMock.mockReturnValue(FOCUSED_WINDOW)

    // Act
    shortcutManager.enable()

    // Assert
    expect(registerMock).toHaveBeenCalledWith(
      MINIMIZE_ACCELERATOR,
      expect.any(Function),
    )
  })

  it('re-binds Cmd+M after disable() → enable() while a window stays focused, and ignores focus while disabled', () => {
    // Arrange: focused and bound.
    const shortcutManager = new ShortcutManager(createWindowManager(), null)
    shortcutManager.setupFocusListeners()
    getFocusedWindowMock.mockReturnValue(FOCUSED_WINDOW)
    getAppListener('browser-window-focus')()
    expect(shortcutManager.getRegisteredShortcuts()).toHaveProperty('minimize')

    // Act: the user turns shortcuts off, then a focus event arrives.
    shortcutManager.disable()
    registerMock.mockClear()
    getAppListener('browser-window-focus')()

    // Assert: nothing is bound while disabled.
    expect(registerMock).not.toHaveBeenCalled()
    expect(shortcutManager.getRegisteredShortcuts()).not.toHaveProperty(
      'minimize',
    )

    // Act: shortcuts are turned back on without any focus change.
    shortcutManager.enable()

    // Assert: Cmd+M is live again — registration truth is the map, not a flag.
    expect(shortcutManager.getRegisteredShortcuts()).toHaveProperty(
      'minimize',
      MINIMIZE_ACCELERATOR,
    )
  })

  it('removes both app listeners on cleanup', () => {
    // Arrange
    const shortcutManager = new ShortcutManager(createWindowManager(), null)
    shortcutManager.setupFocusListeners()
    const focusListener = getAppListener('browser-window-focus')
    const blurListener = getAppListener('browser-window-blur')

    // Act
    shortcutManager.cleanup()

    // Assert: the exact handlers that were added are removed.
    expect(app.removeListener).toHaveBeenCalledWith(
      'browser-window-focus',
      focusListener,
    )
    expect(app.removeListener).toHaveBeenCalledWith(
      'browser-window-blur',
      blurListener,
    )
  })

  it('minimizes whichever CoreLive window is focused on Cmd+M', () => {
    // Arrange
    const minimize = vi.fn()
    const focusedWindow = { minimize } as unknown as BrowserWindow
    const shortcutManager = new ShortcutManager(createWindowManager(), null)
    getFocusedWindowMock.mockReturnValue(focusedWindow)

    // Act
    shortcutManager.handleMinimizeWindow()

    // Assert
    expect(minimize).toHaveBeenCalledTimes(1)
  })
})

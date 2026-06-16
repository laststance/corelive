/**
 * @fileoverview Settings popover resize + persist + reset-to-default tests.
 *
 * Locks the contract that the Settings popover:
 * - Opens with `resizable: true` and enforced min/max constraints.
 * - Reads persisted width/height from ConfigManager (clamped on bad values).
 * - Debounces resize events and calls `configManager.update` after 200 ms.
 * - Does NOT persist before the debounce fires or after window close.
 * - Skips the blur→hide when the user is dragging a resize edge (`will-resize`).
 * - Clears the debounce timer and resets the resizing flag on `closed`.
 * - `resetSettingsPopoverSize()` writes defaults to config and calls `setBounds`.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowManager.settings-resize
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Spy = ReturnType<typeof vi.fn>

/** BrowserWindow surface touched by createSettingsWindow / resetSettingsPopoverSize. */
interface MockBrowserWindow {
  isDestroyed: Spy
  setVisibleOnAllWorkspaces: Spy
  loadURL: Spy
  show: Spy
  focus: Spy
  on: Spy
  once: Spy
  getSize: Spy
  setBounds: Spy
  hide: Spy
  webContents: { on: Spy }
}

/** Captured window plus its constructor options. */
interface CapturedWindow {
  win: MockBrowserWindow
  options: Record<string, unknown>
  /** Map of event-name → all registered handlers, filled by `on()`. */
  handlers: Record<string, ((...args: unknown[]) => void)[]>
}

const capturedWindows: CapturedWindow[] = []

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (options: Record<string, unknown>) {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}

    const win: MockBrowserWindow = {
      isDestroyed: vi.fn(() => false),
      setVisibleOnAllWorkspaces: vi.fn(),
      loadURL: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      getSize: vi.fn(() => [360, 380]),
      setBounds: vi.fn(),
      once: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(handler)
      }),
      webContents: { on: vi.fn() },
    }
    capturedWindows.push({ win, options, handlers })
    return win
  }),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import type { ConfigManager } from '../ConfigManager'
import { WindowManager } from '../WindowManager'

const SERVER_URL = 'https://corelive.app'

/**
 * Builds a ConfigManager stub with observable `get` and `update` spies.
 *
 * @param values - Initial dot-path values returned by `get`.
 * @returns The stub plus observable spies.
 */
function createConfigStub(values: Record<string, unknown> = {}): {
  configManager: ConfigManager
  get: Spy
  update: Spy
} {
  const store: Record<string, unknown> = { ...values }
  const get = vi.fn((key: string, fallback?: unknown) =>
    key in store ? store[key] : fallback,
  )
  const update = vi.fn((updates: Record<string, unknown>) => {
    Object.assign(store, updates)
    return true
  })
  const configManager = {
    get,
    update,
    getSection: vi.fn(() => ({})),
  } as unknown as ConfigManager
  return { configManager, get, update }
}

/** Fire a captured event on the given window by name. */
function fireEvent(
  captured: CapturedWindow,
  eventName: string,
  ...args: unknown[]
): void {
  const handlerList = captured.handlers[eventName] ?? []
  for (const handler of handlerList) {
    handler(...args)
  }
}

beforeEach(() => {
  capturedWindows.length = 0
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('createSettingsWindow — resize options', () => {
  it('opens with resizable: true so the user can drag the window edge', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.resizable).toBe(true)
  })

  it('applies min/max width/height constraints', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.minWidth).toBe(320)
    expect(captured.options.minHeight).toBe(300)
    expect(captured.options.maxWidth).toBe(800)
    expect(captured.options.maxHeight).toBe(900)
  })

  it('reads persisted width and height from configManager', () => {
    // Arrange
    const { configManager, get } = createConfigStub({
      'settingsPopover.width': 500,
      'settingsPopover.height': 600,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert — opens at the persisted size
    expect(captured.options.width).toBe(500)
    expect(captured.options.height).toBe(600)
    // ConfigManager.get was called for both dimensions
    expect(get).toHaveBeenCalledWith('settingsPopover.width', 360)
    expect(get).toHaveBeenCalledWith('settingsPopover.height', 380)
  })

  it('uses default size (360×380) when configManager is absent', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.width).toBe(360)
    expect(captured.options.height).toBe(380)
  })

  it('clamps an oversized persisted width to MAX (800)', () => {
    // Arrange
    const { configManager } = createConfigStub({
      'settingsPopover.width': 99999,
      'settingsPopover.height': 380,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.width).toBe(800)
  })

  it('resets NaN persisted width to default (360)', () => {
    // Arrange
    const { configManager } = createConfigStub({
      'settingsPopover.width': NaN,
      'settingsPopover.height': 380,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.width).toBe(360)
  })

  it('resets zero persisted width to default (360)', () => {
    // Arrange
    const { configManager } = createConfigStub({
      'settingsPopover.width': 0,
      'settingsPopover.height': 380,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.width).toBe(360)
  })

  it('clamps an oversized persisted height to MAX (900)', () => {
    // Arrange
    const { configManager } = createConfigStub({
      'settingsPopover.width': 360,
      'settingsPopover.height': 99999,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.height).toBe(900)
  })

  it('resets negative persisted height to default (380)', () => {
    // Arrange
    const { configManager } = createConfigStub({
      'settingsPopover.width': 360,
      'settingsPopover.height': -100,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)

    // Act
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Assert
    expect(captured.options.height).toBe(380)
  })
})

describe('createSettingsWindow — resize persistence (debounce)', () => {
  it('does NOT call configManager.update before the 200 ms debounce fires', () => {
    // Arrange
    const { configManager, update } = createConfigStub()
    const windowManager = new WindowManager(SERVER_URL, configManager)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Act: fire resize event and advance only 100ms (half of debounce)
    fireEvent(captured, 'resize')
    vi.advanceTimersByTime(100)

    // Assert
    expect(update).not.toHaveBeenCalled()
  })

  it('calls configManager.update with the current size after the 200 ms debounce', () => {
    // Arrange
    const { configManager, update } = createConfigStub()
    const windowManager = new WindowManager(SERVER_URL, configManager)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Stub getSize to return a resized value
    captured.win.getSize.mockReturnValue([450, 500])

    // Act
    fireEvent(captured, 'resize')
    vi.advanceTimersByTime(200)

    // Assert — single batched update with both dimensions
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      'settingsPopover.width': 450,
      'settingsPopover.height': 500,
    })
  })

  it('coalesces multiple rapid resize events into one configManager.update call', () => {
    // Arrange
    const { configManager, update } = createConfigStub()
    const windowManager = new WindowManager(SERVER_URL, configManager)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    captured.win.getSize.mockReturnValue([500, 600])

    // Act: fire five resize events with only 50ms between each
    for (let i = 0; i < 5; i++) {
      fireEvent(captured, 'resize')
      vi.advanceTimersByTime(50)
    }
    // Now let the debounce fire
    vi.advanceTimersByTime(200)

    // Assert: only one update despite five events
    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe('createSettingsWindow — blur-during-resize guard', () => {
  it('skips hiding the window when blur fires during a manual resize drag', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Act: simulate the user beginning a resize drag (will-resize fires), then
    // immediately blurring the window (e.g. keyboard focus moves elsewhere).
    fireEvent(captured, 'will-resize')
    fireEvent(captured, 'blur')

    // Assert: the window should NOT hide mid-drag
    expect(captured.win.hide).not.toHaveBeenCalled()
  })

  it('hides the window on blur once the resize debounce has settled', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Act: simulate resize drag, fire the last resize event, wait for debounce
    fireEvent(captured, 'will-resize')
    fireEvent(captured, 'resize')
    vi.advanceTimersByTime(200) // debounce settles → isResizing = false

    // Now blur fires (user clicks away after finishing resize)
    fireEvent(captured, 'blur')

    // Assert: window hides normally once resizing is done
    expect(captured.win.hide).toHaveBeenCalledTimes(1)
  })
})

describe('createSettingsWindow — closed event cleanup', () => {
  it('resets the resize debounce timer and resizing flag when window closes', () => {
    // Arrange
    const { configManager, update } = createConfigStub()
    const windowManager = new WindowManager(SERVER_URL, configManager)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Act: start a resize (will-resize), fire resize, then close before debounce fires
    fireEvent(captured, 'will-resize')
    fireEvent(captured, 'resize')
    // Simulate window close — closed handler clears the timer
    fireEvent(captured, 'closed')
    // Advance past the debounce — timer was cancelled so update should NOT fire
    vi.advanceTimersByTime(300)

    // Assert
    expect(update).not.toHaveBeenCalled()
  })

  it('allows normal blur→hide after reopening the window (isResizing reset on close)', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // First window: start resizing, then close
    windowManager.createSettingsWindow()
    const firstCapture = capturedWindows[0]
    if (!firstCapture) throw new Error('Expected first settings window')
    fireEvent(firstCapture, 'will-resize')
    fireEvent(firstCapture, 'closed')

    // Re-create (reopen after close)
    capturedWindows.length = 0 // reset capture array
    windowManager.createSettingsWindow()
    const secondCapture = capturedWindows[0]
    if (!secondCapture) throw new Error('Expected second settings window')

    // Act: blur on the new window — isResizing should be false after the close reset
    fireEvent(secondCapture, 'blur')

    // Assert: second window hides normally
    expect(secondCapture.win.hide).toHaveBeenCalledTimes(1)
  })
})

describe('resetSettingsPopoverSize', () => {
  it('resets config to default width and height', () => {
    // Arrange
    const { configManager, update } = createConfigStub({
      'settingsPopover.width': 700,
      'settingsPopover.height': 800,
    })
    const windowManager = new WindowManager(SERVER_URL, configManager)
    windowManager.createSettingsWindow()

    // Act
    windowManager.resetSettingsPopoverSize()

    // Assert — config is reset to 360×380
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        'settingsPopover.width': 360,
        'settingsPopover.height': 380,
      }),
    )
  })

  it('calls setBounds with default dimensions to re-anchor to the tray', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Act
    windowManager.resetSettingsPopoverSize()

    // Assert — setBounds called with default 360×380 (x/y may vary by tray position)
    expect(captured.win.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ width: 360, height: 380 }),
    )
  })

  it('is a no-op when the settings window has been destroyed', () => {
    // Arrange
    const { configManager, update } = createConfigStub()
    const windowManager = new WindowManager(SERVER_URL, configManager)
    windowManager.createSettingsWindow()
    const captured = capturedWindows[0]
    if (!captured) throw new Error('Expected a settings window to be created')

    // Make the window appear destroyed
    captured.win.isDestroyed.mockReturnValue(true)

    // Act
    windowManager.resetSettingsPopoverSize()

    // Assert — config still resets but setBounds is NOT called on a dead window
    expect(update).toHaveBeenCalled()
    expect(captured.win.setBounds).not.toHaveBeenCalled()
  })

  it('is a no-op (no throw) when no settings window has been created yet', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // Act + Assert — should not throw
    expect(() => windowManager.resetSettingsPopoverSize()).not.toThrow()
  })
})

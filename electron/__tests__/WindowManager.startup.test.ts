import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Records, per created BrowserWindow, its captured `ready-to-show` handler and
 * its `show` spy. The real `ready-to-show` event never fires under Vitest, so
 * the test fires it manually to exercise `createMainWindow`'s gating logic.
 */
interface CapturedWindow {
  show: ReturnType<typeof vi.fn>
  fireReadyToShow: () => void
}

const createdWindows: CapturedWindow[] = []

// BrowserWindow mock: returns a plain instance (so `new` yields it) and records
// the 'ready-to-show' handler the WindowManager registers via `once`.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    const readyToShowHandlers: Array<() => void> = []
    const show = vi.fn()
    const instance = {
      loadURL: vi.fn(),
      show,
      hide: vi.fn(),
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
      on: vi.fn(),
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'ready-to-show') {
          readyToShowHandlers.push(handler)
        }
      }),
      webContents: { openDevTools: vi.fn(), send: vi.fn(), on: vi.fn() },
    }
    createdWindows.push({
      show,
      fireReadyToShow: () =>
        readyToShowHandlers.forEach((handler) => handler()),
    })
    return instance
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

// Imported after the mocks so WindowManager's `import { BrowserWindow }` is stubbed.
import { WindowManager } from '../WindowManager'

describe('WindowManager main-window startup visibility', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the main window on ready-to-show by default', () => {
    // Arrange: no-arg call mirrors the existing show-main startup behavior.
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.createMainWindow()
    createdWindows[0].fireReadyToShow()

    // Assert
    expect(createdWindows[0].show).toHaveBeenCalledTimes(1)
  })

  it('shows the main window when showOnReady is explicitly true', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.createMainWindow(true)
    createdWindows[0].fireReadyToShow()

    // Assert
    expect(createdWindows[0].show).toHaveBeenCalledTimes(1)
  })

  it('keeps the main window hidden on ready-to-show for a panel-only startup', () => {
    // Arrange: panel-only startup creates main hidden by passing showOnReady=false.
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.createMainWindow(false)
    createdWindows[0].fireReadyToShow()

    // Assert: the window exists but was never auto-shown.
    expect(createdWindows[0].show).not.toHaveBeenCalled()
  })
})

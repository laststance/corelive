import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Records, per created BrowserWindow, the spies the tray-restore path drives so
 * a test can assert the Floating window was surfaced (shown + focused) and which
 * URL it loaded. `restoreFromTray` creates the Floating panel lazily, so the
 * window under test is whatever the mocked `BrowserWindow` ctor produced.
 */
interface CapturedWindow {
  loadURL: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}

const createdWindows: CapturedWindow[] = []

/**
 * Returns the Nth created window, failing the test if none exists. Narrows away
 * the `| undefined` that `noUncheckedIndexedAccess` adds to array indexing, so
 * the assertions read cleanly without non-null assertions.
 *
 * @param index - Zero-based creation order.
 * @returns The captured window at that index.
 */
function getCreatedWindow(index: number): CapturedWindow {
  const capturedWindow = createdWindows[index]
  if (!capturedWindow) {
    throw new Error(`Expected a created window at index ${index}`)
  }
  return capturedWindow
}

// BrowserWindow mock: returns an instance carrying the full method surface the
// Floating-create + tray-restore path touches — loadURL/on/webContents.on for
// creation, isMinimized/restore/show/focus for surfacing, and isDestroyed +
// setVisibleOnAllWorkspaces for the macOS Spaces guard (which runs when the test
// host is darwin). Each instance's surfacing spies are recorded so the test can
// assert the Floating window was actually shown.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    const loadURL = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    const instance = {
      loadURL,
      show,
      focus,
      hide: vi.fn(),
      restore: vi.fn(),
      isMinimized: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      setVisibleOnAllWorkspaces: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      webContents: { on: vi.fn(), send: vi.fn() },
    }
    createdWindows.push({ loadURL, show, focus })
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

describe('WindowManager tray restore surfaces the Floating window', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('opens and focuses the Floating navigator — never a main window — when restoring from the tray with nothing open', () => {
    // Arrange: a tray-resident boot — no window has been created yet.
    const windowManager = new WindowManager('https://corelive.app')

    // Act: the shared "surface the app" chokepoint behind tray "Focus Floating",
    // dock activate, notification click, shortcut, and deep links.
    windowManager.restoreFromTray()

    // Assert: it surfaced the Floating panel — created it, loaded the floating
    // route, then showed and focused it.
    const floatingWindow = getCreatedWindow(0)
    expect(windowManager.getFloatingNavigator()).not.toBeNull()
    expect(floatingWindow.loadURL).toHaveBeenCalledWith(
      'https://corelive.app/floating-navigator',
    )
    expect(floatingWindow.show).toHaveBeenCalledTimes(1)
    expect(floatingWindow.focus).toHaveBeenCalledTimes(1)

    // ...and never resurrected a retired main window. This is the guarantee T18
    // bakes in: every native-chrome "restore the app" path lands on Floating, so
    // exactly one window — the Floating panel — was created. With the main-window
    // accessor removed, the createdWindows length is now the sole proof.
    expect(createdWindows).toHaveLength(1)
  })
})

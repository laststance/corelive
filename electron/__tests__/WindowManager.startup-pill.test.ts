import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The subset of a mocked BrowserWindow the pill tests inspect. `options` is the
 * constructor argument, used to tell the transparent pill apart from the opaque
 * main window without relying on creation order.
 */
interface MockWindow {
  options: Record<string, unknown>
  show: ReturnType<typeof vi.fn>
  showInactive: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
}

const createdWindows: MockWindow[] = []

/**
 * Returns the created startup-pill window (the only transparent one), failing
 * the test if none exists. Narrows away the `| undefined` from `Array.find`.
 *
 * @returns The captured pill window.
 */
function getPill(): MockWindow {
  const pill = createdWindows.find(
    (window) => window.options.transparent === true,
  )
  if (!pill) {
    throw new Error('Expected a startup-pill window to be created')
  }
  return pill
}

/**
 * Returns the created main window (identified by the macOS inset title bar),
 * failing the test if none exists.
 *
 * @returns The captured main window.
 */
function getMainWindow(): MockWindow {
  const main = createdWindows.find(
    (window) => window.options.titleBarStyle === 'hiddenInset',
  )
  if (!main) {
    throw new Error('Expected a main window to be created')
  }
  return main
}

// BrowserWindow mock: returns a rich instance (so `new` yields it) and records
// its constructor options + the spies the pill lifecycle drives.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (options: Record<string, unknown>) {
    let destroyed = false
    const instance: MockWindow & Record<string, unknown> = {
      options,
      show: vi.fn(),
      showInactive: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      restore: vi.fn(),
      minimize: vi.fn(),
      // Floating-panel chrome createFloatingNavigator drives (T6 restoreFromTray
      // now creates Floating if absent, so the pill harness must support it).
      setVisibleOnAllWorkspaces: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      isAlwaysOnTop: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 0, y: 0, width: 320, height: 480 })),
      setBounds: vi.fn(),
      destroy: vi.fn(() => {
        destroyed = true
      }),
      loadURL: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      isMinimized: vi.fn(() => false),
      isDestroyed: vi.fn(() => destroyed),
      on: vi.fn(),
      once: vi.fn(),
      webContents: {
        on: vi.fn(),
        send: vi.fn(),
        removeListener: vi.fn(),
        openDevTools: vi.fn(),
      },
    }
    createdWindows.push(instance)
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
import { STARTUP_PILL_GAP_MS, STARTUP_PILL_TIMEOUT_MS } from '../constants'
import { WindowManager } from '../WindowManager'

describe('WindowManager cold-boot startup pill', () => {
  beforeEach(() => {
    createdWindows.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('stays hidden during the grace period, then appears once it elapses', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.armStartupPill()
    vi.advanceTimersByTime(STARTUP_PILL_GAP_MS - 1)

    // Assert: still suppressed one tick before the grace period ends.
    expect(getPill().showInactive).not.toHaveBeenCalled()

    // Act: cross the grace period.
    vi.advanceTimersByTime(1)

    // Assert: revealed exactly once, without stealing focus.
    expect(getPill().showInactive).toHaveBeenCalledTimes(1)
  })

  it('never appears if a real window paints within the grace period', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act: a window paints (dismiss) before the grace period elapses.
    windowManager.armStartupPill()
    const pill = getPill()
    windowManager.dismissStartupPill()
    vi.advanceTimersByTime(STARTUP_PILL_TIMEOUT_MS)

    // Assert: the pill was torn down and never shown.
    expect(pill.showInactive).not.toHaveBeenCalled()
    expect(pill.destroy).toHaveBeenCalledTimes(1)
  })

  it('loads its reassurance markup from an inline data URL', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.armStartupPill()

    // Assert: a data: URL, not a packaged file path (electron-builder omits it).
    const [loadedUrl] = getPill().loadURL.mock.calls[0] ?? []
    expect(loadedUrl).toMatch(/^data:text\/html;charset=utf-8,/)
  })

  it('is fully passive, ignoring mouse events so it never blocks the desktop', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.armStartupPill()

    // Assert
    expect(getPill().setIgnoreMouseEvents).toHaveBeenCalledWith(true)
  })

  it('dismissing twice destroys the pill window only once', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act
    windowManager.armStartupPill()
    const pill = getPill()
    windowManager.dismissStartupPill()
    windowManager.dismissStartupPill()

    // Assert
    expect(pill.destroy).toHaveBeenCalledTimes(1)
  })

  it('surfaces the main window as a backstop when the boot is still wedged at the timeout', () => {
    // Arrange: panel-only boot creates main hidden, then arms the pill.
    const windowManager = new WindowManager('https://corelive.app')
    windowManager.createMainWindow(false)
    windowManager.armStartupPill()

    // Act: nothing has surfaced by the hard timeout.
    vi.advanceTimersByTime(STARTUP_PILL_TIMEOUT_MS)

    // Assert: main is revealed and the pill is torn down.
    expect(getMainWindow().show).toHaveBeenCalledTimes(1)
    expect(getMainWindow().focus).toHaveBeenCalledTimes(1)
    expect(getPill().destroy).toHaveBeenCalledTimes(1)
  })

  it('arms only one pill even when called twice', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')

    // Act: a double-arm (e.g. a racy startup path) must not stack two pills.
    windowManager.armStartupPill()
    windowManager.armStartupPill()

    // Assert: exactly one transparent pill window was ever created.
    const pills = createdWindows.filter(
      (window) => window.options.transparent === true,
    )
    expect(pills).toHaveLength(1)
  })

  it('recognizes the live armed pill and rejects the main window', () => {
    // Arrange: a panel-only boot creates the hidden main window, then arms the pill.
    const windowManager = new WindowManager('https://corelive.app')
    windowManager.createMainWindow(false)
    windowManager.armStartupPill()

    // Act + Assert: only the transparent pill is identified as the startup pill,
    // so the macOS activate handler treats the opaque main window as real.
    expect(
      windowManager.isStartupPill(getPill() as unknown as BrowserWindow),
    ).toBe(true)
    expect(
      windowManager.isStartupPill(getMainWindow() as unknown as BrowserWindow),
    ).toBe(false)
  })

  it('stops recognizing the pill once it has been dismissed', () => {
    // Arrange
    const windowManager = new WindowManager('https://corelive.app')
    windowManager.armStartupPill()
    const pill = getPill()

    // Act
    windowManager.dismissStartupPill()

    // Assert: the dismissed (destroyed + cleared) pill is no longer the pill, so
    // a later dock click is not fooled into leaving the desktop empty.
    expect(windowManager.isStartupPill(pill as unknown as BrowserWindow)).toBe(
      false,
    )
  })
})

import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoUpdater, normalizeDownloadProgress } from '../AutoUpdater'
import {
  UPDATE_PROGRESS_PERCENT_MAX,
  UPDATE_PROGRESS_PERCENT_MIN,
} from '../constants'

type MockListener = (...args: unknown[]) => void

interface MockWindow {
  options: Record<string, unknown>
  destroy: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  showInactive: ReturnType<typeof vi.fn>
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>
    isDestroyed: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

const electronMocks = vi.hoisted(() => {
  const listeners: Record<string, MockListener[]> = {}
  const createdWindows: MockWindow[] = []

  const mockAutoUpdater = {
    logger: null as unknown,
    on: vi.fn((eventName: string, listener: MockListener) => {
      listeners[eventName] = [...(listeners[eventName] ?? []), listener]
      return mockAutoUpdater
    }),
    emit: vi.fn((eventName: string, ...args: unknown[]) => {
      for (const listener of listeners[eventName] ?? []) listener(...args)
      return true
    }),
    removeAllListeners: vi.fn((eventName?: string) => {
      if (eventName) {
        delete listeners[eventName]
      } else {
        for (const key of Object.keys(listeners)) delete listeners[key]
      }
      return mockAutoUpdater
    }),
    checkForUpdatesAndNotify: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  }

  return {
    createdWindows,
    listeners,
    mockAutoUpdater,
    mockShowMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (options: Record<string, unknown>) {
    let destroyed = false
    const instance: MockWindow = {
      options,
      destroy: vi.fn(() => {
        destroyed = true
      }),
      isDestroyed: vi.fn(() => destroyed),
      loadURL: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      once: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      showInactive: vi.fn(),
      webContents: {
        executeJavaScript: vi.fn().mockResolvedValue(undefined),
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      },
    }
    electronMocks.createdWindows.push(instance)
    return instance
  }),
  dialog: {
    showMessageBox: electronMocks.mockShowMessageBox,
  },
  screen: {
    getDisplayMatching: vi.fn(() => ({
      workArea: { x: 1440, y: 0, width: 1440, height: 900 },
    })),
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: electronMocks.mockAutoUpdater,
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * Creates a main-window stub with the webContents surface `typedSend` needs.
 * @returns BrowserWindow-compatible object for AutoUpdater tests.
 * @example
 * const mainWindow = createMainWindowStub()
 */
function createMainWindowStub(): BrowserWindow {
  return {
    getBounds: vi.fn(() => ({ x: 1500, y: 40, width: 900, height: 700 })),
    isDestroyed: vi.fn(() => false),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

/**
 * Returns the native update-progress BrowserWindow created by AutoUpdater.
 * @returns Captured progress window mock.
 * @example
 * const progressWindow = getProgressWindow()
 */
function getProgressWindow(): MockWindow {
  const progressWindow = electronMocks.createdWindows[0]
  if (!progressWindow) {
    throw new Error('Expected native update progress window to be created')
  }
  return progressWindow
}

describe('AutoUpdater download progress', () => {
  beforeEach(() => {
    electronMocks.createdWindows.length = 0
    electronMocks.mockShowMessageBox.mockClear()
    electronMocks.mockShowMessageBox.mockResolvedValue({ response: 1 })
    electronMocks.mockAutoUpdater.on.mockClear()
    electronMocks.mockAutoUpdater.emit.mockClear()
    electronMocks.mockAutoUpdater.removeAllListeners()
    electronMocks.mockAutoUpdater.removeAllListeners.mockClear()
    electronMocks.mockAutoUpdater.downloadUpdate.mockClear()
    electronMocks.mockAutoUpdater.downloadUpdate.mockResolvedValue(undefined)
    electronMocks.mockAutoUpdater.quitAndInstall.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('clamps raw electron-updater progress into the renderer payload range', () => {
    // Arrange + Act
    const overMax = normalizeDownloadProgress({
      percent: 140,
      bytesPerSecond: 10,
      transferred: 20,
      total: 30,
      delta: 0,
    })
    const underMin = normalizeDownloadProgress({
      percent: -12,
      bytesPerSecond: -1,
      transferred: -2,
      total: -3,
      delta: 0,
    })
    const invalidMetrics = normalizeDownloadProgress({
      percent: Number.NaN,
      bytesPerSecond: Number.NaN,
      transferred: Number.NaN,
      total: Number.NaN,
      delta: 0,
    })

    // Assert
    expect(overMax.percent).toBe(UPDATE_PROGRESS_PERCENT_MAX)
    expect(underMin.percent).toBe(UPDATE_PROGRESS_PERCENT_MIN)
    expect(underMin.bytesPerSecond).toBe(0)
    expect(underMin.transferred).toBe(0)
    expect(underMin.total).toBe(0)
    expect(invalidMetrics.percent).toBe(UPDATE_PROGRESS_PERCENT_MIN)
    expect(invalidMetrics.bytesPerSecond).toBe(0)
    expect(invalidMetrics.transferred).toBe(0)
    expect(invalidMetrics.total).toBe(0)
  })

  it('creates a passive native window and broadcasts progress on download-progress', () => {
    // Arrange
    const updater = new AutoUpdater()
    const mainWindow = createMainWindowStub()
    updater.setMainWindow(mainWindow)

    // Act
    electronMocks.mockAutoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 42,
      total: 100,
      delta: 0,
    })

    // Assert
    const progressWindow = getProgressWindow()
    expect(progressWindow.options.frame).toBe(false)
    expect(progressWindow.options.transparent).toBe(true)
    expect(progressWindow.options.alwaysOnTop).toBe(true)
    expect(progressWindow.options.skipTaskbar).toBe(true)
    expect(progressWindow.options.focusable).toBe(false)
    expect(progressWindow.options.x).toBe(1980)
    expect(progressWindow.options.y).toBe(690)
    expect(progressWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(progressWindow.loadURL).toHaveBeenCalledWith(
      expect.stringMatching(/^data:text\/html;charset=utf-8,/),
    )
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'updater-download-progress',
      {
        percent: 42,
        bytesPerSecond: 1024,
        transferred: 42,
        total: 100,
      },
    )
  })

  it('destroys the native progress window after update-downloaded', () => {
    // Arrange
    const updater = new AutoUpdater()
    updater.setMainWindow(createMainWindowStub())
    electronMocks.mockAutoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 42,
      total: 100,
      delta: 0,
    })
    const progressWindow = getProgressWindow()

    // Act
    electronMocks.mockAutoUpdater.emit('update-downloaded', {
      version: '1.2.4',
    })

    // Assert
    expect(progressWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys the native progress window during cleanup', () => {
    // Arrange
    const updater = new AutoUpdater()
    updater.setMainWindow(createMainWindowStub())
    electronMocks.mockAutoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 42,
      total: 100,
      delta: 0,
    })
    const progressWindow = getProgressWindow()

    // Act
    updater.cleanup()

    // Assert
    expect(progressWindow.destroy).toHaveBeenCalledTimes(1)
    expect(
      electronMocks.mockAutoUpdater.removeAllListeners,
    ).toHaveBeenCalledWith('download-progress')
  })
})

describe('AutoUpdater update dialogs', () => {
  beforeEach(() => {
    electronMocks.createdWindows.length = 0
    electronMocks.mockShowMessageBox.mockClear()
    electronMocks.mockShowMessageBox.mockResolvedValue({ response: 1 })
    electronMocks.mockAutoUpdater.removeAllListeners()
    electronMocks.mockAutoUpdater.removeAllListeners.mockClear()
    electronMocks.mockAutoUpdater.downloadUpdate.mockClear()
    electronMocks.mockAutoUpdater.quitAndInstall.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('anchors the update-available prompt to the main window while one is open', () => {
    // Arrange
    const updater = new AutoUpdater()
    const mainWindow = createMainWindowStub()
    updater.setMainWindow(mainWindow)

    // Act
    electronMocks.mockAutoUpdater.emit('update-available', { version: '1.2.4' })

    // Assert: anchored overload — the window is the dialog's first argument.
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(1)
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledWith(
      mainWindow,
      expect.objectContaining({ title: 'Update Available' }),
    )

    updater.cleanup()
  })

  it('surfaces the update-available prompt even when no main window is open', () => {
    // Arrange: companion mode — the updater is never handed a main window.
    const updater = new AutoUpdater()

    // Act
    electronMocks.mockAutoUpdater.emit('update-available', { version: '1.2.4' })

    // Assert: parentless overload (options-only call) keeps the prompt reachable
    // after the main window is retired (T18).
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(1)
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update Available' }),
    )

    updater.cleanup()
  })

  it('surfaces the restart prompt even when no main window is open', () => {
    // Arrange: companion mode — no main window hosts the downloaded-update dialog.
    const updater = new AutoUpdater()

    // Act
    electronMocks.mockAutoUpdater.emit('update-downloaded', {
      version: '1.2.4',
    })

    // Assert: parentless overload keeps the "Restart Now" prompt reachable.
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(1)
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update Ready' }),
    )

    updater.cleanup()
  })
})

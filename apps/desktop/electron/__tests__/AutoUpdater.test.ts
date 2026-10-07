import {
  UPDATE_PROGRESS_PERCENT_MAX,
  UPDATE_PROGRESS_PERCENT_MIN,
} from '@corelive/desktop-contract/constants'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vitest'

import { AutoUpdater, normalizeDownloadProgress } from '../AutoUpdater'
import { MenuManager } from '../MenuManager'

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
    autoDownload: true,
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
  app: { getName: () => 'CoreLive' },
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
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify
      .mockReset()
      .mockResolvedValue(undefined)
    electronMocks.mockAutoUpdater.autoDownload = true
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

  test('keeps the downloaded update ready when the native app menu checks again', async () => {
    // Arrange
    const updater = new AutoUpdater()
    onTestFinished(() => updater.cleanup())
    electronMocks.mockAutoUpdater.emit('update-downloaded', {
      version: '99.0.0',
    })
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockClear()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockImplementationOnce(
      async () => {
        electronMocks.mockAutoUpdater.emit('checking-for-update')
        return null
      },
    )
    const menu = new MenuManager(() => updater).createAppMenu()
    const item = Array.isArray(menu.submenu)
      ? menu.submenu.find((entry) => entry.label === 'Check for Updates...')
      : undefined

    // Act
    await (item?.click as () => Promise<void>)()

    // Assert
    expect(updater.getUpdateStatus().updateDownloaded).toBe(true)
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(2)
    expect(
      electronMocks.mockAutoUpdater.checkForUpdatesAndNotify,
    ).not.toHaveBeenCalled()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockClear()
  })

  test('keeps active download progress when the native app menu checks again', async () => {
    // Arrange
    const updater = new AutoUpdater()
    onTestFinished(() => updater.cleanup())
    electronMocks.mockAutoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 42,
      total: 100,
      delta: 0,
    })
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockClear()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockImplementationOnce(
      async () => {
        electronMocks.mockAutoUpdater.emit('checking-for-update')
        return null
      },
    )
    const menu = new MenuManager(() => updater).createAppMenu()
    const item = Array.isArray(menu.submenu)
      ? menu.submenu.find((entry) => entry.label === 'Check for Updates...')
      : undefined

    // Act
    await (item?.click as () => Promise<void>)()

    // Assert
    expect(updater.getUpdateStatus().downloadProgress?.percent).toBe(42)
    expect(
      electronMocks.mockAutoUpdater.checkForUpdatesAndNotify,
    ).not.toHaveBeenCalled()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockClear()
  })

  test('does not start a binary download before the user accepts the native update prompt', async () => {
    // Arrange
    let resolveConsent: (value: { response: number }) => void = () => {}
    const consent = new Promise<{ response: number }>((resolve) => {
      resolveConsent = resolve
    })
    electronMocks.mockShowMessageBox.mockReturnValue(consent)
    const updater = new AutoUpdater()
    onTestFinished(() => updater.cleanup())
    // electron-updater starts its automatic transfer after emitting update-available.
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockImplementationOnce(
      async () => {
        electronMocks.mockAutoUpdater.emit('update-available', {
          version: '99.0.0',
        })
        if (electronMocks.mockAutoUpdater.autoDownload) {
          await electronMocks.mockAutoUpdater.downloadUpdate()
        }
        return undefined
      },
    )

    // Act
    await updater.manualCheckForUpdates()
    expect(electronMocks.mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    resolveConsent({ response: 1 })
    await vi.advanceTimersByTimeAsync(0)

    // Assert
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledOnce()
    expect(electronMocks.mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    updater.cleanup()
  })

  test('keeps the manual update request pending until checking has finished', async () => {
    // Arrange
    const updater = new AutoUpdater()
    let resolveCheck: (value: undefined) => void = () => {}
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveCheck = resolve
      }),
    )
    let completed = false

    // Act
    const checking = updater.manualCheckForUpdates().then(() => {
      completed = true
    })
    await Promise.resolve()

    // Assert
    expect(completed).toBe(false)
    expect(updater.getUpdateStatus().isChecking).toBe(true)
    electronMocks.mockAutoUpdater.emit('update-not-available', {
      version: '0.24.0',
    })
    resolveCheck(undefined)
    await checking
    expect(updater.getUpdateStatus()).toEqual({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
      isChecking: false,
      message: 'Update not available',
    })
    updater.cleanup()
  })

  // Value: protects=unpackaged checks finish with actionable status; fails_when=null leaves checking active or loses installed-app guidance; why_new=existing checks cover success and rejection only; seam=none
  test('finishes an unavailable update check with installed-app guidance', async () => {
    // Arrange
    const updater = new AutoUpdater()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockResolvedValueOnce(
      null,
    )

    // Act
    await updater.manualCheckForUpdates()

    // Assert
    expect(updater.getUpdateStatus()).toEqual({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
      isChecking: false,
      message: 'Update checks are available in the installed app.',
    })
    updater.cleanup()
  })

  // Value: protects=active downloads survive manual and scheduled checks; fails_when=another check starts or progress is cleared during transfer; why_new=existing guard test covers only completed downloads; seam=none
  test('keeps an active download intact when manual and scheduled checks run', async () => {
    // Arrange
    const updater = new AutoUpdater()
    electronMocks.mockAutoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 42,
      total: 100,
      delta: 0,
    })
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockClear()

    // Act
    await updater.manualCheckForUpdates()
    updater.checkForUpdates()

    // Assert
    expect(
      electronMocks.mockAutoUpdater.checkForUpdatesAndNotify,
    ).not.toHaveBeenCalled()
    expect(updater.getUpdateStatus()).toMatchObject({
      updateDownloaded: false,
      isChecking: false,
      downloadProgress: {
        percent: 42,
        bytesPerSecond: 1024,
        transferred: 42,
        total: 100,
      },
    })
    updater.cleanup()
  })

  test('keeps a downloaded update installable instead of starting another network check', async () => {
    // Arrange
    const updater = new AutoUpdater()
    electronMocks.mockAutoUpdater.emit('update-downloaded', {
      version: '99.0.0',
    })
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockClear()

    // Act
    await updater.manualCheckForUpdates()
    updater.checkForUpdates()

    // Assert
    expect(
      electronMocks.mockAutoUpdater.checkForUpdatesAndNotify,
    ).not.toHaveBeenCalled()
    expect(updater.getUpdateStatus().updateDownloaded).toBe(true)
    updater.quitAndInstall()
    expect(electronMocks.mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce()
    updater.cleanup()
  })

  test('keeps the restart action when a concurrent update check fails after a download completes', async () => {
    // Arrange
    const updater = new AutoUpdater()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockImplementationOnce(
      async () => {
        electronMocks.mockAutoUpdater.emit('update-downloaded', {
          version: '99.0.0',
        })
        electronMocks.mockAutoUpdater.emit('error', new Error('Offline'))
        throw new Error('Offline')
      },
    )

    // Act
    await expect(updater.manualCheckForUpdates()).rejects.toThrow('Offline')

    // Assert
    expect(updater.getUpdateStatus().updateDownloaded).toBe(true)
    expect(updater.getUpdateStatus().isChecking).toBe(false)
    updater.cleanup()
  })

  test('starts the update download exactly once after native consent', async () => {
    // Arrange
    const updater = new AutoUpdater()
    electronMocks.mockShowMessageBox.mockResolvedValue({ response: 0 })

    // Act
    electronMocks.mockAutoUpdater.emit('update-available', {
      version: '99.0.0',
    })

    // Assert
    await vi.waitFor(() => {
      expect(
        electronMocks.mockAutoUpdater.downloadUpdate,
      ).toHaveBeenCalledOnce()
    })
    updater.cleanup()
  })

  test('leaves the update check retryable after a rejected check without an error event', async () => {
    // Arrange
    const updater = new AutoUpdater()
    electronMocks.mockAutoUpdater.checkForUpdatesAndNotify.mockRejectedValueOnce(
      new Error('Update endpoint unavailable'),
    )

    // Act
    await expect(updater.manualCheckForUpdates()).rejects.toThrow(
      'Update endpoint unavailable',
    )

    // Assert
    expect(updater.getUpdateStatus()).toEqual({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
      isChecking: false,
      message: 'Error in auto-updater',
    })
    updater.cleanup()
  })

  test('clamps raw electron-updater progress into the renderer payload range', () => {
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

  test('creates a passive native window on download-progress, sized to the primary display', () => {
    // Arrange: constructing AutoUpdater wires its `download-progress`
    // listener as a side effect; no main window exists (retired T18), so the
    // progress window is always positioned against the primary display.
    new AutoUpdater()

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
    expect(progressWindow.options.x).toBe(780)
    expect(progressWindow.options.y).toBe(870)
    expect(progressWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(progressWindow.loadURL).toHaveBeenCalledWith(
      expect.stringMatching(/^data:text\/html;charset=utf-8,/),
    )
  })

  test('destroys the native progress window after update-downloaded', () => {
    // Arrange: constructing AutoUpdater wires its listeners as a side effect.
    new AutoUpdater()
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

  test('destroys the native progress window during cleanup', () => {
    // Arrange
    const updater = new AutoUpdater()
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

  test('keeps one consent prompt open until the user decides, then allows a later check', async () => {
    // Arrange
    let finishDialog!: (choice: { response: number }) => void
    electronMocks.mockShowMessageBox.mockReturnValueOnce(
      new Promise((resolve) => {
        finishDialog = resolve
      }),
    )
    const updater = new AutoUpdater()
    const info = {
      version: '1.2.4',
      files: [],
      path: 'fixture.zip',
      sha512: 'fixture',
      releaseDate: '2026-10-02',
    }

    // Act
    const firstPrompt = updater.showUpdateAvailableDialog(info)
    void updater.showUpdateAvailableDialog(info)

    // Assert
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(1)
    finishDialog({ response: 1 })
    await firstPrompt
    expect(updater.getUpdateStatus().message).toBe('Update postponed')
    await updater.showUpdateAvailableDialog(info)
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(2)
    expect(electronMocks.mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    updater.cleanup()
  })

  test('shows the update-available prompt with the parentless overload — there is no main window to anchor to', () => {
    // Arrange: companion mode is the only mode — the main window was retired
    // in T18, so AutoUpdater never has one to anchor a dialog to.
    const updater = new AutoUpdater()

    // Act
    electronMocks.mockAutoUpdater.emit('update-available', { version: '1.2.4' })

    // Assert: parentless overload — exactly one argument (options), no window.
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledTimes(1)
    expect(electronMocks.mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update Available' }),
    )
    expect(electronMocks.mockShowMessageBox.mock.calls[0]).toHaveLength(1)

    updater.cleanup()
  })

  test('surfaces the restart prompt even when no main window is open', () => {
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

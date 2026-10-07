import type {
  UpdaterDownloadProgress,
  UpdaterStatus,
} from '@corelive/desktop-contract/ipc'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AppUpdateSettings } from './AppUpdateSettings'

const getVersionMock = vi.fn()
const checkForUpdatesMock = vi.fn()
const quitAndInstallMock = vi.fn()
const getStatusMock = vi.fn()
const downloadingHalfway: UpdaterDownloadProgress = {
  percent: 42,
  bytesPerSecond: 1024,
  transferred: 42,
  total: 100,
}

/**
 * Install a fake electronAPI on window for Electron renderer tests.
 *
 * @param api - The electronAPI stub, or undefined for a web renderer.
 */
function installElectronAPI(api: unknown): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('AppUpdateSettings', () => {
  beforeEach(() => {
    getVersionMock.mockReset()
    checkForUpdatesMock.mockReset()
    quitAndInstallMock.mockReset()
    getStatusMock.mockReset()

    getVersionMock.mockResolvedValue('1.2.3')
    checkForUpdatesMock.mockResolvedValue(true)
    quitAndInstallMock.mockResolvedValue(true)
    getStatusMock.mockResolvedValue({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  test('restores in-progress update download progress from updater status', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: false,
      downloadProgress: downloadingHalfway,
    })
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(await screen.findByText('Downloading update…')).toBeVisible()
    expect(screen.getByText('Download progress')).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: 'Update download progress' }),
    ).toHaveAttribute('aria-valuenow', '42')
  })

  test('shows the installed version once the main process responds', async () => {
    // Arrange
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByText("You're running CoreLive 1.2.3."),
    ).toBeVisible()
  })

  test('starts a manual update check when the button is clicked', async () => {
    // Arrange
    checkForUpdatesMock.mockReturnValue(new Promise(() => {}))
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByText("You're running CoreLive 1.2.3.")

    // Act
    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))

    // Assert
    await waitFor(() => {
      expect(checkForUpdatesMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('Checking for updates…')).toBeVisible()
  })

  test('allows another update check after the installed app reports that no update is available', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
      isChecking: false,
      message: 'Update not available',
    })
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByText("You're running CoreLive 1.2.3.")

    // Act
    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))

    // Assert
    expect(
      await screen.findByText("You're on the latest version."),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Check for Updates' }),
    ).toBeEnabled()
    expect(screen.queryByText('Checking…')).toBeNull()
  })

  test('replaces a live download with the restart action without reopening Settings', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: false,
      downloadProgress: downloadingHalfway,
      isChecking: false,
      message: 'Downloading update: 42%',
    })
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    render(<AppUpdateSettings />)
    await screen.findByRole('progressbar', { name: 'Update download progress' })

    // Act
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: true,
      downloadProgress: null,
      isChecking: false,
      message: 'Update downloaded',
    })

    // Assert
    expect(
      await screen.findByRole(
        'button',
        { name: 'Restart to Update' },
        { timeout: 2500 },
      ),
    ).toBeVisible()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Check for Updates' }),
    ).toBeEnabled()
  })

  // Value: protects=slow native status requests never overlap; fails_when=polling issues another request before the pending read settles; why_new=existing polling test resolves every request immediately; seam=none
  test('waits for a slow status response before polling again and shows its progress', async () => {
    // Arrange
    vi.useFakeTimers()
    let resolveStatus: (status: UpdaterStatus) => void = () => {}
    const pendingStatus = new Promise<UpdaterStatus>((resolve) => {
      resolveStatus = resolve
    })
    getStatusMock.mockResolvedValue({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
      isChecking: false,
      message: 'Update not available',
    })
    getStatusMock.mockReturnValueOnce(pendingStatus)
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    render(<AppUpdateSettings />)

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    // Assert
    expect(getStatusMock).toHaveBeenCalledTimes(1)

    // Act
    await act(async () => {
      resolveStatus({
        updateAvailable: true,
        updateDownloaded: false,
        downloadProgress: downloadingHalfway,
        isChecking: false,
        message: 'Downloading update: 42%',
      })
    })

    // Assert
    expect(screen.getByText('Downloading update…')).toBeVisible()

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Assert
    expect(getStatusMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText("You're on the latest version.")).toBeVisible()
  })

  // Value: protects=status polling recovers from a transient IPC rejection; fails_when=a failed read stops polling or hides the subsequent ready update; why_new=existing failures concern manual check and restart actions; seam=none
  test('recovers a failed status poll and offers restart when the next read succeeds', async () => {
    // Arrange
    vi.useFakeTimers()
    getStatusMock.mockRejectedValueOnce(
      new Error('IPC temporarily unavailable'),
    )
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: true,
      downloadProgress: null,
      isChecking: false,
      message: 'Update downloaded',
    })
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })

    // Act
    await act(async () => {
      render(<AppUpdateSettings />)
    })

    // Assert
    expect(
      screen.getByText("Couldn't check for updates. Try again in a moment."),
    ).toBeVisible()

    // Act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Assert
    expect(getStatusMock).toHaveBeenCalledTimes(2)
    expect(
      screen.getByRole('button', { name: 'Restart to Update' }),
    ).toBeVisible()
    expect(
      screen.queryByText("Couldn't check for updates. Try again in a moment."),
    ).toBeNull()
    // Act — a later transient read must not discard the downloaded package already shown.
    getStatusMock.mockRejectedValueOnce(
      new Error('IPC temporarily unavailable again'),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    // Assert
    expect(getStatusMock).toHaveBeenCalledTimes(3)
    expect(
      screen.getByRole('button', { name: 'Restart to Update' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Restart to Update' }),
    ).toBeEnabled()
  })

  // Value: protects=closing Settings stops a pending poll from starting more IPC reads; fails_when=a late response restarts polling after unmount; why_new=existing polling tests keep the Settings component mounted; seam=none
  test('stops polling after Settings closes while a native status read is pending', async () => {
    // Arrange
    vi.useFakeTimers()
    let resolveStatus: (status: UpdaterStatus) => void = () => {}
    getStatusMock.mockReturnValueOnce(
      new Promise<UpdaterStatus>((resolve) => {
        resolveStatus = resolve
      }),
    )
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const { unmount } = render(<AppUpdateSettings />)

    // Act
    unmount()
    await act(async () => {
      resolveStatus({
        updateAvailable: true,
        updateDownloaded: false,
        downloadProgress: downloadingHalfway,
        isChecking: false,
        message: 'Downloading update: 42%',
      })
      await vi.advanceTimersByTimeAsync(5000)
    })

    // Assert
    expect(getStatusMock).toHaveBeenCalledTimes(1)
  })

  test('offers restart when an update has already been downloaded', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: true,
      downloadProgress: null,
    })
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByRole('button', { name: 'Restart to Update' }),
    ).toBeVisible()
    expect(
      screen.getByText('Update ready. Restart CoreLive to finish installing.'),
    ).toBeVisible()
  })

  test('restarts the app when Restart to Update is clicked', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: true,
      downloadProgress: null,
    })
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByRole('button', { name: 'Restart to Update' })

    // Act
    await user.click(screen.getByRole('button', { name: 'Restart to Update' }))

    // Assert
    await waitFor(() => {
      expect(quitAndInstallMock).toHaveBeenCalledTimes(1)
    })
  })

  test('keeps a failed manual update request visible after the next native status poll', async () => {
    // Arrange
    checkForUpdatesMock.mockResolvedValue(false)
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByText("You're running CoreLive 1.2.3.")

    // Act
    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))
    await screen.findByText(
      "Couldn't check for updates. Try again in a moment.",
    )
    await waitFor(() => expect(getStatusMock).toHaveBeenCalledTimes(2), {
      timeout: 2500,
    })

    // Assert
    expect(
      screen.getByText("Couldn't check for updates. Try again in a moment."),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Check for Updates' }),
    ).toBeEnabled()
  })

  test('shows a retryable installation error when the native restart request fails', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: true,
      downloadProgress: null,
      isChecking: false,
      message: 'Update downloaded',
    })
    quitAndInstallMock.mockResolvedValue(false)
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByRole('button', { name: 'Restart to Update' })

    // Act
    await user.click(screen.getByRole('button', { name: 'Restart to Update' }))

    // Assert
    expect(
      await screen.findByText("Couldn't restart CoreLive. Try again."),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Restart to Update' }),
    ).toBeEnabled()
  })

  test('keeps a downloaded update ready to restart after a manual check fails', async () => {
    // Arrange
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: true,
      downloadProgress: null,
      isChecking: false,
      message: 'Update downloaded',
    })
    checkForUpdatesMock.mockResolvedValue(false)
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByRole('button', { name: 'Restart to Update' })

    // Act
    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))
    await screen.findByText(
      "Couldn't check for updates. Try again in a moment.",
    )

    // Assert
    expect(
      screen.getByRole('button', { name: 'Restart to Update' }),
    ).toBeVisible()
  })

  test('replaces an earlier check error when native downloading begins', async () => {
    // Arrange
    checkForUpdatesMock.mockResolvedValue(false)
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
    })
    const user = userEvent.setup()
    render(<AppUpdateSettings />)
    await screen.findByText("You're running CoreLive 1.2.3.")
    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))
    await screen.findByText(
      "Couldn't check for updates. Try again in a moment.",
    )

    // Act
    getStatusMock.mockResolvedValue({
      updateAvailable: true,
      updateDownloaded: false,
      downloadProgress: downloadingHalfway,
      isChecking: false,
      message: 'Downloading update: 42%',
    })

    // Assert
    expect(
      await screen.findByText('Downloading update…', {}, { timeout: 2500 }),
    ).toBeVisible()
    expect(
      screen.queryByText("Couldn't check for updates. Try again in a moment."),
    ).toBeNull()
  })

  test('shows a desktop-only message when the updater bridge is absent', async () => {
    // Arrange
    installElectronAPI(undefined)

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByText(
        'Update controls are only available in the desktop application.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Check for Updates' }),
    ).toBeNull()
  })
})

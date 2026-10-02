import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { UpdaterDownloadProgress } from '@/electron/types/ipc'

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
    expect(await screen.findByText('Downloading update — 42%')).toBeVisible()
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

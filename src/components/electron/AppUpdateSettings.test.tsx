import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UpdaterDownloadProgress } from '@/electron/types/ipc'

import { AppUpdateSettings } from './AppUpdateSettings'

const getVersionMock = vi.fn()
const checkForUpdatesMock = vi.fn()
const quitAndInstallMock = vi.fn()
const getStatusMock = vi.fn()
const onMock = vi.fn()
const eventListeners: Partial<Record<string, (payload: unknown) => void>> = {}

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
    for (const key of Object.keys(eventListeners)) {
      delete eventListeners[key]
    }
    getVersionMock.mockReset()
    checkForUpdatesMock.mockReset()
    quitAndInstallMock.mockReset()
    getStatusMock.mockReset()
    onMock.mockReset()

    getVersionMock.mockResolvedValue('1.2.3')
    checkForUpdatesMock.mockResolvedValue(true)
    quitAndInstallMock.mockResolvedValue(undefined)
    getStatusMock.mockResolvedValue({
      updateAvailable: false,
      updateDownloaded: false,
      downloadProgress: null,
    })
    onMock.mockImplementation(
      (channel: string, callback: (payload: unknown) => void) => {
        eventListeners[channel] = callback
        return () => {
          delete eventListeners[channel]
        }
      },
    )
  })

  it('restores in-progress update download progress from updater status', async () => {
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
      on: onMock,
    })

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByText('Downloading update — 42%'),
    ).toBeInTheDocument()
    expect(screen.getByText('Download progress')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Update download progress' }),
    ).toHaveAttribute('aria-valuenow', '42')
  })

  it('shows update download progress when the main process emits progress', async () => {
    // Arrange
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
      on: onMock,
    })
    render(<AppUpdateSettings />)
    await screen.findByText("You're running CoreLive 1.2.3.")

    // Act
    act(() => {
      eventListeners['updater-download-progress']?.(downloadingHalfway)
    })

    // Assert
    expect(screen.getByText('Downloading update — 42%')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Update download progress' }),
    ).toHaveAttribute('aria-valuenow', '42')
  })

  it('hides update download progress once the update is downloaded', async () => {
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
      on: onMock,
    })
    render(<AppUpdateSettings />)
    await screen.findByRole('progressbar', {
      name: 'Update download progress',
    })

    // Act
    act(() => {
      eventListeners['updater-message']?.('Update downloaded')
    })

    // Assert
    expect(
      screen.queryByRole('progressbar', { name: 'Update download progress' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Update ready. Restart CoreLive to finish installing.'),
    ).toBeInTheDocument()
  })

  it('hides update download progress when the updater reports an error', async () => {
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
      on: onMock,
    })
    render(<AppUpdateSettings />)
    await screen.findByRole('progressbar', {
      name: 'Update download progress',
    })

    // Act
    act(() => {
      eventListeners['updater-message']?.('Error in auto-updater')
    })

    // Assert
    expect(
      screen.queryByRole('progressbar', { name: 'Update download progress' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("Couldn't check for updates. Try again in a moment."),
    ).toBeInTheDocument()
  })

  it('hides update download progress when no update is available', async () => {
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
      on: onMock,
    })
    render(<AppUpdateSettings />)
    await screen.findByRole('progressbar', {
      name: 'Update download progress',
    })

    // Act
    act(() => {
      eventListeners['updater-message']?.('Update not available')
    })

    // Assert
    expect(
      screen.queryByRole('progressbar', { name: 'Update download progress' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("You're on the latest version."),
    ).toBeInTheDocument()
  })

  it('shows the installed version once the main process responds', async () => {
    // Arrange
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
      on: onMock,
    })

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByText("You're running CoreLive 1.2.3."),
    ).toBeInTheDocument()
  })

  it('starts a manual update check when the button is clicked', async () => {
    // Arrange
    installElectronAPI({
      app: { getVersion: getVersionMock },
      updater: {
        checkForUpdates: checkForUpdatesMock,
        quitAndInstall: quitAndInstallMock,
        getStatus: getStatusMock,
      },
      on: onMock,
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
    expect(screen.getByText('Checking for updates…')).toBeInTheDocument()
  })

  it('offers restart when an update has already been downloaded', async () => {
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
      on: onMock,
    })

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByRole('button', { name: 'Restart to Update' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Update ready. Restart CoreLive to finish installing.'),
    ).toBeInTheDocument()
  })

  it('restarts the app when Restart to Update is clicked', async () => {
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
      on: onMock,
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

  it('shows a desktop-only message when the updater bridge is absent', async () => {
    // Arrange
    installElectronAPI(undefined)

    // Act
    render(<AppUpdateSettings />)

    // Assert
    expect(
      await screen.findByText(
        'Update controls are only available in the desktop application.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Check for Updates' }),
    ).not.toBeInTheDocument()
  })
})

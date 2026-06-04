import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StartupWindowConfig } from '@/electron/types/ipc'

import { StartupWindowSettings } from './StartupWindowSettings'

// Stand-ins for the typed `settings` preload bridge the component talks to.
const getStartupConfigMock = vi.fn()
const setStartupConfigMock = vi.fn()

/**
 * Define `window.electronAPI` for a test. Passing `undefined` simulates a web
 * (non-Electron) renderer where the bridge is missing entirely.
 *
 * @param api - The fake electronAPI value, or undefined for a web renderer.
 */
function installElectronAPI(api: unknown): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

/**
 * Install a working settings bridge backed by the shared mocks.
 *
 * @param saved - The startup config getStartupConfig should resolve with.
 */
function installSettingsWithConfig(saved: StartupWindowConfig): void {
  getStartupConfigMock.mockResolvedValue(saved)
  installElectronAPI({
    settings: {
      getStartupConfig: getStartupConfigMock,
      setStartupConfig: setStartupConfigMock,
    },
  })
}

describe('StartupWindowSettings', () => {
  beforeEach(() => {
    getStartupConfigMock.mockReset()
    setStartupConfigMock.mockReset()
    // Default: saves succeed; individual tests override when exercising failure.
    setStartupConfigMock.mockResolvedValue(true)
  })

  it('reflects the saved startup config once the main process responds', async () => {
    // Arrange: brain-dump-only is the persisted choice.
    installSettingsWithConfig({
      showMain: false,
      showBraindump: true,
      showFloating: false,
    })

    // Act
    render(<StartupWindowSettings />)

    // Assert: the Brain Dump toggle reads on; the other two read off.
    const brainDumpSwitch = await screen.findByRole('switch', {
      name: 'Brain Dump',
    })
    expect(brainDumpSwitch).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Main window' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Floating Navigator' }),
    ).not.toBeChecked()
  })

  it('locks the only enabled window so a launch never opens nothing', async () => {
    // Arrange: the main window is the sole enabled startup window.
    installSettingsWithConfig({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })

    // Act
    render(<StartupWindowSettings />)

    // Assert: the lone enabled toggle is locked; the disabled ones stay toggleable.
    const mainSwitch = await screen.findByRole('switch', {
      name: 'Main window',
    })
    expect(mainSwitch).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Brain Dump' })).toBeEnabled()
  })

  it('persists the new config when a window is toggled on', async () => {
    // Arrange: only the main window opens at launch.
    installSettingsWithConfig({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
    const user = userEvent.setup()
    render(<StartupWindowSettings />)
    const brainDumpSwitch = await screen.findByRole('switch', {
      name: 'Brain Dump',
    })

    // Act: also open Brain Dump at launch.
    await user.click(brainDumpSwitch)

    // Assert: the full config (main + brain dump) is sent to the main process.
    await waitFor(() => {
      expect(setStartupConfigMock).toHaveBeenCalledWith({
        showMain: true,
        showBraindump: true,
        showFloating: false,
      })
    })
    expect(screen.getByRole('switch', { name: 'Brain Dump' })).toBeChecked()
  })

  it('rolls the toggle back when the main process fails to persist it', async () => {
    // Arrange: two windows enabled (so Floating is interactive, not locked).
    installSettingsWithConfig({
      showMain: true,
      showBraindump: true,
      showFloating: false,
    })
    setStartupConfigMock.mockResolvedValue(false) // the save reports failure
    const user = userEvent.setup()
    render(<StartupWindowSettings />)
    const floatingSwitch = await screen.findByRole('switch', {
      name: 'Floating Navigator',
    })
    expect(floatingSwitch).not.toBeChecked()

    // Act: try to enable Floating Navigator; persistence fails.
    await user.click(floatingSwitch)

    // Assert: the optimistic on-state reverts and an error surfaces.
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Floating Navigator' }),
      ).not.toBeChecked()
    })
    expect(
      screen.getByText('Failed to update startup window settings'),
    ).toBeInTheDocument()
  })

  it('shows a desktop-only message when the settings bridge is absent', async () => {
    // Arrange: a web renderer has no electronAPI at all.
    installElectronAPI(undefined)

    // Act
    render(<StartupWindowSettings />)

    // Assert: the fallback copy renders and no toggles are offered.
    expect(
      await screen.findByText(
        'Startup window settings are only available in the desktop application.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('degrades gracefully when an old preload exposes settings but not getStartupConfig', async () => {
    // Arrange: an OUTDATED installed desktop app whose preload still exposes the
    // long-lived `settings` namespace but predates the newer getStartupConfig
    // method. The freshly deployed web bundle mounts this component anyway
    // because window.electronAPI exists (version skew between app and web).
    installElectronAPI({ settings: {} })

    // Act + Assert: mounting must NOT throw a synchronous TypeError from the
    // load effect. An unguarded `api.getStartupConfig()` call would bubble out
    // of useEffect to Next.js global-error and blank the whole page. Instead a
    // graceful update card must render.
    render(<StartupWindowSettings />)
    expect(
      await screen.findByText(/Update CoreLive to the latest version/i),
    ).toBeInTheDocument()
  })

  it('shows a loading state until the saved config arrives', async () => {
    // Arrange: a never-resolving fetch keeps the component in its loading state.
    getStartupConfigMock.mockReturnValue(
      new Promise<StartupWindowConfig>(() => {}),
    )
    installElectronAPI({
      settings: {
        getStartupConfig: getStartupConfigMock,
        setStartupConfig: setStartupConfigMock,
      },
    })

    // Act
    render(<StartupWindowSettings />)

    // Assert: the loading copy shows and no toggles have rendered yet.
    expect(
      await screen.findByText('Loading startup window settings...'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

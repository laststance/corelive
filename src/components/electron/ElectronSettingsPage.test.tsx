/**
 * @fileoverview ElectronSettingsPage "Settings Window" card tests.
 *
 * Covers the "Restore default size" button and related version-skew guard
 * added in the settings-popover-resize feature. The existing application/
 * startup-window/floating/braindump toggle behaviours are tested in their own
 * sub-component test files — only new code introduced by this PR is exercised
 * here.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom environment).
 *
 * @example
 *   pnpm test -- ElectronSettingsPage
 */
import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import electronSettingsReducer from '@/lib/redux/slices/electronSettingsSlice'

import { ElectronSettingsPage } from './ElectronSettingsPage'

// --- Electron environment toggle -----------------------------------------

const isElectronMock = { value: true }

vi.mock('../../../electron/utils/electron-client', () => ({
  isElectronEnvironment: () => isElectronMock.value,
}))

// Sub-component stubs: focus on the Settings Window card, not the toggles
vi.mock('./AppUpdateSettings', () => ({
  AppUpdateSettings: () => null,
}))
vi.mock('./StartupWindowSettings', () => ({
  StartupWindowSettings: () => null,
}))
vi.mock('./FloatingWindowSettings', () => ({
  FloatingWindowSettings: () => null,
}))
vi.mock('./BrainDumpSettings', () => ({
  BrainDumpSettings: () => null,
}))

// --- Redux store ----------------------------------------------------------

/**
 * Builds a minimal Redux store for the component.
 *
 * @returns Pre-configured store with default electronSettings state.
 */
function buildStore() {
  return configureStore({
    reducer: { electronSettings: electronSettingsReducer },
    preloadedState: {
      electronSettings: {
        hideAppIcon: false,
        showInMenuBar: true,
        startAtLogin: false,
      },
    },
  })
}

/**
 * Wraps children with the Redux provider.
 *
 * @param children - React nodes to wrap.
 * @returns Wrapped JSX element.
 */
function withStore(children: ReactNode): ReactNode {
  return <Provider store={buildStore()}>{children}</Provider>
}

// --- electronAPI helpers --------------------------------------------------

const resetPopoverSizeMock = vi.fn()

/**
 * Installs `window.electronAPI` for Electron renderer tests.
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
 * Installs a working settings bridge that exposes `resetPopoverSize`.
 */
function installFullSettingsBridge(): void {
  resetPopoverSizeMock.mockResolvedValue(true)
  installElectronAPI({
    settings: { resetPopoverSize: resetPopoverSizeMock },
  })
}

// -------------------------------------------------------------------------

describe('ElectronSettingsPage — Settings Window card', () => {
  beforeEach(() => {
    isElectronMock.value = true
    resetPopoverSizeMock.mockReset()
    resetPopoverSizeMock.mockResolvedValue(true)
  })

  it('renders the Settings Window card and Restore default size button in Electron', () => {
    // Arrange
    installFullSettingsBridge()

    // Act
    render(withStore(<ElectronSettingsPage />))

    // Assert: CardTitle renders as a div (not an h* element), so use getByText.
    expect(screen.getByText('Settings Window')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Restore default size' }),
    ).toBeInTheDocument()
  })

  it('returns null and hides the Settings Window section outside Electron', () => {
    // Arrange: web renderer — no electronAPI and isElectron = false.
    isElectronMock.value = false
    installElectronAPI(undefined)

    // Act
    const { container } = render(withStore(<ElectronSettingsPage />))

    // Assert: nothing is rendered.
    expect(container).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('heading', { name: 'Settings Window' }),
    ).not.toBeInTheDocument()
  })

  it('calls resetPopoverSize IPC when the button is clicked', async () => {
    // Arrange
    installFullSettingsBridge()
    const user = userEvent.setup()
    render(withStore(<ElectronSettingsPage />))

    // Act
    await user.click(
      screen.getByRole('button', { name: 'Restore default size' }),
    )

    // Assert
    await waitFor(() => {
      expect(resetPopoverSizeMock).toHaveBeenCalledTimes(1)
    })
  })

  it('skips the IPC call when the preload method is absent (version-skew guard)', async () => {
    // Arrange: old preload that has `settings` but not `resetPopoverSize`.
    installElectronAPI({ settings: {} })
    const user = userEvent.setup()
    render(withStore(<ElectronSettingsPage />))

    // Act: clicking must NOT throw despite the missing method.
    await user.click(
      screen.getByRole('button', { name: 'Restore default size' }),
    )

    // Assert: the mock was never invoked.
    expect(resetPopoverSizeMock).not.toHaveBeenCalled()
  })
})

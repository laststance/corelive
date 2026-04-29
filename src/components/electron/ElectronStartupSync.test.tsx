import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import electronSettingsReducer from '@/lib/redux/slices/electronSettingsSlice'

import { ElectronStartupSync } from './ElectronStartupSync'

const setHideAppIconMock = vi.fn().mockResolvedValue(true)

// Toggle for the mocked Electron environment detector. Tests flip this
// before rendering to exercise both Electron and web code paths.
const isElectronMock = { value: true }

vi.mock('../../../electron/utils/electron-client', () => ({
  isElectronEnvironment: () => isElectronMock.value,
}))

const buildStore = (hideAppIcon: boolean) =>
  configureStore({
    reducer: {
      electronSettings: electronSettingsReducer,
    },
    preloadedState: {
      electronSettings: {
        hideAppIcon,
        showInMenuBar: true,
        startAtLogin: false,
      },
    },
  })

const wrapWithStore = (children: ReactNode, hideAppIcon: boolean) => (
  <Provider store={buildStore(hideAppIcon)}>{children}</Provider>
)

const installElectronAPI = (
  api:
    | { settings?: { setHideAppIcon?: typeof setHideAppIconMock } }
    | undefined,
): void => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

describe('ElectronStartupSync', () => {
  beforeEach(() => {
    setHideAppIconMock.mockClear()
    isElectronMock.value = true
    installElectronAPI({
      settings: {
        setHideAppIcon: setHideAppIconMock,
      },
    })
  })

  it.each([true, false])(
    'forwards persisted hideAppIcon=%s to the main process on mount',
    async (hideAppIcon) => {
      render(wrapWithStore(<ElectronStartupSync />, hideAppIcon))

      await waitFor(() => {
        expect(setHideAppIconMock).toHaveBeenCalledWith(hideAppIcon)
      })
    },
  )

  it('does not call IPC when not running in Electron', async () => {
    isElectronMock.value = false

    render(wrapWithStore(<ElectronStartupSync />, true))

    // Yield once so any pending effect would have flushed.
    await Promise.resolve()
    expect(setHideAppIconMock).not.toHaveBeenCalled()
  })

  it('does not throw when window.electronAPI is undefined', async () => {
    installElectronAPI(undefined)

    expect(() =>
      render(wrapWithStore(<ElectronStartupSync />, true)),
    ).not.toThrow()
    await Promise.resolve()
    expect(setHideAppIconMock).not.toHaveBeenCalled()
  })
})

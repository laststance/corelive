import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import electronSettingsReducer, {
  setHideAppIcon,
} from '@/lib/redux/slices/electronSettingsSlice'

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

  it('logs an error when setHideAppIcon rejects', async () => {
    // Surface IPC failures so main-process regressions don't go silent.
    // Without this test, a future refactor could remove the .catch handler
    // and the suite would still pass.
    const ipcError = new Error('main process unavailable')
    setHideAppIconMock.mockRejectedValueOnce(ipcError)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(wrapWithStore(<ElectronStartupSync />, true))

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon:',
        ipcError,
      )
    })

    consoleErrorSpy.mockRestore()
  })

  it('re-syncs when hideAppIcon changes after mount', async () => {
    // Locks down the [hideAppIcon] dependency in the effect — if someone
    // changes it to [] (mount-only), this test fails. Important because
    // the Settings UI updates the Redux value at runtime and the dock
    // policy must follow.
    const store = configureStore({
      reducer: { electronSettings: electronSettingsReducer },
      preloadedState: {
        electronSettings: {
          hideAppIcon: false,
          showInMenuBar: true,
          startAtLogin: false,
        },
      },
    })

    render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )

    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })

    store.dispatch(setHideAppIcon(true))

    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(setHideAppIconMock).toHaveBeenCalledTimes(2)
  })
})

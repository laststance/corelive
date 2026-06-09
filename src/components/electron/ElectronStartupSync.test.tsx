import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import electronSettingsReducer, {
  setHideAppIcon,
  setShowInMenuBar,
} from '@/lib/redux/slices/electronSettingsSlice'

import { ElectronStartupSync } from './ElectronStartupSync'

const setHideAppIconMock = vi.fn().mockResolvedValue(true)
const setShowInMenuBarMock = vi.fn().mockResolvedValue(true)

// Toggle for the mocked Electron environment detector. Tests flip this
// before rendering to exercise both Electron and web code paths.
const isElectronMock = { value: true }

vi.mock('../../../electron/utils/electron-client', () => ({
  isElectronEnvironment: () => isElectronMock.value,
}))

const buildStore = (hideAppIcon: boolean, showInMenuBar = true) =>
  configureStore({
    reducer: {
      electronSettings: electronSettingsReducer,
    },
    preloadedState: {
      electronSettings: {
        hideAppIcon,
        showInMenuBar,
        startAtLogin: false,
      },
    },
  })

const wrapWithStore = (
  children: ReactNode,
  hideAppIcon: boolean,
  showInMenuBar = true,
) => (
  <Provider store={buildStore(hideAppIcon, showInMenuBar)}>{children}</Provider>
)

const installElectronAPI = (
  api:
    | {
        settings?: {
          setHideAppIcon?: typeof setHideAppIconMock
          setShowInMenuBar?: typeof setShowInMenuBarMock
        }
      }
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
    setShowInMenuBarMock.mockClear()
    isElectronMock.value = true
    installElectronAPI({
      settings: {
        setHideAppIcon: setHideAppIconMock,
        setShowInMenuBar: setShowInMenuBarMock,
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
      // Cross-check the OTHER setting got its own distinct literal (the store's
      // showInMenuBar default is true), so a selector/value swap between the two
      // independent effects can never silently pass this case.
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
    },
  )

  it.each([true, false])(
    'forwards persisted showInMenuBar=%s to the main process on mount',
    async (showInMenuBar) => {
      render(wrapWithStore(<ElectronStartupSync />, false, showInMenuBar))

      await waitFor(() => {
        expect(setShowInMenuBarMock).toHaveBeenCalledWith(showInMenuBar)
      })
      // Cross-check the dock-icon effect sent its own distinct literal (false),
      // guarding against a swap where one effect forwards the other's value.
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    },
  )

  it('does not call IPC when not running in Electron', async () => {
    isElectronMock.value = false

    render(wrapWithStore(<ElectronStartupSync />, true))

    // Yield once so any pending effect would have flushed.
    await Promise.resolve()
    expect(setHideAppIconMock).not.toHaveBeenCalled()
    expect(setShowInMenuBarMock).not.toHaveBeenCalled()
  })

  it('does not throw when window.electronAPI is undefined', async () => {
    installElectronAPI(undefined)

    expect(() =>
      render(wrapWithStore(<ElectronStartupSync />, true)),
    ).not.toThrow()
    await Promise.resolve()
    expect(setHideAppIconMock).not.toHaveBeenCalled()
    expect(setShowInMenuBarMock).not.toHaveBeenCalled()
  })

  it('does not throw when an old preload exposes settings but not setHideAppIcon', async () => {
    // Arrange: an OUTDATED desktop app exposes the `settings` namespace but
    // predates the `setHideAppIcon` method this effect calls. Mounted in the
    // root layout, a synchronous TypeError here would bubble past error.tsx to
    // global-error and blank every route. The method guard must skip the call —
    // and crucially, the still-present setShowInMenuBar sync must run anyway.
    installElectronAPI({ settings: { setShowInMenuBar: setShowInMenuBarMock } })

    // Act + Assert: mounting must not throw; the missing method is skipped while
    // the independent menu-bar sync still fires (guards are per-method).
    expect(() =>
      render(wrapWithStore(<ElectronStartupSync />, true)),
    ).not.toThrow()
    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
    })
    expect(setHideAppIconMock).not.toHaveBeenCalled()
  })

  it('does not throw when an old preload exposes settings but not setShowInMenuBar', async () => {
    // Arrange: the mirror case — an OUTDATED preload has setHideAppIcon but not
    // the newer setShowInMenuBar. The menu-bar guard must skip its call without
    // suppressing the hideAppIcon sync (independent per-method guards).
    installElectronAPI({ settings: { setHideAppIcon: setHideAppIconMock } })

    // Act + Assert: no throw; the present method still syncs, the missing one is
    // skipped.
    expect(() =>
      render(wrapWithStore(<ElectronStartupSync />, true)),
    ).not.toThrow()
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(setShowInMenuBarMock).not.toHaveBeenCalled()
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

  it('logs an error when setShowInMenuBar rejects', async () => {
    // Mirror of the hideAppIcon failure path: a rejected menu-bar sync must be
    // surfaced under its own label so the two settings' failures are
    // distinguishable in logs.
    const ipcError = new Error('tray unavailable')
    setShowInMenuBarMock.mockRejectedValueOnce(ipcError)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(wrapWithStore(<ElectronStartupSync />, false, true))

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync showInMenuBar:',
        ipcError,
      )
    })

    consoleErrorSpy.mockRestore()
  })

  it('logs an error when setHideAppIcon resolves to false', async () => {
    // The preload bridge swallows thrown errors and returns `false` instead
    // of rejecting (electron/preload.ts:1491-1502). Without this test, the
    // .then/false-check could be removed and the rejection-only test above
    // would still pass — but real failures from main would silently disappear.
    setHideAppIconMock.mockResolvedValueOnce(false)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(wrapWithStore(<ElectronStartupSync />, true))

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon: IPC returned false',
      )
    })

    consoleErrorSpy.mockRestore()
  })

  it('logs an error when setShowInMenuBar resolves to false', async () => {
    // Same false-return contract as hideAppIcon: a `false` resolution means the
    // tray never appeared, so it must be reported (not silently treated as ok).
    setShowInMenuBarMock.mockResolvedValueOnce(false)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(wrapWithStore(<ElectronStartupSync />, false, true))

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync showInMenuBar: IPC returned false',
      )
    })

    consoleErrorSpy.mockRestore()
  })

  it('does not log an error when setHideAppIcon resolves to true', async () => {
    // Guard against false-positive logging: the success path must stay quiet.
    // If someone flipped the boolean check (`ok === true` instead of `ok === false`),
    // this test catches it.
    setHideAppIconMock.mockResolvedValueOnce(true)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(wrapWithStore(<ElectronStartupSync />, true))

    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('does not log an error when setShowInMenuBar resolves to true', async () => {
    // Mirror of the hideAppIcon success-quiet test, but for the tray-OFF success
    // path (showInMenuBar=false persisted, sync succeeds). The shared
    // reportSyncFailure helper only runs through the hideAppIcon quiet test with
    // showInMenuBar=true, so a spurious-success log gated to the menu-bar OFF
    // branch would otherwise ship green.
    setShowInMenuBarMock.mockResolvedValueOnce(true)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(wrapWithStore(<ElectronStartupSync />, false, false))

    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(false)
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()

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

  it('re-syncs when showInMenuBar changes after mount', async () => {
    // Mirror dep-lock for the menu-bar effect: a [showInMenuBar] → [] regression
    // would strand the tray out of sync after a runtime toggle. Also confirms
    // the menu-bar effect is independent of hideAppIcon — toggling the menu bar
    // must NOT re-fire the dock-icon sync.
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
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
    })

    store.dispatch(setShowInMenuBar(false))

    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(false)
    })
    expect(setShowInMenuBarMock).toHaveBeenCalledTimes(2)
    // Independence: the dock-icon sync fired only once (mount), not again.
    expect(setHideAppIconMock).toHaveBeenCalledTimes(1)
  })
})

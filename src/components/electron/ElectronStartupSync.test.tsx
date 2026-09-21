import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { STORAGE_SCHEMA_VERSION } from '@/lib/redux/migratePersistedState'
import electronSettingsReducer, {
  setHideAppIcon,
  setShowInMenuBar,
  setStartAtLogin,
} from '@/lib/redux/slices/electronSettingsSlice'
import type { ElectronSettingsState } from '@/lib/redux/slices/electronSettingsSlice'
import { createPersistenceMiddleware, STORAGE_KEY } from '@/lib/redux/store'

import { ElectronStartupSync } from './ElectronStartupSync'

const setHideAppIconMock = vi.fn().mockResolvedValue(true)
const setShowInMenuBarMock = vi.fn().mockResolvedValue(true)

// Toggle for the mocked Electron environment detector. Tests flip this
// before rendering to exercise both Electron and web code paths.
const isElectronMock = { value: true }

vi.mock('../../../electron/utils/electron-client', () => ({
  isElectronEnvironment: () => isElectronMock.value,
}))

// The two settings this component mirrors to main. Named (never positional
// booleans) so every call site reads without looking up the signature.
type SyncedSettings = Pick<
  ElectronSettingsState,
  'hideAppIcon' | 'showInMenuBar'
>

const buildStore = ({ hideAppIcon, showInMenuBar }: SyncedSettings) =>
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

const wrapWithStore = (children: ReactNode, syncedSettings: SyncedSettings) => (
  <Provider store={buildStore(syncedSettings)}>{children}</Provider>
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
    window.localStorage.clear()
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

  afterEach(() => {
    // The rehydration test seeds persisted settings; never leak them onward.
    window.localStorage.clear()
  })

  test.each([true, false])(
    'forwards persisted hideAppIcon=%s to the main process on mount',
    async (hideAppIcon) => {
      render(
        wrapWithStore(<ElectronStartupSync />, {
          hideAppIcon,
          showInMenuBar: true,
        }),
      )

      await waitFor(() => {
        expect(setHideAppIconMock).toHaveBeenCalledWith(hideAppIcon)
      })
      // Cross-check the OTHER setting got its own distinct literal (showInMenuBar
      // is true above), so a selector/value swap between the two independent
      // syncs can never silently pass this case.
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
    },
  )

  test.each([true, false])(
    'forwards persisted showInMenuBar=%s to the main process on mount',
    async (showInMenuBar) => {
      render(
        wrapWithStore(<ElectronStartupSync />, {
          hideAppIcon: false,
          showInMenuBar,
        }),
      )

      await waitFor(() => {
        expect(setShowInMenuBarMock).toHaveBeenCalledWith(showInMenuBar)
      })
      // Cross-check the dock-icon sync sent its own distinct literal (false),
      // guarding against a swap where one sync forwards the other's value.
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    },
  )

  test('does not call IPC when not running in Electron', async () => {
    isElectronMock.value = false

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: true,
        showInMenuBar: true,
      }),
    )

    // Yield once so any pending effect would have flushed.
    await Promise.resolve()
    expect(setHideAppIconMock).not.toHaveBeenCalled()
    expect(setShowInMenuBarMock).not.toHaveBeenCalled()
  })

  test('does not throw when window.electronAPI is undefined', async () => {
    installElectronAPI(undefined)

    expect(() =>
      render(
        wrapWithStore(<ElectronStartupSync />, {
          hideAppIcon: true,
          showInMenuBar: true,
        }),
      ),
    ).not.toThrow()
    await Promise.resolve()
    expect(setHideAppIconMock).not.toHaveBeenCalled()
    expect(setShowInMenuBarMock).not.toHaveBeenCalled()
  })

  test('does not throw when an old preload exposes settings but not setHideAppIcon', async () => {
    // Arrange: an OUTDATED desktop app exposes the `settings` namespace but
    // predates the `setHideAppIcon` method this effect calls. Mounted in the
    // root layout, a synchronous TypeError here would bubble past error.tsx to
    // global-error and blank every route. The method guard must skip the call —
    // and crucially, the still-present setShowInMenuBar sync must run anyway.
    installElectronAPI({ settings: { setShowInMenuBar: setShowInMenuBarMock } })

    // Act + Assert: mounting must not throw; the missing method is skipped while
    // the independent menu-bar sync still fires (guards are per-method).
    expect(() =>
      render(
        wrapWithStore(<ElectronStartupSync />, {
          hideAppIcon: true,
          showInMenuBar: true,
        }),
      ),
    ).not.toThrow()
    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
    })
    expect(setHideAppIconMock).not.toHaveBeenCalled()
  })

  test('does not throw when an old preload exposes settings but not setShowInMenuBar', async () => {
    // Arrange: the mirror case — an OUTDATED preload has setHideAppIcon but not
    // the newer setShowInMenuBar. The menu-bar guard must skip its call without
    // suppressing the hideAppIcon sync (independent per-method guards).
    installElectronAPI({ settings: { setHideAppIcon: setHideAppIconMock } })

    // Act + Assert: no throw; the present method still syncs, the missing one is
    // skipped.
    expect(() =>
      render(
        wrapWithStore(<ElectronStartupSync />, {
          hideAppIcon: true,
          showInMenuBar: true,
        }),
      ),
    ).not.toThrow()
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(setShowInMenuBarMock).not.toHaveBeenCalled()
  })

  test('logs an error when setHideAppIcon rejects', async () => {
    // Surface IPC failures so main-process regressions don't go silent.
    // Without this test, a future refactor could remove the .catch handler
    // and the suite would still pass.
    const ipcError = new Error('main process unavailable')
    setHideAppIconMock.mockRejectedValueOnce(ipcError)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: true,
        showInMenuBar: true,
      }),
    )

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon:',
        ipcError,
      )
    })

    consoleErrorSpy.mockRestore()
  })

  test('logs an error when setShowInMenuBar rejects', async () => {
    // Mirror of the hideAppIcon failure path: a rejected menu-bar sync must be
    // surfaced under its own label so the two settings' failures are
    // distinguishable in logs.
    const ipcError = new Error('tray unavailable')
    setShowInMenuBarMock.mockRejectedValueOnce(ipcError)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: false,
        showInMenuBar: true,
      }),
    )

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync showInMenuBar:',
        ipcError,
      )
    })

    consoleErrorSpy.mockRestore()
  })

  test('logs an error when setHideAppIcon resolves to false', async () => {
    // The preload bridge swallows thrown errors and returns `false` instead
    // of rejecting (electron/preload.ts:1491-1502). Without this test, the
    // .then/false-check could be removed and the rejection-only test above
    // would still pass — but real failures from main would silently disappear.
    setHideAppIconMock.mockResolvedValueOnce(false)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: true,
        showInMenuBar: true,
      }),
    )

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon: IPC returned false',
      )
    })

    consoleErrorSpy.mockRestore()
  })

  test('logs an error when setShowInMenuBar resolves to false', async () => {
    // Same false-return contract as hideAppIcon: a `false` resolution means the
    // tray never appeared, so it must be reported (not silently treated as ok).
    setShowInMenuBarMock.mockResolvedValueOnce(false)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: false,
        showInMenuBar: true,
      }),
    )

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync showInMenuBar: IPC returned false',
      )
    })

    consoleErrorSpy.mockRestore()
  })

  test('does not log an error when setHideAppIcon resolves to true', async () => {
    // Guard against false-positive logging: the success path must stay quiet.
    // If someone flipped the boolean check (`ok === true` instead of `ok === false`),
    // this test catches it.
    setHideAppIconMock.mockResolvedValueOnce(true)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: true,
        showInMenuBar: true,
      }),
    )

    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  test('does not log an error when setShowInMenuBar resolves to true', async () => {
    // Mirror of the hideAppIcon success-quiet test, but for the tray-OFF success
    // path (showInMenuBar=false persisted, sync succeeds). The shared
    // pushSettingToMain helper only runs through the hideAppIcon quiet test with
    // showInMenuBar=true, so a spurious-success log gated to the menu-bar OFF
    // branch would otherwise ship green.
    setShowInMenuBarMock.mockResolvedValueOnce(true)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: false,
        showInMenuBar: false,
      }),
    )

    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(false)
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  // The `serverState` + `hydrate: true` scaffolding in the next two tests exists
  // to reproduce the ORIGINAL regression: react-redux only serves `serverState`
  // to selector hooks, so these go red the moment the sync reads a render-time
  // selector again. The store-mirroring implementation never consults it; the
  // "store is already restored at mount" guarantee is pinned by the
  // real-middleware test below.
  test('keeps the Settings popover open on first mount by never pushing the SSR placeholder hideAppIcon while hydrating', async () => {
    // Arrange: mirror the production ReduxProvider — the real store already holds
    // the user's persisted hideAppIcon=true (restored from localStorage), while
    // `serverState` carries the slice defaults so the first hydration render
    // matches the server HTML.
    const store = buildStore({ hideAppIcon: true, showInMenuBar: true })
    const serverState = {
      electronSettings: {
        hideAppIcon: false,
        showInMenuBar: true,
        startAtLogin: false,
      },
    }
    const app = (
      <Provider store={store} serverState={serverState}>
        <ElectronStartupSync />
      </Provider>
    )
    // This tree renders nothing, so its server HTML is an empty container.
    const container = document.body.appendChild(document.createElement('div'))

    // Act: hydrate (not client-render) the tree, as every Electron window does on
    // load — only hydration makes react-redux serve `serverState` first.
    render(app, { container, hydrate: true })

    // Assert: only the persisted value reaches main. A `false` push flips the
    // macOS activation policy accessory→regular→accessory, which deactivates the
    // app and blur-closes the Settings popover the instant it first opens.
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(setHideAppIconMock).not.toHaveBeenCalledWith(false)
  })

  test('keeps a hidden tray icon hidden on first mount by never pushing the SSR placeholder showInMenuBar while hydrating', async () => {
    // Arrange: the user turned the menu-bar icon OFF (persisted false); the SSR
    // placeholder default is true.
    const store = buildStore({ hideAppIcon: false, showInMenuBar: false })
    const serverState = {
      electronSettings: {
        hideAppIcon: false,
        showInMenuBar: true,
        startAtLogin: false,
      },
    }
    const app = (
      <Provider store={store} serverState={serverState}>
        <ElectronStartupSync />
      </Provider>
    )
    // This tree renders nothing, so its server HTML is an empty container.
    const container = document.body.appendChild(document.createElement('div'))

    // Act: hydrate, so react-redux serves the `serverState` placeholder first.
    render(app, { container, hydrate: true })

    // Assert: a `true` push would re-create the tray icon the user hid, then
    // destroy it again — a menu-bar icon flash when the Settings window first mounts.
    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(false)
    })
    expect(setShowInMenuBarMock).not.toHaveBeenCalledWith(true)
  })

  test('pushes only the restored settings when the real persistence middleware rehydrates before the first mount', async () => {
    // Arrange: the production sequence end to end. The REAL storage middleware
    // schedules its localStorage rehydrate in a microtask at store creation;
    // `serverState` is captured synchronously right after (as providers.tsx does
    // at module-eval), so it holds the slice defaults; React hydrates in a LATER
    // task, once the bundle has evaluated.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_SCHEMA_VERSION,
        state: {
          electronSettings: {
            hideAppIcon: true,
            showInMenuBar: false,
            startAtLogin: false,
          },
        },
      }),
    )
    const { middleware, reducer } = createPersistenceMiddleware()
    const store = configureStore({
      reducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }).concat(middleware),
    })
    const serverState = store.getState()
    // Next task: the gap between bundle evaluation and React hydration.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const app = (
      <Provider store={store} serverState={serverState}>
        <ElectronStartupSync />
      </Provider>
    )
    // This tree renders nothing, so its server HTML is an empty container.
    const container = document.body.appendChild(document.createElement('div'))

    // Act
    render(app, { container, hydrate: true })

    // Assert: the component relies on the store being ALREADY restored when it
    // mounts. If rehydration ever lands after the first mount (deferred
    // hydration, a library scheduling change), the defaults reach main first and
    // the Settings popover blur-closes on its first open again.
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    expect(setHideAppIconMock.mock.calls).toEqual([[true]])
    expect(setShowInMenuBarMock.mock.calls).toEqual([[false]])
  })

  test('re-syncs when hideAppIcon changes after mount', async () => {
    // Locks down the store subscription — if someone drops `store.subscribe`
    // (mount-only sync), this test fails. Important because the Settings UI
    // updates the Redux value at runtime and the dock policy must follow.
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

  test('re-syncs when showInMenuBar changes after mount', async () => {
    // Mirror subscription-lock for the menu-bar sync: a mount-only regression
    // would strand the tray out of sync after a runtime toggle. Also confirms
    // the per-setting last-pushed dedupe — toggling the menu bar must NOT
    // re-fire the dock-icon sync.
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

  test('leaves the tray untouched when only Hide App Icon is toggled', async () => {
    // Mirror of the menu-bar independence check. The sync now subscribes to the
    // WHOLE store, so without the per-setting last-pushed dedupe a dock-icon
    // toggle would also re-push showInMenuBar and destroy/re-create the tray.
    // Arrange
    const store = buildStore({ hideAppIcon: false, showInMenuBar: true })
    render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
    })

    // Act
    store.dispatch(setHideAppIcon(true))

    // Assert
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledTimes(2)
    })
    expect(setShowInMenuBarMock).toHaveBeenCalledTimes(1)
  })

  test('ignores dispatches for settings it does not own', async () => {
    // The old implementation re-ran only when a selected value changed. This one
    // subscribes to the entire store, so EVERY dispatch in the app (any user
    // `settings` toggle, startAtLogin) runs the sync callback — the last-pushed
    // dedupe is the only thing keeping unrelated dispatches off the IPC bridge.
    // Arrange
    const store = buildStore({ hideAppIcon: true, showInMenuBar: true })
    render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledTimes(1)
    })

    // Act: a third setting in the same slice changes; neither synced value moved.
    store.dispatch(setStartAtLogin(true))

    // Assert: no extra IPC traffic — an activation-policy re-apply on every
    // unrelated dispatch would churn the dock and steal focus.
    await Promise.resolve()
    expect(setHideAppIconMock).toHaveBeenCalledTimes(1)
    expect(setShowInMenuBarMock).toHaveBeenCalledTimes(1)
  })

  test('does not re-push a setting that is dispatched again with the same value', async () => {
    // Redux notifies subscribers on EVERY dispatch, even when the reducer leaves
    // the state unchanged, so re-sending the current value must not reach main twice.
    // Arrange
    const store = buildStore({ hideAppIcon: false, showInMenuBar: true })
    render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })

    // Act: re-dispatch the value the store already holds.
    store.dispatch(setHideAppIcon(false))

    // Assert
    await Promise.resolve()
    expect(setHideAppIconMock).toHaveBeenCalledTimes(1)
  })

  test('forwards every Hide App Icon toggle in order so main lands on the final value', async () => {
    // Rapid toggling in Settings: the last-pushed bookkeeping must track each
    // change, or main ends up on a stale policy while the UI shows the new one.
    // Arrange
    const store = buildStore({ hideAppIcon: false, showInMenuBar: true })
    render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })

    // Act
    store.dispatch(setHideAppIcon(true))
    store.dispatch(setHideAppIcon(false))
    store.dispatch(setHideAppIcon(true))

    // Assert: mount push plus one push per change, newest last.
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledTimes(4)
    })
    expect(setHideAppIconMock.mock.calls).toEqual([
      [false],
      [true],
      [false],
      [true],
    ])
  })

  test('stops syncing after unmount so a torn-down window cannot flip the dock policy', async () => {
    // `store.subscribe` returns the unsubscribe that the effect hands back as its
    // cleanup. Drop that return and the closed window's callback stays subscribed
    // forever, re-applying activation policy from a dead renderer.
    // Arrange
    const store = buildStore({ hideAppIcon: false, showInMenuBar: true })
    const { unmount } = render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })

    // Act
    unmount()
    store.dispatch(setHideAppIcon(true))

    // Assert
    await Promise.resolve()
    expect(setHideAppIconMock).toHaveBeenCalledTimes(1)
    expect(setHideAppIconMock).not.toHaveBeenCalledWith(true)
  })

  test('mirrors the new store after the Provider swaps stores and stops mirroring the old one', async () => {
    // The sync subscribes to the store by hand, so nothing re-binds it for free:
    // a mount-only effect would keep pushing a dead store's values to main.
    // Arrange
    const firstStore = buildStore({ hideAppIcon: false, showInMenuBar: true })
    const secondStore = buildStore({ hideAppIcon: true, showInMenuBar: true })
    const { rerender } = render(
      <Provider store={firstStore}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })

    // Act: swap the store, then change BOTH stores.
    rerender(
      <Provider store={secondStore}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
    firstStore.dispatch(setShowInMenuBar(false))
    secondStore.dispatch(setHideAppIcon(false))

    // Assert: first store's mount push, second store's re-push, then its change.
    await waitFor(() => {
      expect(setHideAppIconMock.mock.calls).toEqual([[false], [true], [false]])
    })
    // The abandoned store's tray change never reaches main.
    expect(setShowInMenuBarMock.mock.calls).toEqual([[true], [true]])
  })

  test.each([
    ['undefined', undefined],
    ['a bare true', true],
    ['a plain object', {}],
  ])(
    'does not throw when an older preload returns %s instead of a promise from setHideAppIcon',
    async (_returnLabel, nonPromiseReturn) => {
      // A frozen preload is not bound to today's `Promise<boolean>` contract. Any
      // non-promise value must be absorbed: calling `.then` on `true` is a
      // TypeError that escapes the effect to global-error and blanks every route.
      // Arrange
      setHideAppIconMock.mockReturnValueOnce(nonPromiseReturn)
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      // Act + Assert: mounting stays quiet and the independent menu-bar sync runs.
      expect(() =>
        render(
          wrapWithStore(<ElectronStartupSync />, {
            hideAppIcon: true,
            showInMenuBar: true,
          }),
        ),
      ).not.toThrow()
      await waitFor(() => {
        expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)
      })
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
      expect(consoleErrorSpy).not.toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    },
  )

  test('logs an error when an older preload returns a bare false instead of a promise', async () => {
    // `false` is the bridge's failure signal whether or not it arrives wrapped in
    // a promise, so a synchronous `false` must be reported, not treated as ok.
    // Arrange
    setHideAppIconMock.mockReturnValueOnce(false)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act
    render(
      wrapWithStore(<ElectronStartupSync />, {
        hideAppIcon: true,
        showInMenuBar: true,
      }),
    )

    // Assert
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon: IPC returned false',
      )
    })

    consoleErrorSpy.mockRestore()
  })

  test('does not blank the app when setHideAppIcon throws synchronously on mount', async () => {
    // A bridge method can throw before it ever returns a promise (torn-down
    // context, argument validation). Mounted in the root layout, that throw would
    // escape the effect to global-error — it must be logged instead, and must not
    // stop the independent menu-bar sync.
    // Arrange
    const bridgeError = new Error('contextBridge call failed')
    setHideAppIconMock.mockImplementationOnce(() => {
      throw bridgeError
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act + Assert
    expect(() =>
      render(
        wrapWithStore(<ElectronStartupSync />, {
          hideAppIcon: true,
          showInMenuBar: true,
        }),
      ),
    ).not.toThrow()
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon:',
        bridgeError,
      )
    })
    expect(setShowInMenuBarMock).toHaveBeenCalledWith(true)

    consoleErrorSpy.mockRestore()
  })

  test('keeps a Settings toggle working when setHideAppIcon throws synchronously after mount', async () => {
    // The sync runs inside a Redux subscriber. Redux calls subscribers with no
    // try/catch, so a throw there escapes `store.dispatch()` into the toggle's
    // click handler AND skips every subscriber registered after this one.
    // Arrange
    const bridgeError = new Error('contextBridge call failed')
    const store = buildStore({ hideAppIcon: false, showInMenuBar: true })
    render(
      <Provider store={store}>
        <ElectronStartupSync />
      </Provider>,
    )
    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })
    // Registered after the sync, so Redux notifies it after the sync.
    const laterSubscriber = vi.fn()
    store.subscribe(laterSubscriber)
    setHideAppIconMock.mockImplementationOnce(() => {
      throw bridgeError
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act + Assert: the dispatch the Settings toggle makes must not throw.
    expect(() => store.dispatch(setHideAppIcon(true))).not.toThrow()

    // Assert: the toggle took effect, later subscribers still ran, failure logged.
    expect(store.getState().electronSettings.hideAppIcon).toBe(true)
    expect(laterSubscriber).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ElectronStartupSync] Failed to sync hideAppIcon:',
        bridgeError,
      )
    })

    consoleErrorSpy.mockRestore()
  })
})

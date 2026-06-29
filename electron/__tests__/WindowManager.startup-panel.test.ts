/**
 * @fileoverview Startup auxiliary-panel nav-watch tests.
 *
 * Exercises `WindowManager.openStartupPanel` — the auth gate that decides, from
 * a panel's first navigation, whether to reveal the panel or suppress it and
 * surface the Floating front door so the user can sign in. Covers the
 * redirect-to-auth, load-failure, and post-login re-show paths flagged as
 * failure modes F3/F4.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowManager.startup-panel
 */
// The mocked electron `dialog`, asserted on by the DT7 recovery tests (the
// `vi.mock('electron')` factory below is hoisted above this import by Vitest).
import { dialog } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Spy = ReturnType<typeof vi.fn>

/** Minimal mock of the BrowserWindow surface WindowManager touches at startup. */
interface MockBrowserWindow {
  show: Spy
  hide: Spy
  focus: Spy
  restore: Spy
  minimize: Spy
  isMinimized: Spy
  isVisible: Spy
  isDestroyed: Spy
  setOpacity: Spy
  getOpacity: Spy
  setVisibleOnAllWorkspaces: Spy
  loadURL: Spy
  close: Spy
  on: Spy
  once: Spy
  webContents: {
    on: Spy
    removeListener: Spy
    loadURL: Spy
    reload: Spy
    send: Spy
    openDevTools: Spy
    getURL: Spy
  }
}

/**
 * Each created window plus helpers to fire the webContents events the real
 * Electron runtime would emit (which never fire under Vitest).
 */
interface CapturedMockWindow {
  win: MockBrowserWindow
  fireWebContents: (event: string, ...args: unknown[]) => void
}

const createdWindows: CapturedMockWindow[] = []

// BrowserWindow mock: returns a plain instance and records the webContents
// listeners WindowManager registers, so tests can fire did-navigate/did-fail-load.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    const webHandlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    let currentUrl = ''
    const win: MockBrowserWindow = {
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      restore: vi.fn(),
      minimize: vi.fn(),
      isMinimized: vi.fn(() => false),
      isVisible: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      setOpacity: vi.fn(),
      getOpacity: vi.fn(() => 1),
      setVisibleOnAllWorkspaces: vi.fn(),
      loadURL: vi.fn((url: string) => {
        currentUrl = url
      }),
      close: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      webContents: {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          const handlers = webHandlers[event] ?? []
          handlers.push(handler)
          webHandlers[event] = handlers
        }),
        removeListener: vi.fn(
          (event: string, handler: (...args: unknown[]) => void) => {
            const handlers = webHandlers[event]
            if (handlers) {
              webHandlers[event] = handlers.filter(
                (registered) => registered !== handler,
              )
            }
          },
        ),
        loadURL: vi.fn((url: string) => {
          currentUrl = url
        }),
        reload: vi.fn(),
        send: vi.fn(),
        openDevTools: vi.fn(),
        getURL: vi.fn(() => currentUrl),
      },
    }
    createdWindows.push({
      win,
      fireWebContents: (event: string, ...args: unknown[]) => {
        const navigatedUrl = args[1]
        if (event === 'did-navigate' && typeof navigatedUrl === 'string') {
          currentUrl = navigatedUrl
        }
        ;(webHandlers[event] ?? []).forEach((handler) => handler(...args))
      },
    })
    return win
  }),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
  // DT7 recovery dialog. Defaults to "Close" (response 1) so the exhaustion
  // path never loops back into a reload unless a test opts into "Retry".
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 })),
  },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imported after the mocks so WindowManager's `import { BrowserWindow }` is stubbed.
import { WindowManager } from '../WindowManager'

const SERVER_URL = 'https://corelive.app'

/**
 * Returns the Nth created window, failing the test if none exists. Narrows away
 * the `| undefined` that `noUncheckedIndexedAccess` adds to array indexing.
 *
 * @param index - Zero-based creation order. With the main window retired (T18),
 * [0] = the startup panel the gate opens (the floating / braindump window).
 */
function getWindow(index: number): CapturedMockWindow {
  const capturedWindow = createdWindows[index]
  if (!capturedWindow) {
    throw new Error(`Expected a created window at index ${index}`)
  }
  return capturedWindow
}

describe('WindowManager startup panel nav-watch', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a signed-out floating panel hidden and surfaces the Floating front door', () => {
    // Arrange: panel-only cold boot, then open the panel.
    const windowManager = new WindowManager(SERVER_URL)
    // With the main window retired (T18), the signed-out gate surfaces the
    // Floating navigator (the public OAuth front door) via restoreFromTray.
    // Stub it so this unit asserts the delegation, not restoreFromTray's own job.
    const restoreFromTray = vi
      .spyOn(windowManager, 'restoreFromTray')
      .mockImplementation(() => {})
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: proxy.ts redirected the unauthenticated panel load to /login.
    panelWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/login?redirect_url=/floating-navigator`,
    )

    // Assert: panel stays hidden, the Floating front door is surfaced, fallback recorded.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(restoreFromTray).toHaveBeenCalledTimes(1)
    expect(windowManager.getStartupAuthFallbacks().has('floating')).toBe(true)
  })

  it('waits for the panel load to settle so auth redirects can win', () => {
    // Arrange: panel-only cold boot starts at the requested panel route.
    const windowManager = new WindowManager(SERVER_URL)
    // T18: signed-out → Floating front door via restoreFromTray (stubbed).
    const restoreFromTray = vi
      .spyOn(windowManager, 'restoreFromTray')
      .mockImplementation(() => {})
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: Chromium first reports the requested URL, then proxy.ts redirects
    // to /login before the load settles.
    panelWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/floating-navigator`,
    )
    panelWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/login?redirect_url=/floating-navigator`,
    )

    // Assert: the panel was never revealed from the transient panel URL; the
    // Floating front door is surfaced instead of main.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(restoreFromTray).toHaveBeenCalledTimes(1)
    expect(windowManager.getStartupAuthFallbacks().has('floating')).toBe(true)
  })

  it('treats a /sign-up landing as unauthenticated and surfaces the Floating front door', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    // T18: signed-out → Floating front door via restoreFromTray (stubbed).
    const restoreFromTray = vi
      .spyOn(windowManager, 'restoreFromTray')
      .mockImplementation(() => {})
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: the panel ended up on the sign-up page.
    panelWindow.fireWebContents('did-navigate', {}, `${SERVER_URL}/sign-up`)

    // Assert
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(restoreFromTray).toHaveBeenCalledTimes(1)
    expect(windowManager.getStartupAuthFallbacks().has('floating')).toBe(true)
  })

  it('shows the floating panel when its load lands on the panel route', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: authenticated load renders the real panel.
    panelWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/floating-navigator`,
    )
    panelWindow.fireWebContents('did-finish-load')

    // Assert: panel revealed, no fallback recorded.
    expect(panelWindow.win.show).toHaveBeenCalledTimes(1)
    expect(windowManager.getStartupAuthFallbacks().size).toBe(0)
  })

  it('surfaces the Floating front door when a braindump panel fails to load (offline/5xx)', () => {
    // Arrange: braindump has no load-failure recovery of its own, so a failed
    // load falls back to the Floating front door (the Floating window owns DT7).
    const windowManager = new WindowManager(SERVER_URL)
    // T18: signed-out / load-fail → Floating front door via restoreFromTray (stubbed).
    const restoreFromTray = vi
      .spyOn(windowManager, 'restoreFromTray')
      .mockImplementation(() => {})
    windowManager.openStartupPanel('braindump')
    const panelWindow = getWindow(0)

    // Act: main-frame load failure, e.g. net::ERR_NAME_NOT_RESOLVED (-105).
    panelWindow.fireWebContents(
      'did-fail-load',
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      `${SERVER_URL}/braindump`,
      true,
    )

    // Assert: failed panel stays hidden, the Floating front door is surfaced, fallback recorded.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(restoreFromTray).toHaveBeenCalledTimes(1)
    expect(windowManager.getStartupAuthFallbacks().has('braindump')).toBe(true)
  })

  it('ignores an aborted load (ERR_ABORTED) during the redirect chain', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: ERR_ABORTED (-3) fires when a navigation is intentionally cancelled.
    panelWindow.fireWebContents(
      'did-fail-load',
      {},
      -3,
      'ERR_ABORTED',
      `${SERVER_URL}/floating-navigator`,
      true,
    )

    // Assert: no decision made — the panel was not shown, no fallback recorded.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(windowManager.getStartupAuthFallbacks().size).toBe(0)
  })

  it('ignores subresource load failures (isMainFrame false)', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: a sub-frame/asset failed, not the document itself.
    panelWindow.fireWebContents(
      'did-fail-load',
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      `${SERVER_URL}/some-asset.png`,
      false,
    )

    // Assert: the panel's fate is undecided; it was not shown, no fallback.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(windowManager.getStartupAuthFallbacks().size).toBe(0)
  })

  it('opens the brain dump panel at its own route when requested', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // Act: dispatch by kind creates the brain dump window and watches its load.
    windowManager.openStartupPanel('braindump')
    const panelWindow = getWindow(0)
    panelWindow.fireWebContents('did-navigate', {}, `${SERVER_URL}/braindump`)
    panelWindow.fireWebContents('did-finish-load')

    // Assert: brain dump loaded its route and was revealed once authenticated.
    expect(panelWindow.win.loadURL).toHaveBeenCalledWith(
      `${SERVER_URL}/braindump`,
    )
    expect(panelWindow.win.show).toHaveBeenCalledTimes(1)
  })

  it('keeps a signed-out manual BrainDump open hidden and surfaces the Floating front door', () => {
    // Arrange: a menu/shortcut/manual BrainDump open does not go through the
    // startup-only gate, so WindowManager must guard this path itself.
    const windowManager = new WindowManager(SERVER_URL)
    const restoreFromTray = vi
      .spyOn(windowManager, 'restoreFromTray')
      .mockImplementation(() => {})

    // Act: proxy.ts redirected the protected BrainDump route to /login.
    windowManager.showBrainDump()
    const brainDumpWindow = getWindow(0)
    brainDumpWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/login?redirect_url=/braindump`,
    )

    // Assert: login never renders in BrainDump; Floating becomes the sign-in front door.
    expect(brainDumpWindow.win.show).not.toHaveBeenCalled()
    expect(brainDumpWindow.win.focus).not.toHaveBeenCalled()
    expect(restoreFromTray).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending manual BrainDump reveal when toggled off before load settles', () => {
    // Arrange: the first toggle starts a hidden BrainDump load guarded by the
    // manual auth watcher, but the route has not settled yet.
    const windowManager = new WindowManager(SERVER_URL)
    const firstToggleResult = windowManager.toggleBrainDump()
    const brainDumpWindow = getWindow(0)

    // Act: a second toggle before did-finish-load means the caller intended to
    // close the pending reveal, then the original load completes successfully.
    const secondToggleResult = windowManager.toggleBrainDump()
    brainDumpWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/braindump`,
    )
    brainDumpWindow.fireWebContents('did-finish-load')

    // Assert: the stale load callback cannot show/focus BrainDump after cancel.
    expect(firstToggleResult).toBe(true)
    expect(secondToggleResult).toBe(false)
    expect(brainDumpWindow.win.hide).toHaveBeenCalledTimes(1)
    expect(brainDumpWindow.win.show).not.toHaveBeenCalled()
    expect(brainDumpWindow.win.focus).not.toHaveBeenCalled()
  })

  it('reloads a suppressed BrainDump back to its route before revealing it after sign-in', () => {
    // Arrange: the first open is signed out, leaving the hidden BrainDump window
    // sitting on /login until the user signs in from Floating Navigator.
    const windowManager = new WindowManager(SERVER_URL)
    vi.spyOn(windowManager, 'restoreFromTray').mockImplementation(() => {})
    windowManager.showBrainDump()
    const brainDumpWindow = getWindow(0)
    brainDumpWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/login?redirect_url=/braindump`,
    )

    // Act: after sign-in, opening BrainDump again reloads /braindump and waits
    // for that protected route to settle before showing the panel.
    windowManager.showBrainDump()
    brainDumpWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/braindump`,
    )
    brainDumpWindow.fireWebContents('did-finish-load')

    // Assert: the stale /login host was not shown; the real editor route was.
    expect(brainDumpWindow.win.loadURL).toHaveBeenNthCalledWith(
      1,
      `${SERVER_URL}/braindump`,
    )
    expect(brainDumpWindow.win.loadURL).toHaveBeenNthCalledWith(
      2,
      `${SERVER_URL}/braindump`,
    )
    expect(brainDumpWindow.win.show).toHaveBeenCalledTimes(1)
    expect(brainDumpWindow.win.focus).toHaveBeenCalledTimes(1)
  })

  it('locks in the first navigation decision and ignores a later load failure', () => {
    // Arrange: a panel-only cold boot.
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.openStartupPanel('floating')
    const panelWindow = getWindow(0)

    // Act: the panel lands on its real route (authed → shown), then a late
    // did-fail-load arrives for the same panel load.
    panelWindow.fireWebContents(
      'did-navigate',
      {},
      `${SERVER_URL}/floating-navigator`,
    )
    panelWindow.fireWebContents('did-finish-load')
    panelWindow.fireWebContents(
      'did-fail-load',
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      `${SERVER_URL}/floating-navigator`,
      true,
    )

    // Assert: the first decision stands — the panel was shown once and no
    // fallback was recorded by the stale second event.
    expect(panelWindow.win.show).toHaveBeenCalledTimes(1)
    expect(windowManager.getStartupAuthFallbacks().size).toBe(0)
  })

  // DT7: the Floating window is the signed-out front door, so a never-loaded
  // window must self-heal (retry, then a native recovery dialog) instead of
  // stranding the user on a blank panel. These exercise the recovery machine in
  // `createFloatingNavigator` plus the asymmetry vs. braindump's fallback.
  describe('Floating load-failure recovery (DT7)', () => {
    // Fake timers so the backoff reload retries can be driven deterministically;
    // clear any pending timer between cases so a scheduled retry never leaks.
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
    })

    /** Fire a real main-frame load failure (net::ERR_NAME_NOT_RESOLVED). */
    function fireFloatingLoadFailure(panel: CapturedMockWindow): void {
      panel.fireWebContents(
        'did-fail-load',
        {},
        -105,
        'ERR_NAME_NOT_RESOLVED',
        `${SERVER_URL}/floating-navigator`,
        true,
      )
    }

    it('retries the failed load and surfaces a native recovery dialog once retries are exhausted', async () => {
      // Arrange: a Floating window whose load keeps failing (offline).
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createFloatingNavigator()
      const floating = getWindow(0)

      // Act: each failure schedules one backed-off reload; flush it, then fail
      // again. FLOATING_LOAD_MAX_RETRIES = 3, so the 4th failure exhausts them.
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers() // retry 1
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers() // retry 2
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers() // retry 3
      fireFloatingLoadFailure(floating) // exhausted → recovery dialog
      await vi.runOnlyPendingTimersAsync() // settle the awaited dialog promise

      // Assert: it actively retried 3× (positive recovery, not a dead window),
      // and on exhaustion it SHOWED the window before opening the native dialog
      // (a sheet on a hidden window may never render on macOS). The default
      // "Close" choice then dismisses the window without quitting the app.
      expect(floating.win.webContents.loadURL).toHaveBeenCalledTimes(3)
      expect(floating.win.webContents.loadURL).toHaveBeenLastCalledWith(
        `${SERVER_URL}/floating-navigator`,
      )
      expect(floating.win.show).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
      expect(floating.win.close).toHaveBeenCalledTimes(1)
    })

    it('binds the retry timer to the window that failed, not its replacement', () => {
      // Arrange: a Floating window fails once, scheduling a backed-off reload.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createFloatingNavigator()
      const firstFloating = getWindow(0)
      fireFloatingLoadFailure(firstFloating)

      // The window closes and a fresh Floating window replaces it before the
      // backoff fires. createFloatingNavigator() bails while the old reference
      // is still set, and the harness doesn't replay the window-level `closed`
      // event, so null the reference (what the real `closed` handler does) and
      // then create the replacement.
      ;(
        windowManager as unknown as { floatingNavigator: unknown }
      ).floatingNavigator = null
      windowManager.createFloatingNavigator()
      const secondFloating = getWindow(1)

      // Act: the stale timer from the FIRST window fires.
      vi.runOnlyPendingTimers()

      // Assert: it does not reload the replacement — a stale retry must never
      // corrupt the recovery state of a window that never failed.
      expect(secondFloating.win.webContents.loadURL).not.toHaveBeenCalled()
    })

    it('reloads the panel after a single failure instead of giving up immediately', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createFloatingNavigator()
      const floating = getWindow(0)

      // Act: one failure, then let the backoff timer fire.
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers()

      // Assert: it reloaded the panel route and did NOT jump straight to the
      // recovery dialog.
      expect(floating.win.webContents.loadURL).toHaveBeenCalledWith(
        `${SERVER_URL}/floating-navigator`,
      )
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('stops main-process retries once the floating window has loaded successfully', () => {
      // Arrange: the panel loaded once, so its renderer is alive.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createFloatingNavigator()
      const floating = getWindow(0)
      floating.fireWebContents('did-finish-load')

      // Act: a later transient main-frame failure arrives.
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers()

      // Assert: no main-process retry and no dialog — a live renderer owns its
      // own error states (this also guards against a stale did-fail-load for an
      // already-settled load triggering a spurious reload).
      expect(floating.win.webContents.loadURL).not.toHaveBeenCalled()
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('defers to DT7 when a startup floating panel fails to load (no auth fallback)', () => {
      // Arrange: panel-only cold boot opens the Floating startup panel.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.openStartupPanel('floating')
      const panelWindow = getWindow(0)

      // Act: the floating panel's first load fails.
      fireFloatingLoadFailure(panelWindow)

      // Assert: unlike braindump, the floating startup gate defers to DT7 — it
      // does not force the panel open or record an auth fallback; recovery is
      // the Floating window's own job (retry, then native dialog).
      expect(panelWindow.win.show).not.toHaveBeenCalled()
      expect(windowManager.getStartupAuthFallbacks().has('floating')).toBe(
        false,
      )
    })

    it('restarts the recovery cycle when the user picks Retry in the dialog', async () => {
      // Arrange: the dialog will return "Retry" (response 0) this time.
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
        response: 0,
        checkboxChecked: false,
      })
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createFloatingNavigator()
      const floating = getWindow(0)

      // Act: exhaust the retries to open the dialog, then let the Retry handler run.
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers()
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers()
      fireFloatingLoadFailure(floating)
      vi.runOnlyPendingTimers()
      fireFloatingLoadFailure(floating) // exhausted → dialog opens
      await vi.runOnlyPendingTimersAsync() // flush the awaited dialog promise

      // Assert: Retry reloaded the panel a 4th time (3 backoff retries + the
      // explicit user retry), restarting the recovery from a clean slate.
      expect(floating.win.webContents.loadURL).toHaveBeenCalledTimes(4)
    })

    it('keeps retrying when Chromium commits an error page (did-finish-load) after each failure', async () => {
      // Arrange: a Floating window whose load keeps failing (offline). Unlike the
      // other DT7 cases, the REAL Electron runtime commits a chrome-error page
      // after every main-frame failure and fires did-finish-load for THAT page.
      // The error page is not the app, so it must NOT latch floatingHasLoadedOnce
      // (which would early-return every later did-fail-load and silence recovery,
      // stranding a permanently blank signed-out front door). Regression for the
      // bug T20 native QA surfaced: 2 failures then a dead window, no dialog.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createFloatingNavigator()
      const floating = getWindow(0)

      // Act: interleave the error-page did-finish-load the runtime emits after
      // each failure with the backoff retries. 3 retries, then the 4th failure
      // exhausts the budget and opens the native dialog.
      fireFloatingLoadFailure(floating)
      floating.fireWebContents('did-finish-load') // chrome-error page settles
      vi.runOnlyPendingTimers() // retry 1
      fireFloatingLoadFailure(floating)
      floating.fireWebContents('did-finish-load')
      vi.runOnlyPendingTimers() // retry 2
      fireFloatingLoadFailure(floating)
      floating.fireWebContents('did-finish-load')
      vi.runOnlyPendingTimers() // retry 3
      fireFloatingLoadFailure(floating) // exhausted → recovery dialog
      floating.fireWebContents('did-finish-load')
      await vi.runOnlyPendingTimersAsync() // settle the awaited dialog promise

      // Assert: recovery survived the interleaved error-page finishes — it still
      // retried 3× and surfaced the native dialog, identical to the no-finish run.
      expect(floating.win.webContents.loadURL).toHaveBeenCalledTimes(3)
      expect(floating.win.show).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    })
  })
})

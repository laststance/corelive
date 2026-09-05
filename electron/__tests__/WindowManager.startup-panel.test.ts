/**
 * @fileoverview LiveEditor startup / login-window handoff tests.
 *
 * Exercises `WindowManager.openStartupPanel`, `restoreFromTray`, the login
 * window (`showLoginWindow` / `completeLogin` / `clearLoginHandoff`) and the
 * shared panel load-failure recovery (DT7 generalized to both the login window
 * and LiveEditor, including HTTP 4xx/5xx pages that Chromium reports through
 * `did-navigate`, never `did-fail-load`).
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowManager.startup-panel
 */
// The mocked electron `dialog`, asserted on by the recovery tests (the
// `vi.mock('electron')` factory below is hoisted above this import by Vitest).
import { dialog, type WebContents } from 'electron'
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
  // Recovery dialog. Defaults to "Close" (response 1) so the exhaustion path
  // never loops back into a reload unless a test opts into "Retry".
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
const LIVE_EDITOR_URL = `${SERVER_URL}/live-editor`
const LOGIN_SHELL_URL = `${SERVER_URL}/login-shell`
const LOGIN_REDIRECT_URL = `${SERVER_URL}/login?redirect_url=/live-editor`

/**
 * Returns the Nth created window, failing the test if none exists. Narrows away
 * the `| undefined` that `noUncheckedIndexedAccess` adds to array indexing.
 *
 * @param index - Zero-based creation order.
 */
function getWindow(index: number): CapturedMockWindow {
  const capturedWindow = createdWindows[index]
  if (!capturedWindow) {
    throw new Error(`Expected a created window at index ${index}`)
  }
  return capturedWindow
}

/** The mock's webContents, typed as the real sender `completeLogin` receives. */
function senderOf(window: CapturedMockWindow): WebContents {
  return window.win.webContents as unknown as WebContents
}

/** Fire a real main-frame network load failure (net::ERR_NAME_NOT_RESOLVED). */
function fireNetworkLoadFailure(
  panel: CapturedMockWindow,
  failedUrl: string,
): void {
  panel.fireWebContents(
    'did-fail-load',
    {},
    -105,
    'ERR_NAME_NOT_RESOLVED',
    failedUrl,
    true,
  )
}

/** Fire the `did-navigate` Chromium emits for an HTTP error page (a SUCCESSFUL navigation). */
function fireHttpErrorNavigation(
  panel: CapturedMockWindow,
  url: string,
  httpStatus: number,
): void {
  panel.fireWebContents('did-navigate', {}, url, httpStatus, 'Error')
}

describe('WindowManager startup panel nav-watch', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a signed-out startup LiveEditor hidden and opens the login window instead', () => {
    // Arrange: cold boot opens the LiveEditor panel hidden.
    const windowManager = new WindowManager(SERVER_URL)
    // Stub the login window so this unit asserts the delegation, not its own job.
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)

    // Act: proxy.ts redirected the unauthenticated panel load to /login.
    panelWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)

    // Assert: panel stays hidden, the login window is surfaced, fallback recorded.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(showLoginWindow).toHaveBeenCalledTimes(1)
    expect(windowManager.hasStartupAuthFallback()).toBe(true)
  })

  it('waits for the panel load to settle so auth redirects can win', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)

    // Act: Chromium first reports the requested URL, then proxy.ts redirects
    // to /login before the load settles.
    panelWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    panelWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)

    // Assert: never revealed from the transient panel URL; login window instead.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(showLoginWindow).toHaveBeenCalledTimes(1)
    expect(windowManager.hasStartupAuthFallback()).toBe(true)
  })

  it('treats a /sign-up landing as unauthenticated and opens the login window', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)

    // Act: the panel ended up on the sign-up page.
    panelWindow.fireWebContents('did-navigate', {}, `${SERVER_URL}/sign-up`)

    // Assert
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(showLoginWindow).toHaveBeenCalledTimes(1)
    expect(windowManager.hasStartupAuthFallback()).toBe(true)
  })

  it('opens the login window when the startup LiveEditor load fails (offline)', () => {
    // Arrange: LiveEditor has no network-failure recovery of its own, so a
    // failed load falls back to the login window (which owns the retry dialog).
    const windowManager = new WindowManager(SERVER_URL)
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)

    // Act: main-frame load failure, e.g. net::ERR_NAME_NOT_RESOLVED (-105).
    fireNetworkLoadFailure(panelWindow, LIVE_EDITOR_URL)

    // Assert: failed panel stays hidden, login window surfaced, fallback recorded.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(showLoginWindow).toHaveBeenCalledTimes(1)
    expect(windowManager.hasStartupAuthFallback()).toBe(true)
  })

  it('ignores an aborted load (ERR_ABORTED) during the redirect chain', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)

    // Act: ERR_ABORTED (-3) fires when a navigation is intentionally cancelled.
    panelWindow.fireWebContents(
      'did-fail-load',
      {},
      -3,
      'ERR_ABORTED',
      LIVE_EDITOR_URL,
      true,
    )

    // Assert: no decision made — the panel was not shown, no fallback recorded.
    expect(panelWindow.win.show).not.toHaveBeenCalled()
    expect(windowManager.hasStartupAuthFallback()).toBe(false)
  })

  it('ignores subresource load failures (isMainFrame false)', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.openStartupPanel()
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
    expect(windowManager.hasStartupAuthFallback()).toBe(false)
  })

  it('opens the LiveEditor panel at its own route on startup and reveals it once authenticated', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)

    // Act: startup creates the LiveEditor window hidden and watches its load.
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)
    panelWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    panelWindow.fireWebContents('did-finish-load')

    // Assert: LiveEditor loaded its route and was revealed, no fallback recorded.
    expect(panelWindow.win.loadURL).toHaveBeenCalledWith(LIVE_EDITOR_URL)
    expect(panelWindow.win.show).toHaveBeenCalledTimes(1)
    expect(windowManager.hasStartupAuthFallback()).toBe(false)
    expect(createdWindows).toHaveLength(1)
  })

  it('keeps a signed-out manual LiveEditor open hidden and opens the login window', () => {
    // Arrange: a menu/shortcut/manual LiveEditor open does not go through the
    // startup-only gate, so WindowManager must guard this path itself.
    const windowManager = new WindowManager(SERVER_URL)
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})

    // Act: proxy.ts redirected the protected LiveEditor route to /login.
    windowManager.showLiveEditor()
    const liveEditorWindow = getWindow(0)
    liveEditorWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)

    // Assert: login never renders in LiveEditor; the login window is the sign-in surface.
    expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
    expect(liveEditorWindow.win.focus).not.toHaveBeenCalled()
    expect(showLoginWindow).toHaveBeenCalledTimes(1)
  })

  it('reports a shortcut LiveEditor open only after the authenticated panel is visible', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    const onShown = vi.fn()

    // Act
    windowManager.toggleLiveEditor(onShown)
    const liveEditorWindow = getWindow(0)

    // Assert
    expect(onShown).not.toHaveBeenCalled()

    // Act
    liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    liveEditorWindow.fireWebContents('did-finish-load')

    // Assert
    expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
    expect(onShown).toHaveBeenCalledTimes(1)
  })

  it('does not report a shortcut LiveEditor open when auth keeps the panel hidden', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    vi.spyOn(windowManager, 'showLoginWindow').mockImplementation(() => {})
    const onShown = vi.fn()

    // Act
    windowManager.toggleLiveEditor(onShown)
    const liveEditorWindow = getWindow(0)
    liveEditorWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)

    // Assert
    expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
    expect(onShown).not.toHaveBeenCalled()
  })

  it('cancels a pending manual LiveEditor reveal when toggled off before load settles', () => {
    // Arrange: the first toggle starts a hidden LiveEditor load guarded by the
    // manual auth watcher, but the route has not settled yet.
    const windowManager = new WindowManager(SERVER_URL)
    const firstToggleResult = windowManager.toggleLiveEditor()
    const liveEditorWindow = getWindow(0)

    // Act: a second toggle before did-finish-load means the caller intended to
    // close the pending reveal, then the original load completes successfully.
    const secondToggleResult = windowManager.toggleLiveEditor()
    liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    liveEditorWindow.fireWebContents('did-finish-load')

    // Assert: the stale load callback cannot show/focus LiveEditor after cancel.
    expect(firstToggleResult).toBe(true)
    expect(secondToggleResult).toBe(false)
    expect(liveEditorWindow.win.hide).toHaveBeenCalledTimes(1)
    expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
    expect(liveEditorWindow.win.focus).not.toHaveBeenCalled()
  })

  it('keeps LiveEditor hidden when app cleanup interrupts a pending reveal', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    const onShown = vi.fn()
    windowManager.toggleLiveEditor(onShown)
    const liveEditorWindow = getWindow(0)

    // Act
    windowManager.cleanup()
    liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    liveEditorWindow.fireWebContents('did-finish-load')

    // Assert
    expect(liveEditorWindow.win.close).toHaveBeenCalledTimes(1)
    expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
    expect(liveEditorWindow.win.focus).not.toHaveBeenCalled()
    expect(onShown).not.toHaveBeenCalled()
  })

  it('does not reveal or open the login window when startup loads settle after cleanup', () => {
    // Arrange
    const windowManager = new WindowManager(SERVER_URL)
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})
    windowManager.openStartupPanel()
    const liveEditorWindow = getWindow(0)

    // Act
    windowManager.cleanup()
    liveEditorWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)
    liveEditorWindow.fireWebContents('did-finish-load')

    // Assert
    expect(liveEditorWindow.win.close).toHaveBeenCalledTimes(1)
    expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
    expect(showLoginWindow).not.toHaveBeenCalled()
  })

  it('reloads LiveEditor on the next open after canceling a pending reveal', () => {
    // Arrange: a hidden LiveEditor load is canceled, then the old navigation
    // settles after its listeners were removed.
    const windowManager = new WindowManager(SERVER_URL)
    windowManager.toggleLiveEditor()
    const liveEditorWindow = getWindow(0)
    windowManager.toggleLiveEditor()
    liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    liveEditorWindow.fireWebContents('did-finish-load')
    liveEditorWindow.win.show.mockClear()
    liveEditorWindow.win.focus.mockClear()

    // Act: the next open must start a fresh protected-route load before reveal.
    windowManager.showLiveEditor()
    liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    liveEditorWindow.fireWebContents('did-finish-load')

    // Assert: the canceled settled page was reloaded, then safely revealed.
    expect(liveEditorWindow.win.loadURL).toHaveBeenNthCalledWith(
      1,
      LIVE_EDITOR_URL,
    )
    expect(liveEditorWindow.win.loadURL).toHaveBeenNthCalledWith(
      2,
      LIVE_EDITOR_URL,
    )
    expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
    expect(liveEditorWindow.win.focus).toHaveBeenCalledTimes(1)
  })

  it('reloads a suppressed LiveEditor back to its route before revealing it after sign-in', () => {
    // Arrange: the first open is signed out, leaving the hidden LiveEditor window
    // sitting on /login until the user signs in from the login window.
    const windowManager = new WindowManager(SERVER_URL)
    vi.spyOn(windowManager, 'showLoginWindow').mockImplementation(() => {})
    windowManager.showLiveEditor()
    const liveEditorWindow = getWindow(0)
    liveEditorWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)

    // Act: after sign-in, opening LiveEditor again reloads /live-editor and waits
    // for that protected route to settle before showing the panel.
    windowManager.showLiveEditor()
    liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    liveEditorWindow.fireWebContents('did-finish-load')

    // Assert: the stale /login host was not shown; the real editor route was.
    expect(liveEditorWindow.win.loadURL).toHaveBeenNthCalledWith(
      1,
      LIVE_EDITOR_URL,
    )
    expect(liveEditorWindow.win.loadURL).toHaveBeenNthCalledWith(
      2,
      LIVE_EDITOR_URL,
    )
    expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
    expect(liveEditorWindow.win.focus).toHaveBeenCalledTimes(1)
  })

  it('locks in the first navigation decision and ignores a later load failure', () => {
    // Arrange: a panel-only cold boot.
    const windowManager = new WindowManager(SERVER_URL)
    const showLoginWindow = vi
      .spyOn(windowManager, 'showLoginWindow')
      .mockImplementation(() => {})
    windowManager.openStartupPanel()
    const panelWindow = getWindow(0)

    // Act: the panel lands on its real route (authed → shown), then a late
    // did-fail-load arrives for the same panel load.
    panelWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
    panelWindow.fireWebContents('did-finish-load')
    fireNetworkLoadFailure(panelWindow, LIVE_EDITOR_URL)

    // Assert: the first decision stands — the panel was shown once and no
    // fallback was recorded by the stale second event.
    expect(panelWindow.win.show).toHaveBeenCalledTimes(1)
    expect(showLoginWindow).not.toHaveBeenCalled()
    expect(windowManager.hasStartupAuthFallback()).toBe(false)
  })

  describe('restoreFromTray (tray / dock / notification / deep link)', () => {
    it('opens LiveEditor and reveals it once its protected route lands', () => {
      // Arrange: a tray-resident boot — no window has been created yet.
      const windowManager = new WindowManager(SERVER_URL)

      // Act: the shared "surface the app" chokepoint.
      windowManager.restoreFromTray()
      const liveEditorWindow = getWindow(0)
      liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
      liveEditorWindow.fireWebContents('did-finish-load')

      // Assert: LiveEditor was created, loaded its route, shown and focused —
      // and nothing else was created.
      expect(liveEditorWindow.win.loadURL).toHaveBeenCalledWith(LIVE_EDITOR_URL)
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
      expect(liveEditorWindow.win.focus).toHaveBeenCalledTimes(1)
      expect(createdWindows).toHaveLength(1)
    })

    it('opens the real login window instead of LiveEditor while signed out (regression)', () => {
      // Arrange: signed-out tray click. No spies — this proves the fallback
      // creates and shows a real /login-shell window, not a stub.
      const windowManager = new WindowManager(SERVER_URL)

      // Act: LiveEditor bounces to /login.
      windowManager.restoreFromTray()
      const liveEditorWindow = getWindow(0)
      liveEditorWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)

      // Assert: LiveEditor stays hidden; the second window is the login shell.
      const loginWindow = getWindow(1)
      expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
      expect(loginWindow.win.loadURL).toHaveBeenCalledWith(LOGIN_SHELL_URL)
      expect(loginWindow.win.show).toHaveBeenCalledTimes(1)
      expect(loginWindow.win.focus).toHaveBeenCalledTimes(1)
      expect(windowManager.hasLoginWindow()).toBe(true)
    })
  })

  describe('login window handoff (completeLogin)', () => {
    it('closes the login window and shows LiveEditor when the login window reports sign-in', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLoginWindow()
      const loginWindow = getWindow(0)

      // Act: auth-set-user arrived from the login window's webContents.
      windowManager.completeLogin(senderOf(loginWindow))
      const liveEditorWindow = getWindow(1)
      liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
      liveEditorWindow.fireWebContents('did-finish-load')

      // Assert
      expect(loginWindow.win.close).toHaveBeenCalled()
      expect(liveEditorWindow.win.loadURL).toHaveBeenCalledWith(LIVE_EDITOR_URL)
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
      expect(liveEditorWindow.win.focus).toHaveBeenCalledTimes(1)
    })

    it('ignores a sign-in report from any window other than the login window', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLoginWindow()
      const loginWindow = getWindow(0)
      const showLiveEditor = vi.spyOn(windowManager, 'showLiveEditor')

      // Act: some other webContents (e.g. Settings) synced its user.
      windowManager.completeLogin({} as unknown as WebContents)

      // Assert: nothing happens.
      expect(loginWindow.win.close).not.toHaveBeenCalled()
      expect(showLiveEditor).not.toHaveBeenCalled()
      expect(createdWindows).toHaveLength(1)
    })

    it('does nothing when there is no login window or it is already destroyed', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      const showLiveEditor = vi.spyOn(windowManager, 'showLiveEditor')

      // Act: no login window at all.
      windowManager.completeLogin({} as unknown as WebContents)

      // Assert
      expect(showLiveEditor).not.toHaveBeenCalled()
      expect(createdWindows).toHaveLength(0)

      // Arrange: a login window that was closed (destroyed) before the IPC landed.
      windowManager.showLoginWindow()
      const loginWindow = getWindow(0)
      loginWindow.win.isDestroyed.mockReturnValue(true)

      // Act
      windowManager.completeLogin(senderOf(loginWindow))

      // Assert
      expect(showLiveEditor).not.toHaveBeenCalled()
      expect(loginWindow.win.close).not.toHaveBeenCalled()
    })

    it('ignores a second sign-in report while the first handoff is still pending (no ping-pong)', () => {
      // Arrange: first handoff started; LiveEditor is still loading.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLoginWindow()
      const loginWindow = getWindow(0)
      const showLiveEditor = vi.spyOn(windowManager, 'showLiveEditor')
      windowManager.completeLogin(senderOf(loginWindow))

      // Act: the login window re-sends auth-set-user (e.g. it was re-shown by a
      // LiveEditor load failure and its auth provider re-synced).
      windowManager.completeLogin(senderOf(loginWindow))

      // Assert: exactly one handoff.
      expect(loginWindow.win.close).toHaveBeenCalledTimes(1)
      expect(showLiveEditor).toHaveBeenCalledTimes(1)
    })

    it('hands off again after logout clears the latch, and a successful reveal closes any leftover login window', () => {
      // Arrange: first handoff is pending, then the user logs out.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLoginWindow()
      const loginWindow = getWindow(0)
      const showLiveEditor = vi.spyOn(windowManager, 'showLiveEditor')
      windowManager.completeLogin(senderOf(loginWindow))
      windowManager.clearLoginHandoff()

      // Act: a fresh sign-in from the (still open in the mock) login window.
      windowManager.completeLogin(senderOf(loginWindow))

      // Assert: the latch was cleared, so the handoff ran again.
      expect(showLiveEditor).toHaveBeenCalledTimes(2)

      // Act: LiveEditor finally lands on its route.
      const liveEditorWindow = getWindow(1)
      loginWindow.win.close.mockClear()
      liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
      liveEditorWindow.fireWebContents('did-finish-load')

      // Assert: reveal closes whatever login window is still around.
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
      expect(loginWindow.win.close).toHaveBeenCalledTimes(1)
    })

    it('clears the latch on a cached reveal so a later sign-in can hand off again', () => {
      // Arrange: LiveEditor already loaded once (cached), then it was hidden.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLiveEditor()
      const liveEditorWindow = getWindow(0)
      liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
      liveEditorWindow.fireWebContents('did-finish-load')
      windowManager.hideLiveEditor()
      liveEditorWindow.win.show.mockClear()

      // Act: a login window hands off; showLiveEditor takes the cached branch.
      windowManager.showLoginWindow()
      const firstLoginWindow = getWindow(1)
      windowManager.completeLogin(senderOf(firstLoginWindow))

      // Assert: revealed straight away from cache.
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)

      // Act: the latch must be clear again — a brand-new login window hands off.
      ;(windowManager as unknown as { loginWindow: unknown }).loginWindow = null
      windowManager.showLoginWindow()
      const secondLoginWindow = getWindow(2)
      windowManager.completeLogin(senderOf(secondLoginWindow))

      // Assert
      expect(secondLoginWindow.win.close).toHaveBeenCalledTimes(1)
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(2)
    })

    it('lets a later sign-in hand off again after the toggle shortcut cancels the load a handoff started', () => {
      // Arrange: a handoff is loading LiveEditor hidden.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLoginWindow()
      const loginWindow = getWindow(0)
      windowManager.completeLogin(senderOf(loginWindow))
      const liveEditorWindow = getWindow(1)

      // Act: the toggle shortcut lands mid-load and cancels the pending reveal.
      const didOpen = windowManager.toggleLiveEditor()

      // Assert: cancelled, still hidden.
      expect(didOpen).toBe(false)
      expect(liveEditorWindow.win.show).not.toHaveBeenCalled()

      // Act: the next open bounces to /login (session lost), the login window
      // comes back, and the user signs in again.
      windowManager.toggleLiveEditor()
      liveEditorWindow.fireWebContents('did-navigate', {}, LOGIN_REDIRECT_URL)
      const showLiveEditor = vi.spyOn(windowManager, 'showLiveEditor')
      windowManager.completeLogin(senderOf(loginWindow))

      // Assert: the cancelled handoff released the latch, so this sign-in hands
      // off instead of being ignored with a dead login window on screen.
      expect(loginWindow.win.show).toHaveBeenCalledTimes(2)
      expect(showLiveEditor).toHaveBeenCalledTimes(1)
    })

    it('reuses the existing login window when showLoginWindow runs twice', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)

      // Act
      windowManager.showLoginWindow()
      windowManager.showLoginWindow()

      // Assert: one window, shown + focused each time.
      const loginWindow = getWindow(0)
      expect(createdWindows).toHaveLength(1)
      expect(loginWindow.win.show).toHaveBeenCalledTimes(2)
      expect(loginWindow.win.focus).toHaveBeenCalledTimes(2)
    })
  })

  // Panel load-failure recovery: a never-loaded window must self-heal (retry,
  // then a native recovery dialog) instead of stranding the user on a blank
  // panel. The login window is the signed-out front door; LiveEditor gets the
  // same treatment for HTTP error pages, which Chromium reports as a
  // successful `did-navigate` (never `did-fail-load`).
  describe('panel load-failure recovery', () => {
    // Fake timers so the backoff reload retries can be driven deterministically;
    // clear any pending timer between cases so a scheduled retry never leaks.
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
    })

    it('retries the failed login window load and surfaces a native recovery dialog once retries are exhausted', async () => {
      // Arrange: a login window whose load keeps failing (offline).
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)

      // Act: each failure schedules one backed-off reload; flush it, then fail
      // again. PANEL_LOAD_MAX_RETRIES = 3, so the 4th failure exhausts them.
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers() // retry 1
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers() // retry 2
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers() // retry 3
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL) // exhausted → dialog
      await vi.runOnlyPendingTimersAsync() // settle the awaited dialog promise

      // Assert: it actively retried 3×, SHOWED the window before opening the
      // native dialog (a sheet on a hidden window may never render on macOS),
      // and the default "Close" choice dismissed the window.
      expect(loginWindow.win.webContents.loadURL).toHaveBeenCalledTimes(3)
      expect(loginWindow.win.webContents.loadURL).toHaveBeenLastCalledWith(
        LOGIN_SHELL_URL,
      )
      expect(loginWindow.win.show).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        loginWindow.win,
        expect.objectContaining({
          message: "Couldn't reach corelive.app",
          detail: 'Check your internet connection, then try again.',
        }),
      )
      expect(loginWindow.win.close).toHaveBeenCalledTimes(1)
    })

    it('binds the retry timer to the window that failed, not its replacement', () => {
      // Arrange: a login window fails once, scheduling a backed-off reload.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const firstLoginWindow = getWindow(0)
      fireNetworkLoadFailure(firstLoginWindow, LOGIN_SHELL_URL)

      // The window closes and a fresh login window replaces it before the
      // backoff fires. The harness doesn't replay the window-level `closed`
      // event, so null the reference (what the real `closed` handler does).
      ;(windowManager as unknown as { loginWindow: unknown }).loginWindow = null
      windowManager.createLoginWindow()
      const secondLoginWindow = getWindow(1)

      // Act: the stale timer from the FIRST window fires.
      vi.runOnlyPendingTimers()

      // Assert: it does not reload the replacement.
      expect(secondLoginWindow.win.webContents.loadURL).not.toHaveBeenCalled()
    })

    it('reloads the login window after a single failure instead of giving up immediately', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)

      // Act: one failure, then let the backoff timer fire.
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers()

      // Assert: it reloaded the route and did NOT jump straight to the dialog.
      expect(loginWindow.win.webContents.loadURL).toHaveBeenCalledWith(
        LOGIN_SHELL_URL,
      )
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('stops main-process retries once the login window has loaded successfully', () => {
      // Arrange: the window loaded once, so its renderer is alive.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)
      loginWindow.fireWebContents('did-finish-load')

      // Act: a later transient main-frame failure arrives.
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers()

      // Assert: no main-process retry and no dialog — a live renderer owns its
      // own error states.
      expect(loginWindow.win.webContents.loadURL).not.toHaveBeenCalled()
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('counts a retry that outran the error-page commit as a real load', () => {
      // Arrange: a main-frame failure whose chrome-error page never commits,
      // because the backoff retry's loadURL outraces it. No did-finish-load
      // arrives to consume the pending-error marker.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers() // retry 1 reloads

      // Act: that retry lands — a real 200 navigation, then the page settles.
      loginWindow.fireWebContents(
        'did-navigate',
        {},
        LOGIN_SHELL_URL,
        200,
        'OK',
      )
      loginWindow.fireWebContents('did-finish-load')
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers()

      // Assert: still only the first retry. The successful load registered, so
      // the later transient failure belongs to the live renderer — a stale
      // marker must never strand the window at "never loaded" and pop the
      // recovery dialog over a working, un-closable login page.
      expect(loginWindow.win.webContents.loadURL).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('restarts the recovery cycle when the user picks Retry in the login window dialog', async () => {
      // Arrange: the dialog will return "Retry" (response 0) this time.
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
        response: 0,
        checkboxChecked: false,
      })
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)

      // Act: exhaust the retries to open the dialog, then let Retry run.
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers()
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers()
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      vi.runOnlyPendingTimers()
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL) // exhausted → dialog
      await vi.runOnlyPendingTimersAsync()

      // Assert: Retry reloaded a 4th time (3 backoff retries + the user retry).
      expect(loginWindow.win.webContents.loadURL).toHaveBeenCalledTimes(4)
    })

    it('keeps retrying when Chromium commits an error page (did-finish-load) after each failure', async () => {
      // Arrange: the REAL Electron runtime commits a chrome-error page after
      // every main-frame failure and fires did-finish-load for THAT page. The
      // error page is not the app, so it must NOT latch loaded-once.
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)

      // Act
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      loginWindow.fireWebContents('did-finish-load') // chrome-error page settles
      vi.runOnlyPendingTimers() // retry 1
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      loginWindow.fireWebContents('did-finish-load')
      vi.runOnlyPendingTimers() // retry 2
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL)
      loginWindow.fireWebContents('did-finish-load')
      vi.runOnlyPendingTimers() // retry 3
      fireNetworkLoadFailure(loginWindow, LOGIN_SHELL_URL) // exhausted → dialog
      loginWindow.fireWebContents('did-finish-load')
      await vi.runOnlyPendingTimersAsync()

      // Assert: recovery survived the interleaved error-page finishes.
      expect(loginWindow.win.webContents.loadURL).toHaveBeenCalledTimes(3)
      expect(loginWindow.win.show).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    })

    it('recovers the login window from an HTTP 500 page and does not treat its did-finish-load as a real load', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.createLoginWindow()
      const loginWindow = getWindow(0)

      // Act: corelive.app answered 500 — a successful navigation to an error
      // page, then the page settles.
      fireHttpErrorNavigation(loginWindow, LOGIN_SHELL_URL, 500)
      loginWindow.fireWebContents('did-finish-load')
      vi.runOnlyPendingTimers() // retry 1
      fireHttpErrorNavigation(loginWindow, LOGIN_SHELL_URL, 500)
      loginWindow.fireWebContents('did-finish-load')
      vi.runOnlyPendingTimers() // retry 2

      // Assert: recovery kept retrying — the 500 page's finish did not latch.
      expect(loginWindow.win.webContents.loadURL).toHaveBeenCalledTimes(2)
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('keeps a manual LiveEditor open hidden on a 503 and retries the route without opening the login window', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      const showLoginWindow = vi
        .spyOn(windowManager, 'showLoginWindow')
        .mockImplementation(() => {})
      windowManager.showLiveEditor()
      const liveEditorWindow = getWindow(0)

      // Act: /live-editor answered 503, then the backoff fires.
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()

      // Assert: hidden, no login window, the protected route was reloaded.
      expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
      expect(showLoginWindow).not.toHaveBeenCalled()
      expect(liveEditorWindow.win.loadURL).toHaveBeenCalledTimes(2)
      expect(liveEditorWindow.win.loadURL).toHaveBeenLastCalledWith(
        LIVE_EDITOR_URL,
      )
      expect(createdWindows).toHaveLength(1)
    })

    it('shows a parentless recovery dialog after three failed LiveEditor retries, where Retry reloads and Close leaves the panel hidden', async () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLiveEditor()
      const liveEditorWindow = getWindow(0)

      // Act: 503 four times (3 backoff retries + the exhausting failure).
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers() // retry 1
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers() // retry 2
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers() // retry 3
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503) // exhausted
      await vi.runOnlyPendingTimersAsync() // default "Close" (response 1)

      // Assert: the dialog is app-modal (no transparent empty panel as parent),
      // carries the HTTP status, and Close leaves the hidden panel alone.
      expect(liveEditorWindow.win.loadURL).toHaveBeenCalledTimes(4)
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
      expect(vi.mocked(dialog.showMessageBox).mock.calls[0]).toHaveLength(1)
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Couldn't reach corelive.app",
          detail: 'corelive.app returned HTTP 503. Try again in a moment.',
          buttons: ['Retry', 'Close'],
        }),
      )
      expect(liveEditorWindow.win.show).not.toHaveBeenCalled()
      expect(liveEditorWindow.win.close).not.toHaveBeenCalled()

      // Arrange: Close ended that watch, so the user opens LiveEditor again
      // (one fresh load) and this time picks Retry on the dialog.
      windowManager.showLiveEditor()
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
        response: 0,
        checkboxChecked: false,
      })

      // Act: exhaust again → dialog → Retry.
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      await vi.runOnlyPendingTimersAsync()

      // Assert: the reopen loaded once, then Retry reloaded the route once more
      // after three backoff retries (4 + 1 + 3 + 1 = 9 loads).
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(2)
      expect(liveEditorWindow.win.loadURL).toHaveBeenCalledTimes(9)
    })

    it('starts a fresh LiveEditor load on the next toggle after Close on the recovery dialog instead of swallowing the press', async () => {
      // Arrange: a manual open exhausts its retries and the user picks Close
      // (the mock's default, response 1).
      const windowManager = new WindowManager(SERVER_URL)
      windowManager.showLiveEditor()
      const liveEditorWindow = getWindow(0)
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503) // exhausted
      await vi.runOnlyPendingTimersAsync() // Close
      liveEditorWindow.win.loadURL.mockClear()

      // Act: one press of the toggle shortcut, and this time the route loads.
      const didOpen = windowManager.toggleLiveEditor()
      liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
      liveEditorWindow.fireWebContents('did-finish-load')

      // Assert: the press opened a fresh load that revealed the panel, rather
      // than cancelling a reveal the dead watch could never deliver.
      expect(didOpen).toBe(true)
      expect(liveEditorWindow.win.loadURL).toHaveBeenCalledTimes(1)
      expect(liveEditorWindow.win.loadURL).toHaveBeenLastCalledWith(
        LIVE_EDITOR_URL,
      )
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
    })

    it('reveals LiveEditor once a retry finally lands on the editor route', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      const onShown = vi.fn()
      windowManager.showLiveEditor(onShown)
      const liveEditorWindow = getWindow(0)

      // Act: one 503, then the retry succeeds.
      fireHttpErrorNavigation(liveEditorWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()
      liveEditorWindow.fireWebContents('did-navigate', {}, LIVE_EDITOR_URL)
      liveEditorWindow.fireWebContents('did-finish-load')

      // Assert
      expect(liveEditorWindow.win.show).toHaveBeenCalledTimes(1)
      expect(liveEditorWindow.win.focus).toHaveBeenCalledTimes(1)
      expect(onShown).toHaveBeenCalledTimes(1)
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('keeps the startup LiveEditor hidden on a 503 and retries instead of opening the login window', () => {
      // Arrange
      const windowManager = new WindowManager(SERVER_URL)
      const showLoginWindow = vi
        .spyOn(windowManager, 'showLoginWindow')
        .mockImplementation(() => {})
      windowManager.openStartupPanel()
      const panelWindow = getWindow(0)

      // Act
      fireHttpErrorNavigation(panelWindow, LIVE_EDITOR_URL, 503)
      vi.runOnlyPendingTimers()

      // Assert: a 503 is not "signed out" — no login window, no fallback, retry.
      expect(panelWindow.win.show).not.toHaveBeenCalled()
      expect(showLoginWindow).not.toHaveBeenCalled()
      expect(windowManager.hasStartupAuthFallback()).toBe(false)
      expect(panelWindow.win.loadURL).toHaveBeenCalledTimes(2)
      expect(createdWindows).toHaveLength(1)
    })
  })
})

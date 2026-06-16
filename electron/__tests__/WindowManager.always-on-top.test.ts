/**
 * @fileoverview FloatingNavigator + BrainDump always-on-top WindowManager tests.
 *
 * The crux sentinel: FloatingNavigator's always-on-top must persist to the
 * WindowStateManager, not just config — otherwise the preference is a silent
 * no-op after the first launch, because `window-state.json` overrides config at
 * relaunch. A config-only setter would pass typecheck and look correct, yet
 * re-pin the window on the next boot. These tests fail if that regression
 * returns. They also lock the BrainDump window's constructor to a config read
 * (no hardcoded `alwaysOnTop: true` shadow) and the getters to the right source
 * of truth.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowManager.always-on-top
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Spy = ReturnType<typeof vi.fn>

/** The slice of the BrowserWindow surface these always-on-top paths touch. */
interface MockBrowserWindow {
  setAlwaysOnTop: Spy
  isAlwaysOnTop: Spy
  isDestroyed: Spy
  setOpacity: Spy
  getOpacity: Spy
  setVisibleOnAllWorkspaces: Spy
  loadURL: Spy
  on: Spy
  webContents: { on: Spy }
}

/** Every constructed window plus the options it was constructed with. */
interface CapturedMockWindow {
  win: MockBrowserWindow
  options: Record<string, unknown>
}

const createdWindows: CapturedMockWindow[] = []

// BrowserWindow mock: records constructor options so the shadow-trap test can
// assert the `alwaysOnTop` the window was actually built with.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (options: Record<string, unknown>) {
    const win: MockBrowserWindow = {
      setAlwaysOnTop: vi.fn(),
      // Mirrors the constructed flag so a "live window" reports what it was built with.
      isAlwaysOnTop: vi.fn(() => Boolean(options.alwaysOnTop)),
      isDestroyed: vi.fn(() => false),
      setOpacity: vi.fn(),
      getOpacity: vi.fn(() => 1),
      setVisibleOnAllWorkspaces: vi.fn(),
      loadURL: vi.fn(),
      on: vi.fn(),
      webContents: { on: vi.fn() },
    }
    createdWindows.push({ win, options })
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
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imported after the mocks so WindowManager's `import { BrowserWindow }` is stubbed.
import type { ConfigManager } from '../ConfigManager'
import { WindowManager } from '../WindowManager'
import type { WindowStateManager } from '../WindowStateManager'

const SERVER_URL = 'https://corelive.app'

/**
 * Builds a ConfigManager stub backed by an in-memory store so `set` followed by
 * `get` round-trips, and both are observable spies.
 *
 * @param values - Initial config values keyed by dotted path.
 * @param windowSection - What `getSection('window')` returns; pass
 *   `{ floating: {...} }` for the `createFloatingNavigator` construction tests,
 *   which read `getSection('window').floating`. Defaults to `{}` so the
 *   non-construction callers stay unaffected.
 * @returns The stub plus its `get`/`set` spies for assertions.
 */
function createConfigStub(
  values: Record<string, unknown> = {},
  windowSection: Record<string, unknown> = {},
): {
  configManager: ConfigManager
  get: Spy
  set: Spy
} {
  const store: Record<string, unknown> = { ...values }
  const get = vi.fn((key: string, fallback?: unknown) =>
    key in store ? store[key] : fallback,
  )
  const set = vi.fn((key: string, value: unknown) => {
    store[key] = value
  })
  const configManager = {
    get,
    set,
    getSection: vi.fn(() => windowSection),
  } as unknown as ConfigManager
  return { configManager, get, set }
}

/**
 * Builds a WindowStateManager stub whose `getWindowState('floating')` returns a
 * fixed state, with observable spies. Also stubs `getWindowOptions` (spread into
 * the BrowserWindow ctor) and `applyWindowState` so the `createFloatingNavigator`
 * construction tests can build a window through this manager.
 *
 * @param floatingState - The persisted floating state, or null when none saved.
 * @param windowOptions - What `getWindowOptions('floating')` returns; the
 *   construction tests pass bounds with `alwaysOnTop: undefined` to model a
 *   saved state that predates the always-on-top field (the upgrade path).
 * @returns The stub plus its observable spies.
 */
function createWindowStateStub(
  floatingState: { isAlwaysOnTop?: boolean } | null = null,
  windowOptions: Record<string, unknown> = {},
): {
  windowStateManager: WindowStateManager
  getWindowState: Spy
  setWindowState: Spy
  getWindowOptions: Spy
  applyWindowState: Spy
} {
  const getWindowState = vi.fn(() => floatingState)
  const setWindowState = vi.fn(() => true)
  const getWindowOptions = vi.fn(() => windowOptions)
  const applyWindowState = vi.fn(() => true)
  const windowStateManager = {
    getWindowState,
    setWindowState,
    getWindowOptions,
    applyWindowState,
  } as unknown as WindowStateManager
  return {
    windowStateManager,
    getWindowState,
    setWindowState,
    getWindowOptions,
    applyWindowState,
  }
}

describe('WindowManager always-on-top', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setFloatingNavigatorAlwaysOnTop', () => {
    it('persists to BOTH config and window-state so the choice survives relaunch', () => {
      // Arrange: floating window closed, so only the persisted layers are written.
      const { configManager, set } = createConfigStub()
      const { windowStateManager, setWindowState } = createWindowStateStub()
      const windowManager = new WindowManager(
        SERVER_URL,
        configManager,
        windowStateManager,
      )

      // Act: the user turns OFF always-on-top from Settings.
      const applied = windowManager.setFloatingNavigatorAlwaysOnTop(false)

      // Assert: the window-state write is the load-bearing one — getWindowOptions
      // reads `state.isAlwaysOnTop` at relaunch, so a config-only setter would
      // silently re-pin on the next boot. A regression to config-only fails here.
      expect(applied).toBe(false)
      expect(set).toHaveBeenCalledWith('window.floating.alwaysOnTop', false)
      expect(setWindowState).toHaveBeenCalledWith('floating', {
        isAlwaysOnTop: false,
      })
    })

    it('applies to the open floating window alongside the config and window-state writes', () => {
      // Arrange: a floating window is open. getSection feeds the ctor a pinned
      // floating config; getWindowOptions feeds matching bounds.
      const { configManager, set } = createConfigStub(
        {},
        {
          floating: {
            frame: false,
            alwaysOnTop: true,
            resizable: true,
            maxWidth: 400,
          },
        },
      )
      const { windowStateManager, setWindowState } = createWindowStateStub(
        { isAlwaysOnTop: true },
        {
          width: 300,
          height: 400,
          maxWidth: 400,
          frame: false,
          alwaysOnTop: true,
          resizable: true,
          skipTaskbar: true,
        },
      )
      const windowManager = new WindowManager(
        SERVER_URL,
        configManager,
        windowStateManager,
      )
      windowManager.createFloatingNavigator()
      const floatingWindow = createdWindows[0]
      if (!floatingWindow) throw new Error('Expected a floating window')

      // Act: the user turns OFF always-on-top while the window is open.
      const applied = windowManager.setFloatingNavigatorAlwaysOnTop(false)

      // Assert: all three layers update together — config, the load-bearing
      // window-state, AND the live window — so the unpin is visible immediately,
      // not only after the next relaunch. A setter that skipped the live window
      // would leave the open panel pinned until restart.
      expect(applied).toBe(false)
      expect(set).toHaveBeenCalledWith('window.floating.alwaysOnTop', false)
      expect(setWindowState).toHaveBeenCalledWith('floating', {
        isAlwaysOnTop: false,
      })
      expect(floatingWindow.win.setAlwaysOnTop).toHaveBeenCalledWith(false)
    })
  })

  describe('setBrainDumpAlwaysOnTop', () => {
    it('persists to config and applies to the open BrainDump window', () => {
      // Arrange: BrainDump starts unpinned, then is opened.
      const { configManager, set } = createConfigStub({
        'braindump.alwaysOnTop': false,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)
      windowManager.createBrainDumpWindow()
      const brainDumpWindow = createdWindows[0]
      if (!brainDumpWindow) throw new Error('Expected a BrainDump window')

      // Act: the user pins BrainDump.
      const applied = windowManager.setBrainDumpAlwaysOnTop(true)

      // Assert: config is updated AND the live window is re-pinned immediately.
      expect(applied).toBe(true)
      expect(set).toHaveBeenCalledWith('braindump.alwaysOnTop', true)
      expect(brainDumpWindow.win.setAlwaysOnTop).toHaveBeenCalledWith(true)
    })
  })

  describe('getBrainDumpAlwaysOnTop', () => {
    it('reads the persisted BrainDump pin from config', () => {
      // Arrange: a user who opted in.
      const { configManager } = createConfigStub({
        'braindump.alwaysOnTop': true,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act + Assert
      expect(windowManager.getBrainDumpAlwaysOnTop()).toBe(true)
    })

    it('defaults to unpinned when config has no BrainDump pin', () => {
      // Arrange: a fresh install with no saved value.
      const { configManager } = createConfigStub()
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act + Assert: the false default serves the "unpinned by default" behavior.
      expect(windowManager.getBrainDumpAlwaysOnTop()).toBe(false)
    })
  })

  describe('getFloatingNavigatorAlwaysOnTop', () => {
    it('prefers the persisted window-state over config when the window is closed', () => {
      // Arrange: config says pinned, but the saved window-state says unpinned —
      // the saved state is what relaunch will re-apply, so it must win.
      const { configManager } = createConfigStub({
        'window.floating.alwaysOnTop': true,
      })
      const { windowStateManager } = createWindowStateStub({
        isAlwaysOnTop: false,
      })
      const windowManager = new WindowManager(
        SERVER_URL,
        configManager,
        windowStateManager,
      )

      // Act + Assert: the persisted state (false) wins over the config (true).
      expect(windowManager.getFloatingNavigatorAlwaysOnTop()).toBe(false)
    })

    it('defaults to pinned when nothing is persisted (preserves current behavior)', () => {
      // Arrange: no saved window-state and no config value.
      const { configManager } = createConfigStub()
      const { windowStateManager } = createWindowStateStub(null)
      const windowManager = new WindowManager(
        SERVER_URL,
        configManager,
        windowStateManager,
      )

      // Act + Assert: Floating Navigator defaults ON, matching its pre-feature behavior.
      expect(windowManager.getFloatingNavigatorAlwaysOnTop()).toBe(true)
    })

    it('reads the live floating window over config and persisted state when it is open', () => {
      // Arrange: an open floating window built UNPINNED (the floating section's
      // alwaysOnTop is false), while BOTH the config value and the persisted
      // window-state say pinned. Only the live-window branch can return false.
      const { configManager } = createConfigStub(
        { 'window.floating.alwaysOnTop': true },
        {
          floating: {
            frame: false,
            alwaysOnTop: false,
            resizable: true,
            maxWidth: 400,
          },
        },
      )
      const { windowStateManager } = createWindowStateStub(
        { isAlwaysOnTop: true },
        {
          width: 300,
          height: 400,
          maxWidth: 400,
          frame: false,
          alwaysOnTop: false,
          resizable: true,
          skipTaskbar: true,
        },
      )
      const windowManager = new WindowManager(
        SERVER_URL,
        configManager,
        windowStateManager,
      )
      windowManager.createFloatingNavigator()

      // Act + Assert: the live window (false) wins over config (true) and the
      // persisted state (true) — the open-window branch short-circuits before
      // either is consulted, so the Settings switch mirrors the real window.
      expect(windowManager.getFloatingNavigatorAlwaysOnTop()).toBe(false)
    })
  })

  describe('createBrainDumpWindow', () => {
    it('constructs the BrainDump window unpinned when config is off (no hardcoded shadow)', () => {
      // Arrange: BrainDump pin OFF in config; no WindowStateManager, so the
      // constructor path (not getWindowOptions) decides alwaysOnTop.
      const { configManager } = createConfigStub({
        'braindump.alwaysOnTop': false,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act
      windowManager.createBrainDumpWindow()

      // Assert: the window was built unpinned — proving the constructor reads
      // config and the old hardcoded `alwaysOnTop: true` no longer shadows it.
      expect(createdWindows).toHaveLength(1)
      expect(createdWindows[0]?.options.alwaysOnTop).toBe(false)
    })

    it('constructs the BrainDump window pinned when config opts in', () => {
      // Arrange: BrainDump pin ON in config.
      const { configManager } = createConfigStub({
        'braindump.alwaysOnTop': true,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act
      windowManager.createBrainDumpWindow()

      // Assert: the opt-in flows through to the constructed window.
      expect(createdWindows).toHaveLength(1)
      expect(createdWindows[0]?.options.alwaysOnTop).toBe(true)
    })
  })

  describe('createFloatingNavigator', () => {
    it('constructs the floating window PINNED on upgrade when the saved state predates always-on-top', () => {
      // Arrange: an upgrading user. window-state.json has saved bounds but no
      // `isAlwaysOnTop` (it predates this feature), so getWindowOptions yields
      // `alwaysOnTop: undefined`; config still carries the default true.
      const { configManager } = createConfigStub(
        {},
        {
          floating: {
            frame: false,
            alwaysOnTop: true,
            resizable: true,
            maxWidth: 400,
          },
        },
      )
      const { windowStateManager } = createWindowStateStub(
        {},
        {
          width: 300,
          height: 400,
          x: 100,
          y: 100,
          maxWidth: 400,
          frame: false,
          alwaysOnTop: undefined,
          resizable: true,
          skipTaskbar: true,
        },
      )
      const windowManager = new WindowManager(
        SERVER_URL,
        configManager,
        windowStateManager,
      )

      // Act
      windowManager.createFloatingNavigator()

      // Assert: built PINNED. The ctor spreads getWindowOptions (alwaysOnTop:
      // undefined) FIRST, then sets `alwaysOnTop: floatingConfig.alwaysOnTop`
      // (config default true) explicitly AFTER. A regression reordering the
      // spread or dropping that explicit line silently unpins every upgrading
      // user's floating window on first relaunch — this test fails if so.
      expect(createdWindows).toHaveLength(1)
      expect(createdWindows[0]?.options.alwaysOnTop).toBe(true)
    })
  })
})

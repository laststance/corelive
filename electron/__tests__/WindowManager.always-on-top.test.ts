/**
 * @fileoverview LiveEditor always-on-top WindowManager tests.
 *
 * Locks the LiveEditor window's constructor to a config read (no hardcoded
 * `alwaysOnTop: true` shadow), the setter to "persist to config AND apply to
 * the live window", and the getter to its config source of truth. A setter that
 * skipped the live window would leave the open panel pinned until restart.
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
  webContents: { on: Spy; send: Spy; isDestroyed: Spy }
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
      webContents: {
        on: vi.fn(),
        send: vi.fn(),
        isDestroyed: vi.fn(() => false),
      },
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

const SERVER_URL = 'https://corelive.app'

/**
 * Builds a ConfigManager stub backed by an in-memory store so `set` followed by
 * `get` round-trips, and both are observable spies.
 *
 * @param values - Initial config values keyed by dotted path.
 * @returns The stub plus its `get`/`set` spies for assertions.
 * @example
 * const { configManager, set } = createConfigStub({ 'liveEditor.alwaysOnTop': false })
 */
function createConfigStub(values: Record<string, unknown> = {}): {
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
    getSection: vi.fn(() => ({})),
  } as unknown as ConfigManager
  return { configManager, get, set }
}

describe('WindowManager always-on-top', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setLiveEditorAlwaysOnTop', () => {
    it('persists to config and applies to the open LiveEditor window', () => {
      // Arrange: LiveEditor starts unpinned, then is opened.
      const { configManager, set } = createConfigStub({
        'liveEditor.alwaysOnTop': false,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)
      windowManager.createLiveEditorWindow()
      const liveEditorWindow = createdWindows[0]
      if (!liveEditorWindow) throw new Error('Expected a LiveEditor window')

      // Act: the user pins LiveEditor.
      const applied = windowManager.setLiveEditorAlwaysOnTop(true)

      // Assert: config is updated AND the live window is re-pinned immediately.
      expect(applied).toBe(true)
      expect(set).toHaveBeenCalledWith('liveEditor.alwaysOnTop', true)
      expect(liveEditorWindow.win.setAlwaysOnTop).toHaveBeenCalledWith(true)
    })

    it('does not throw when LiveEditor is closed', () => {
      // Arrange: no window open — only config can be written.
      const { configManager, set } = createConfigStub()
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act + Assert: the closed window re-reads fresh config on next open.
      expect(() => windowManager.setLiveEditorAlwaysOnTop(true)).not.toThrow()
      expect(set).toHaveBeenCalledWith('liveEditor.alwaysOnTop', true)
      expect(createdWindows).toHaveLength(0)
    })
  })

  describe('getLiveEditorAlwaysOnTop', () => {
    it('reads the persisted LiveEditor pin from config', () => {
      // Arrange: a user who opted in.
      const { configManager } = createConfigStub({
        'liveEditor.alwaysOnTop': true,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act + Assert
      expect(windowManager.getLiveEditorAlwaysOnTop()).toBe(true)
    })

    it('defaults to unpinned when config has no LiveEditor pin', () => {
      // Arrange: a fresh install with no saved value.
      const { configManager } = createConfigStub()
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act + Assert: the false default serves the "unpinned by default" behavior.
      expect(windowManager.getLiveEditorAlwaysOnTop()).toBe(false)
    })
  })

  describe('createLiveEditorWindow', () => {
    it('constructs the LiveEditor window unpinned when config is off (no hardcoded shadow)', () => {
      // Arrange: LiveEditor pin OFF in config; no WindowStateManager, so the
      // constructor path (not getWindowOptions) decides alwaysOnTop.
      const { configManager } = createConfigStub({
        'liveEditor.alwaysOnTop': false,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act
      windowManager.createLiveEditorWindow()

      // Assert: the window was built unpinned — proving the constructor reads
      // config and the old hardcoded `alwaysOnTop: true` no longer shadows it.
      expect(createdWindows).toHaveLength(1)
      expect(createdWindows[0]?.options.alwaysOnTop).toBe(false)
    })

    it('constructs the LiveEditor window pinned when config opts in', () => {
      // Arrange: LiveEditor pin ON in config.
      const { configManager } = createConfigStub({
        'liveEditor.alwaysOnTop': true,
      })
      const windowManager = new WindowManager(SERVER_URL, configManager, null)

      // Act
      windowManager.createLiveEditorWindow()

      // Assert: the opt-in flows through to the constructed window.
      expect(createdWindows).toHaveLength(1)
      expect(createdWindows[0]?.options.alwaysOnTop).toBe(true)
    })
  })
})

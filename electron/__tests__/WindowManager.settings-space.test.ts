/**
 * @fileoverview Settings popover macOS Spaces-following tests.
 *
 * The crux: the menu-bar / tray "Settings" popover (`createSettingsWindow`)
 * must follow the ACTIVE macOS Space via `setVisibleOnAllWorkspaces(true, …)`.
 * Without it, the window stays bound to the Space it was last shown on, so
 * reopening Settings after switching desktops yanks the user back to that
 * old Space — the "opens on another desktop" bug these tests guard against.
 *
 * Unlike the Floating / BrainDump panels (opt-in, config-gated, default OFF),
 * the settings popover follows the Space UNCONDITIONALLY (hardcoded `true`), so
 * a future refactor that copies the floating call-site's config-driven boolean
 * would re-introduce the bug — and fail the darwin test below. The non-darwin
 * test locks the platform guard so Windows/Linux never call the no-op API.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowManager.settings-space
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Spy = ReturnType<typeof vi.fn>

/** The slice of the BrowserWindow surface `createSettingsWindow` touches. */
interface MockBrowserWindow {
  isDestroyed: Spy
  setVisibleOnAllWorkspaces: Spy
  loadURL: Spy
  show: Spy
  focus: Spy
  on: Spy
  once: Spy
  webContents: { on: Spy }
}

const createdWindows: MockBrowserWindow[] = []

// BrowserWindow mock: records each constructed window so the test can assert
// the Spaces-following call landed on the settings popover.
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    const win: MockBrowserWindow = {
      isDestroyed: vi.fn(() => false),
      setVisibleOnAllWorkspaces: vi.fn(),
      loadURL: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      webContents: { on: vi.fn() },
    }
    createdWindows.push(win)
    return win
  }),
  screen: {
    // No tray-bounds provider is set, so the popover falls back to the primary
    // display for positioning — this is all `calculateSettingsPopoverPosition`
    // needs in the fallback branch.
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
import { WindowManager } from '../WindowManager'

const SERVER_URL = 'https://corelive.app'

/** The exact options the helper passes — fullscreen Spaces + no brief hide. */
const SPACES_FOLLOW_OPTIONS = {
  visibleOnFullScreen: true,
  skipTransformProcessType: true,
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

/** Forces `process.platform` for a test; the helper short-circuits off-darwin. */
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

describe('WindowManager settings popover Spaces-following', () => {
  beforeEach(() => {
    createdWindows.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  it('opens Settings on the current desktop by following the active macOS Space', () => {
    // Arrange: a macOS runtime, where the Spaces-following behavior is meaningful.
    setPlatform('darwin')
    const windowManager = new WindowManager(SERVER_URL)

    // Act: open the Settings popover (menu-bar + tray both route here).
    windowManager.createSettingsWindow()
    const settingsWindow = createdWindows[0]
    if (!settingsWindow) throw new Error('Expected a settings popover window')

    // Assert: the popover is told to join ALL Spaces, which makes macOS render it
    // on the CURRENTLY active desktop instead of switching to the Space it was
    // last shown on. Hardcoded `true` — it is never gated on the floating opt-out.
    expect(settingsWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(
      true,
      SPACES_FOLLOW_OPTIONS,
    )
  })

  it('skips the Spaces call on non-macOS so Windows/Linux never hit the no-op API', () => {
    // Arrange: a non-darwin runtime; setVisibleOnAllWorkspaces is macOS-only.
    setPlatform('linux')
    const windowManager = new WindowManager(SERVER_URL)

    // Act: build the same popover on Linux (e.g. the xvfb E2E runner).
    windowManager.createSettingsWindow()
    const settingsWindow = createdWindows[0]
    if (!settingsWindow) throw new Error('Expected a settings popover window')

    // Assert: the platform guard kept the call from firing off-darwin.
    expect(settingsWindow.setVisibleOnAllWorkspaces).not.toHaveBeenCalled()
  })
})

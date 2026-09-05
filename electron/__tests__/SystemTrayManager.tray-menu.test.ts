import { Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, Tray } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SystemTrayManager } from '../SystemTrayManager'
import type { WindowManager } from '../WindowManager'

// vitest hoists BOTH vi.mock calls above every import in this file, so the
// electron + logger stubs are installed before SystemTrayManager (and the `Menu`
// import above) resolve at module load — the import position is irrelevant.
// Menu.buildFromTemplate is stubbed to capture the template array each
// updateTrayMenu() builds, so tests can assert on the rendered items.
vi.mock('electron', () => ({
  app: { on: vi.fn(), quit: vi.fn() },
  Menu: { buildFromTemplate: vi.fn((template) => ({ template })) },
  nativeImage: {
    createFromPath: vi.fn(),
    createEmpty: vi.fn(),
    createFromBuffer: vi.fn(),
  },
  Notification: vi.fn(),
  shell: { openExternal: vi.fn(async () => {}) },
  Tray: vi.fn(),
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// A never-destroyed tray with a spyable setContextMenu — updateTrayMenu reads
// isDestroyed() then calls setContextMenu(builtMenu).
const fakeTray = {
  isDestroyed: () => false,
  setContextMenu: vi.fn(),
} as unknown as Tray

/**
 * Build a SystemTrayManager over a stub WindowManager exposing spies for the
 * window actions the tray menu items invoke, with a live tray already primed.
 * @returns The manager plus the WindowManager action spies.
 * @example const { manager, toggleLiveEditor } = createManager()
 */
function createManager(): {
  manager: SystemTrayManager
  openSettings: ReturnType<typeof vi.fn>
  restoreFromTray: ReturnType<typeof vi.fn>
  toggleLiveEditor: ReturnType<typeof vi.fn>
} {
  const openSettings = vi.fn()
  const restoreFromTray = vi.fn()
  const toggleLiveEditor = vi.fn()
  const stubWindowManager = {
    restoreFromTray,
    openSettings,
    toggleLiveEditor,
    getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
  } as unknown as WindowManager
  const manager = new SystemTrayManager(stubWindowManager)
  // Mirror createTray's side effect so updateTrayMenu's `if (this.tray)` guard
  // passes without standing up the native Tray stack.
  ;(manager as unknown as { tray: Tray | null }).tray = fakeTray
  return {
    manager,
    openSettings,
    restoreFromTray,
    toggleLiveEditor,
  }
}

/** Read the template array from the most recent Menu.buildFromTemplate call. */
function lastBuiltTemplate(): MenuItemConstructorOptions[] {
  const calls = vi.mocked(Menu.buildFromTemplate).mock.calls
  return calls[calls.length - 1]![0] as MenuItemConstructorOptions[]
}

/** Find a tray menu item by its visible label. */
function findItem(
  template: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined {
  return template.find((item) => item.label === label)
}

describe('SystemTrayManager tray menu — LiveEditor toggle + live hotkeys', () => {
  beforeEach(() => {
    vi.mocked(Menu.buildFromTemplate).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fakeTray.setContextMenu = vi.fn()
  })

  it('toggles the LiveEditor window when its tray item is clicked', () => {
    // Arrange
    const { manager, toggleLiveEditor } = createManager()

    // Act
    manager.updateTrayMenu()
    const liveEditorItem = findItem(lastBuiltTemplate(), 'Toggle LiveEditor')
    ;(liveEditorItem?.click as () => void)?.()

    // Assert: the item is the toggle (not the old one-way "Open LiveEditor")
    // and it routes to the window toggle.
    expect(liveEditorItem).toBeDefined()
    expect(findItem(lastBuiltTemplate(), 'Open LiveEditor')).toBeUndefined()
    expect(toggleLiveEditor).toHaveBeenCalledTimes(1)
  })

  it('opens the full app in the browser — never a native window — from its tray item', () => {
    // Arrange
    const { manager, restoreFromTray } = createManager()

    // Act
    manager.updateTrayMenu()
    const browserItem = findItem(
      lastBuiltTemplate(),
      'Open full app in browser ↗',
    )
    ;(browserItem?.click as () => void)?.()

    // Assert: the retired main window has no tray entry; the full app is the
    // web app, opened externally at corelive.app/home.
    expect(browserItem).toBeDefined()
    expect(findItem(lastBuiltTemplate(), 'Show TODO App')).toBeUndefined()
    expect(vi.mocked(shell.openExternal)).toHaveBeenCalledWith(
      'https://corelive.app/home',
    )
    // ...and it ONLY opens the browser — it must not also surface a native
    // window (LiveEditor / login) via restoreFromTray.
    expect(restoreFromTray).not.toHaveBeenCalled()
  })

  it('opens Settings from the tray without exposing the retired Preferences label', () => {
    // Arrange
    const { manager, openSettings } = createManager()

    // Act
    manager.updateTrayMenu()
    const template = lastBuiltTemplate()
    const settingsItem = findItem(template, 'Settings')
    ;(settingsItem?.click as () => void)?.()

    // Assert: users see only the renamed destination, and it opens the native
    // Settings window rather than a retired Preferences route.
    expect(settingsItem).toBeDefined()
    expect(findItem(template, 'Preferences')).toBeUndefined()
    expect(openSettings).toHaveBeenCalledTimes(1)
  })

  it('shows the LiveEditor toggle item’s live hotkey supplied by the accelerator provider', () => {
    // Arrange
    const { manager } = createManager()
    manager.setShortcutAcceleratorProvider(() => ({
      toggleLiveEditor: 'Alt+Space',
    }))

    // Act
    manager.updateTrayMenu()
    const template = lastBuiltTemplate()

    // Assert
    expect(findItem(template, 'Toggle LiveEditor')?.accelerator).toBe(
      'Alt+Space',
    )
  })

  it('omits the accelerator entirely when a shortcut is unbound', () => {
    // Arrange: provider reports no LiveEditor binding (empty string disables it).
    const { manager } = createManager()
    manager.setShortcutAcceleratorProvider(() => ({
      toggleLiveEditor: '',
    }))

    // Act
    manager.updateTrayMenu()
    const liveEditorItem = findItem(lastBuiltTemplate(), 'Toggle LiveEditor')

    // Assert: no orphan accelerator glyph for an unbound shortcut.
    expect(liveEditorItem).toBeDefined()
    expect('accelerator' in liveEditorItem!).toBe(false)
  })

  it('falls back to no hotkey when no accelerator provider is injected', () => {
    // Arrange: provider never set (e.g. boot before ShortcutManager wiring).
    const { manager } = createManager()

    // Act
    manager.updateTrayMenu()
    const template = lastBuiltTemplate()

    // Assert: the item renders, just without an accelerator — never a hardcoded key.
    expect('accelerator' in findItem(template, 'Toggle LiveEditor')!).toBe(
      false,
    )
  })

  it('refreshes the displayed hotkey after a rebind', () => {
    // Arrange: first render shows the default LiveEditor hotkey.
    const { manager } = createManager()
    let liveEditorAccelerator = 'Alt+Space'
    manager.setShortcutAcceleratorProvider(() => ({
      toggleLiveEditor: liveEditorAccelerator,
    }))
    manager.updateTrayMenu()

    // Act: the user rebinds LiveEditor, then a refresh re-renders the tray.
    liveEditorAccelerator = 'CommandOrControl+Shift+B'
    manager.refreshTrayMenu()
    const template = lastBuiltTemplate()

    // Assert: the new hotkey shows.
    expect(findItem(template, 'Toggle LiveEditor')?.accelerator).toBe(
      'CommandOrControl+Shift+B',
    )
  })
})

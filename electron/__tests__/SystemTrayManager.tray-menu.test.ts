import { Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, Tray } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SystemTrayManager } from '../SystemTrayManager'
import type { TaskItem } from '../SystemTrayManager'
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
 * @example const { manager, toggleBrainDump } = createManager()
 */
function createManager(): {
  manager: SystemTrayManager
  restoreFromTray: ReturnType<typeof vi.fn>
  toggleBrainDump: ReturnType<typeof vi.fn>
  toggleFloatingNavigator: ReturnType<typeof vi.fn>
} {
  const restoreFromTray = vi.fn()
  const toggleBrainDump = vi.fn()
  const toggleFloatingNavigator = vi.fn()
  const stubWindowManager = {
    restoreFromTray,
    openSettings: vi.fn(),
    toggleBrainDump,
    toggleFloatingNavigator,
    getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
  } as unknown as WindowManager
  const manager = new SystemTrayManager(stubWindowManager)
  // Mirror createTray's side effect so updateTrayMenu's `if (this.tray)` guard
  // passes without standing up the native Tray stack.
  ;(manager as unknown as { tray: Tray | null }).tray = fakeTray
  return { manager, restoreFromTray, toggleBrainDump, toggleFloatingNavigator }
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

describe('SystemTrayManager tray menu — BrainDump toggle + live hotkeys', () => {
  beforeEach(() => {
    vi.mocked(Menu.buildFromTemplate).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fakeTray.setContextMenu = vi.fn()
  })

  it('toggles the BrainDump window when its tray item is clicked', () => {
    // Arrange
    const { manager, toggleBrainDump } = createManager()

    // Act
    manager.updateTrayMenu([])
    const brainDumpItem = findItem(lastBuiltTemplate(), 'Toggle BrainDump')
    ;(brainDumpItem?.click as () => void)?.()

    // Assert: the item is the toggle (not the old one-way "Open BrainDump")
    // and it routes to the window toggle, matching Floating Navigator.
    expect(brainDumpItem).toBeDefined()
    expect(findItem(lastBuiltTemplate(), 'Open BrainDump')).toBeUndefined()
    expect(toggleBrainDump).toHaveBeenCalledTimes(1)
  })

  it('opens the full app in the browser — never a native window — from its tray item', () => {
    // Arrange
    const { manager, restoreFromTray } = createManager()

    // Act
    manager.updateTrayMenu([])
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
    // window (Floating) via restoreFromTray.
    expect(restoreFromTray).not.toHaveBeenCalled()
  })

  it('shows each toggle item’s live hotkey supplied by the accelerator provider', () => {
    // Arrange
    const { manager } = createManager()
    manager.setShortcutAcceleratorProvider(() => ({
      toggleFloatingNavigator: 'CommandOrControl+3',
      toggleBrainDump: 'Alt+Space',
    }))

    // Act
    manager.updateTrayMenu([])
    const template = lastBuiltTemplate()

    // Assert
    expect(findItem(template, 'Toggle Floating Navigator')?.accelerator).toBe(
      'CommandOrControl+3',
    )
    expect(findItem(template, 'Toggle BrainDump')?.accelerator).toBe(
      'Alt+Space',
    )
  })

  it('omits the accelerator entirely when a shortcut is unbound', () => {
    // Arrange: provider reports no BrainDump binding (empty string disables it).
    const { manager } = createManager()
    manager.setShortcutAcceleratorProvider(() => ({
      toggleFloatingNavigator: 'CommandOrControl+3',
      toggleBrainDump: '',
    }))

    // Act
    manager.updateTrayMenu([])
    const brainDumpItem = findItem(lastBuiltTemplate(), 'Toggle BrainDump')

    // Assert: no orphan accelerator glyph for an unbound shortcut.
    expect(brainDumpItem).toBeDefined()
    expect('accelerator' in brainDumpItem!).toBe(false)
  })

  it('falls back to no hotkey when no accelerator provider is injected', () => {
    // Arrange: provider never set (e.g. boot before ShortcutManager wiring).
    const { manager } = createManager()

    // Act
    manager.updateTrayMenu([])
    const template = lastBuiltTemplate()

    // Assert: items render, just without accelerators — never a hardcoded ⌘3.
    expect(
      'accelerator' in findItem(template, 'Toggle Floating Navigator')!,
    ).toBe(false)
    expect('accelerator' in findItem(template, 'Toggle BrainDump')!).toBe(false)
  })

  it('refreshes the displayed hotkey after a rebind without losing recent tasks', () => {
    // Arrange: first render shows the default BrainDump hotkey with one task.
    const { manager } = createManager()
    let brainDumpAccelerator = 'Alt+Space'
    manager.setShortcutAcceleratorProvider(() => ({
      toggleBrainDump: brainDumpAccelerator,
    }))
    const tasks: TaskItem[] = [
      { title: 'Write the release notes', completed: false },
    ]
    manager.updateTrayMenu(tasks)

    // Act: the user rebinds BrainDump, then a refresh re-renders the tray.
    brainDumpAccelerator = 'CommandOrControl+Shift+B'
    manager.refreshTrayMenu()
    const template = lastBuiltTemplate()

    // Assert: the new hotkey shows AND the cached task survived the refresh.
    expect(findItem(template, 'Toggle BrainDump')?.accelerator).toBe(
      'CommandOrControl+Shift+B',
    )
    expect(
      template.some((item) => item.label?.includes('Write the release notes')),
    ).toBe(true)
  })
})

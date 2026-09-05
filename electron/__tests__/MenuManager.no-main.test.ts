import { Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigManager } from '../ConfigManager'
import { MenuManager } from '../MenuManager'
import type { WindowManager } from '../WindowManager'

// vitest hoists every vi.mock above the imports, so the electron + electron-updater
// + logger stubs are installed before MenuManager resolves at module load.
// Menu.buildFromTemplate captures the template each build produces, and
// setApplicationMenu records that a menu was actually installed — both let the
// test assert on the built menu rather than the native menu bar it can't see.
vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'CoreLive'), quit: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  dialog: {
    showMessageBox: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn((template) => ({ template })),
    setApplicationMenu: vi.fn(),
  },
  shell: { openExternal: vi.fn(async () => {}) },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: { on: vi.fn() },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/** Read the template array from the most recent Menu.buildFromTemplate call. */
function lastBuiltTemplate(): MenuItemConstructorOptions[] {
  const calls = vi.mocked(Menu.buildFromTemplate).mock.calls
  return calls[calls.length - 1]![0] as MenuItemConstructorOptions[]
}

/**
 * Collects every menu item label across the whole submenu tree so a test can
 * assert which items exist — and which retired ones do not — regardless of depth.
 *
 * @param items - A menu template (or a nested submenu) array.
 * @returns Every defined `label` found, depth-first.
 * @example
 * collectLabels([{ label: 'File', submenu: [{ label: 'New Task' }] }])
 * // => ['File', 'New Task']
 */
function collectLabels(items: MenuItemConstructorOptions[]): string[] {
  const labels: string[] = []
  for (const item of items) {
    if (typeof item.label === 'string') {
      labels.push(item.label)
    }
    if (Array.isArray(item.submenu)) {
      labels.push(...collectLabels(item.submenu))
    }
  }
  return labels
}

/**
 * Finds the first menu item with the given label anywhere in the submenu tree,
 * so a test can assert a nested item's `enabled` state.
 * @param items - A menu template (or a nested submenu) array.
 * @param label - The visible label to search for.
 * @returns The matching item, or undefined if none is found.
 * @example
 * findItemByLabel(template, 'Settings...')?.click // => the app-menu Settings handler
 */
function findItemByLabel(
  items: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (item.label === label) {
      return item
    }
    if (Array.isArray(item.submenu)) {
      const found = findItemByLabel(item.submenu, label)
      if (found) {
        return found
      }
    }
  }
  return undefined
}

/**
 * Builds a WindowManager stub exposing only what the menu's click handlers read
 * (none of which run during a build) — the menu builds purely from static items,
 * so the stub just satisfies `initialize`'s parameter type.
 * @returns A WindowManager-shaped stub.
 */
function createStubWindowManager(): WindowManager {
  return {
    getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
    openSettings: vi.fn(),
    toggleLiveEditor: vi.fn(),
  } as unknown as WindowManager
}

describe('MenuManager builds the application menu without a main window', () => {
  beforeEach(() => {
    vi.mocked(Menu.buildFromTemplate).mockClear()
    vi.mocked(Menu.setApplicationMenu).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('installs the full menu with the retired main-window-only items entirely absent', () => {
    // Arrange: companion mode — there has been no main window to host the menu
    // since T18; `initialize` takes no main-window reference at all.
    const menuManager = new MenuManager()
    const stubConfigManager = {} as unknown as ConfigManager

    // Act: the menu must still build (post-main-retirement / signed-out launch).
    const buildMenu = () =>
      menuManager.initialize(createStubWindowManager(), stubConfigManager)

    // Assert: it builds and installs a real menu.
    expect(buildMenu).not.toThrow()
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1)

    // ...with the standard top-level menus present (not collapsed to a shell)...
    const template = lastBuiltTemplate()
    const topLevelLabels = template.map((item) => item.label)
    expect(topLevelLabels).toEqual(
      expect.arrayContaining(['File', 'View', 'Window', 'Help']),
    )

    // ...and no resurrected "Show Main Window" item the retired main left behind.
    expect(collectLabels(template)).not.toContain('Show Main Window')

    // ...and the main-renderer-only actions (Import/Export/Find drove the main
    // renderer over `menu-action`, a channel with no renderer caller left) are
    // gone from the menu entirely — not merely disabled, since a permanently
    // dead click handler is worse than no item at all.
    expect(findItemByLabel(template, 'Import Tasks...')).toBeUndefined()
    expect(findItemByLabel(template, 'Export Tasks...')).toBeUndefined()
    expect(findItemByLabel(template, 'Find')).toBeUndefined()
  })

  it('opens Settings from the app menu without exposing the retired Preferences label', () => {
    // Arrange: initialize the manager so the app-menu click can reach WindowManager.
    const menuManager = new MenuManager()
    const stubWindowManager = createStubWindowManager()
    const stubConfigManager = {} as unknown as ConfigManager
    menuManager.initialize(stubWindowManager, stubConfigManager)
    const appMenu = menuManager.createAppMenu()

    // Act: click the visible Settings item from the native app menu.
    const settingsItem = findItemByLabel([appMenu], 'Settings...')
    ;(settingsItem?.click as () => void)?.()

    // Assert: the renamed label is visible, the retired label is absent, and
    // the click reaches the dedicated Settings window exactly once.
    expect(settingsItem).toBeDefined()
    expect(collectLabels([appMenu])).not.toContain('Preferences...')
    expect(stubWindowManager.openSettings).toHaveBeenCalledTimes(1)
  })
})

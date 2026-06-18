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
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
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
 * Builds a WindowManager stub exposing only what the menu's click handlers read
 * (none of which run during a build) — the menu builds purely from static items,
 * so the stub just satisfies the `initialize` parameter type.
 * @returns A WindowManager-shaped stub.
 */
function createStubWindowManager(): WindowManager {
  return {
    getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
    toggleFloatingNavigator: vi.fn(),
    toggleBrainDump: vi.fn(),
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

  it('installs the full menu with no dead main-window items when initialized with a null main window', () => {
    // Arrange: companion mode — there is no main window to host the menu.
    const menuManager = new MenuManager()
    const stubConfigManager = {} as unknown as ConfigManager

    // Act: the menu must still build (post-main-retirement / signed-out launch).
    const buildMenuWithoutMain = () =>
      menuManager.initialize(null, createStubWindowManager(), stubConfigManager)

    // Assert: it builds and installs a real menu — never throws on the null main.
    expect(buildMenuWithoutMain).not.toThrow()
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1)

    // ...with the standard top-level menus present (not collapsed to a shell)...
    const template = lastBuiltTemplate()
    const topLevelLabels = template.map((item) => item.label)
    expect(topLevelLabels).toEqual(
      expect.arrayContaining(['File', 'View', 'Window', 'Help']),
    )

    // ...and no resurrected "Show Main Window" item the retired main left behind.
    expect(collectLabels(template)).not.toContain('Show Main Window')
  })
})

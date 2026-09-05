/**
 * @fileoverview Persisted `window-state.json` handling for the LiveEditor panel.
 *
 * Covers the two things a stale or pre-rename state file must never do:
 *  - reset the user's geometry after the LiveEditor panel rename (legacy
 *    `braindump` key), and
 *  - reveal the panel on its own — visibility stays owned by
 *    {@link WindowManager}'s explicit, auth-gated show paths.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowStateManager.legacy-geometry
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mutable holder so the hoisted electron mock can resolve a fresh temp
// userData directory per test (vi.mock factories cannot close over later-
// declared variables, so hoist the accessor).
const userDataDir = vi.hoisted(() => ({ current: '' }))

// electron mock: a fresh temp userData dir, a single primary display, and a
// no-op screen event surface.
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir.current) },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      workAreaSize: { width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getAllDisplays: vi.fn(() => [
      {
        id: 1,
        workAreaSize: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
    on: vi.fn(),
  },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ConfigManager is a type-only import (erased at runtime); WindowStateManager is
// imported after the mocks so its `import { app, screen }` resolves to the stubs.
import type { ConfigManager } from '../ConfigManager'
import { WindowStateManager } from '../WindowStateManager'

/**
 * Builds a stub ConfigManager whose `getSection` returns the minimal shapes
 * `getDefaultWindowStates` reads.
 *
 * @returns A ConfigManager-shaped stub for constructing WindowStateManager.
 * @example
 * new WindowStateManager(createConfigManager())
 */
function createConfigManager(): ConfigManager {
  const sections: Record<string, unknown> = {
    window: { main: { width: 1200, height: 800, startMaximized: false } },
    liveEditor: { width: 480, height: 640 },
  }
  const configManager = {
    getSection: (section: string) => sections[section],
  }
  return configManager as unknown as ConfigManager
}

/**
 * Persists a raw window-state.json into the active temp userData dir so the next
 * `new WindowStateManager()` loads and validates it (instead of falling back to
 * defaults), exercising the persisted-state path through validateWindowState.
 *
 * @param rawStates - Partial window-state object to persist verbatim.
 * @example
 * writeWindowStateFile({ braindump: { x: 120, y: 90, width: 620, height: 710 } })
 */
function writeWindowStateFile(rawStates: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(userDataDir.current, 'window-state.json'),
    JSON.stringify(rawStates),
    'utf8',
  )
}

describe('WindowStateManager legacy geometry', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own empty temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-window-state-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('preserves saved LiveEditor geometry written before the panel rename', () => {
    // Arrange: previous releases stored the panel under this legacy wire key.
    writeWindowStateFile({
      braindump: { x: 120, y: 90, width: 620, height: 710 },
    })
    const manager = new WindowStateManager(createConfigManager())

    // Act
    const liveEditor = manager.getWindowState('liveEditor')

    // Assert: the rename does not reset the user's window placement or size.
    expect(liveEditor?.x).toBe(120)
    expect(liveEditor?.y).toBe(90)
    expect(liveEditor?.width).toBe(620)
    expect(liveEditor?.height).toBe(710)
  })
})

/**
 * Builds the BrowserWindow surface `applyWindowState` needs without creating a
 * real Electron window.
 *
 * @returns BrowserWindow-shaped mock whose reveal/geometry calls are spies.
 * @example
 * const browserWindow = createBrowserWindowMock()
 */
function createBrowserWindowMock(): BrowserWindow & {
  show: ReturnType<typeof vi.fn>
} {
  return {
    isDestroyed: vi.fn(() => false),
    setAlwaysOnTop: vi.fn(),
    show: vi.fn(),
  } as unknown as BrowserWindow & {
    show: ReturnType<typeof vi.fn>
  }
}

describe('WindowStateManager persisted visibility', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own empty temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-window-state-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('does not reveal the LiveEditor panel while applying persisted state', () => {
    // Arrange: a stale state file claims the panel was visible last session.
    // Restoring that here would show the panel before the signed-out auth gate
    // in WindowManager has had any say.
    writeWindowStateFile({
      liveEditor: { isVisible: true, width: 480, height: 720 },
    })
    const manager = new WindowStateManager(createConfigManager())
    const browserWindow = createBrowserWindowMock()

    // Act
    const applied = manager.applyWindowState('liveEditor', browserWindow)

    // Assert: `true` proves the persisted state was found and the method ran
    // past its null-guard, so `show` going uncalled is the invariant holding —
    // not the method bailing out early.
    expect(applied).toBe(true)
    expect(browserWindow.show).not.toHaveBeenCalled()
  })
})

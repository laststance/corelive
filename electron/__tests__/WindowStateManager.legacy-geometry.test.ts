/**
 * @fileoverview LiveEditor legacy-geometry migration test.
 *
 * Exercises `WindowStateManager` loading a `window-state.json` written before
 * the LiveEditor panel rename (stored under the legacy `braindump` key), so an
 * upgrade never resets the user's panel placement or size.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowStateManager.legacy-geometry
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

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

/**
 * @fileoverview Floating-window startup-visibility wiring tests.
 *
 * Exercises `WindowStateManager.getDefaultWindowStates` — specifically that the
 * floating navigator's default `isVisible` now follows
 * `behavior.startup.showFloating` (the single source of truth) instead of the
 * retired `window.floating.startVisible` flag.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- WindowStateManager.startup
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mutable holder so the hoisted electron mock can resolve a fresh temp
// userData directory per test (vi.mock factories cannot close over later-
// declared variables, so hoist the accessor).
const userDataDir = vi.hoisted(() => ({ current: '' }))

// electron mock: a fresh temp userData dir (so no saved window-state.json
// exists and the constructor falls back to getDefaultWindowStates), a single
// primary display, and a no-op screen event surface.
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir.current) },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      workAreaSize: { width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getAllDisplays: vi.fn(() => []),
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
 * `getDefaultWindowStates` reads, with the floating startup choice injected.
 *
 * @param showFloating - The `behavior.startup.showFloating` value under test.
 * @returns A ConfigManager-shaped stub for constructing WindowStateManager.
 * @example
 * new WindowStateManager(createConfigManager(true))
 */
function createConfigManager(showFloating: boolean): ConfigManager {
  const sections: Record<string, unknown> = {
    window: {
      main: { width: 1200, height: 800, startMaximized: false },
      floating: { width: 360, height: 600, alwaysOnTop: true },
    },
    braindump: { width: 480, height: 640 },
    behavior: {
      startup: { showMain: true, showBraindump: false, showFloating },
    },
  }
  const configManager = {
    getSection: (section: string) => sections[section],
  }
  return configManager as unknown as ConfigManager
}

describe('WindowStateManager floating startup visibility', () => {
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

  it('opens the floating window at launch when startup.showFloating is true', () => {
    // Arrange: a config where the user chose to start the floating navigator.
    const manager = new WindowStateManager(createConfigManager(true))

    // Act
    const states = manager.getDefaultWindowStates()

    // Assert: the floating window's default visibility follows the startup choice.
    expect(states.floating.isVisible).toBe(true)
  })

  it('keeps the floating window hidden at launch when startup.showFloating is false', () => {
    // Arrange: a config where floating is left off at startup.
    const manager = new WindowStateManager(createConfigManager(false))

    // Act
    const states = manager.getDefaultWindowStates()

    // Assert
    expect(states.floating.isVisible).toBe(false)
  })
})

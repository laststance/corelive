import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mutable holder so the hoisted electron mock resolves a fresh temp userData
// directory per test (vi.mock factories cannot close over later-declared vars).
const userDataDir = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir.current),
  },
}))

// Silence the real pino logger so config-load warnings never spew into output.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imported after the mock so ConfigManager's `import { app }` is stubbed.
import { ConfigManager } from '../ConfigManager'

describe('ConfigManager appearance config', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-config-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
  })

  it('does not carry a native theme or accent color — the web app owns theme via localStorage', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    const appearance = configManager.getDefaultConfig().appearance

    // Assert: a native theme/accentColor would silently drift from the real,
    // web-persisted value, so neither must reappear in the Electron config.
    expect(appearance).not.toHaveProperty('theme')
    expect(appearance).not.toHaveProperty('accentColor')
  })

  it('still exposes the surviving appearance settings (fontSize, compactMode)', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    const appearance = configManager.getDefaultConfig().appearance

    // Assert: only the two theme-related fields were removed; the appearance
    // section itself (a valid IPC ConfigSection) keeps its real settings.
    expect(appearance).toEqual({
      fontSize: 'medium',
      compactMode: false,
    })
  })
})

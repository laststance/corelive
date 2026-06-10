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

  it('strips legacy theme/accentColor from an existing config.json on load', () => {
    // Arrange: a pre-T9 config.json that still carries the removed native theme
    // fields alongside a NON-default fontSize (the load-actually-happened proof).
    fs.writeFileSync(
      path.join(userDataDir.current, 'config.json'),
      JSON.stringify({
        appearance: {
          fontSize: 'large',
          compactMode: false,
          theme: 'dark',
          accentColor: '#ff0000',
        },
      }),
    )

    // Act: the constructor loads config.json from the mocked userData dir.
    const appearance = new ConfigManager().getSection('appearance')

    // Assert: fontSize:'large' proves the fixture was loaded (defaults are
    // 'medium'), and the dead native keys are gone — config converged to the
    // new {fontSize, compactMode} shape instead of carrying them forever.
    expect(appearance.fontSize).toBe('large')
    expect(appearance).not.toHaveProperty('theme')
    expect(appearance).not.toHaveProperty('accentColor')
  })

  it('strips legacy theme/accentColor from an imported config file', () => {
    // Arrange: an export from an older build, carrying the removed keys plus a
    // non-default fontSize so we can prove the import path ran (not the load).
    const importPath = path.join(userDataDir.current, 'imported.json')
    fs.writeFileSync(
      importPath,
      JSON.stringify({
        appearance: {
          fontSize: 'small',
          compactMode: true,
          theme: 'light',
          accentColor: '#00ff00',
        },
      }),
    )
    const configManager = new ConfigManager()

    // Act
    const didImport = configManager.importConfig(importPath)

    // Assert: import succeeded, the imported fontSize:'small' took effect, and
    // the legacy native theme keys never made it into the active config.
    expect(didImport).toBe(true)
    const appearance = configManager.getSection('appearance')
    expect(appearance.fontSize).toBe('small')
    expect(appearance).not.toHaveProperty('theme')
    expect(appearance).not.toHaveProperty('accentColor')
  })
})

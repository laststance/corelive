import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mutable holder so the hoisted electron mock can resolve a fresh temp
// userData directory per test (vi.mock factories cannot close over later-
// declared variables, so hoist the accessor).
const userDataDir = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir.current),
  },
}))

// Imported after the mock so ConfigManager's `import { app }` is stubbed.
import { ConfigManager } from '../ConfigManager'

/**
 * Writes a raw config.json into the active temp userData dir so the next
 * `new ConfigManager()` loads (and migrates/normalizes) it from disk.
 *
 * @param rawConfig - Partial config object to persist verbatim.
 * @example
 * writeConfigFile({ behavior: { startup: { showMain: false, showBraindump: true, showFloating: false } } })
 */
function writeConfigFile(rawConfig: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(userDataDir.current, 'config.json'),
    JSON.stringify(rawConfig),
    'utf8',
  )
}

describe('ConfigManager startup-window config', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-config-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
  })

  it('defaults to opening only the main window at launch', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    const startup = configManager.getDefaultConfig().behavior.startup

    // Assert
    expect(startup).toEqual({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
  })

  it('re-enables the main window when update() turns every startup window off', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act: disable all three at once, which would boot zero windows.
    configManager.update({
      'behavior.startup.showMain': false,
      'behavior.startup.showBraindump': false,
      'behavior.startup.showFloating': false,
    })

    // Assert: the invariant backstop restores the main window.
    expect(configManager.getSection('behavior').startup).toEqual({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
  })

  it('re-enables the main window when set() replaces the startup block with all-false', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    configManager.set('behavior.startup', {
      showMain: false,
      showBraindump: false,
      showFloating: false,
    })

    // Assert
    expect(configManager.getSection('behavior').startup.showMain).toBe(true)
  })

  it('preserves a panel-only startup config from disk without forcing the main window on', () => {
    // Arrange: a Brain-Dump-only launch already satisfies the >=1 invariant.
    writeConfigFile({
      behavior: {
        startup: { showMain: false, showBraindump: true, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: main stays hidden; the user's panel-only choice is honored.
    expect(configManager.getSection('behavior').startup).toEqual({
      showMain: false,
      showBraindump: true,
      showFloating: false,
    })
  })

  it('migrates a legacy startVisible:true file into showFloating on first load', () => {
    // Arrange: a pre-feature config with the old floating flag and no startup.
    writeConfigFile({
      window: { floating: { startVisible: true } },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: floating carries over; main remains on (default).
    const startup = configManager.getSection('behavior').startup
    expect(startup.showFloating).toBe(true)
    expect(startup.showMain).toBe(true)
  })

  it('does not override an explicit showFloating:false even when legacy startVisible is true', () => {
    // Arrange: user already opted out of floating under the new model.
    writeConfigFile({
      window: { floating: { startVisible: true } },
      behavior: {
        startup: { showMain: true, showBraindump: false, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the explicit choice wins; migration is idempotent.
    expect(configManager.getSection('behavior').startup.showFloating).toBe(
      false,
    )
  })

  it('leaves showFloating off when no legacy startVisible flag is present', () => {
    // Arrange: a config that never set the legacy flag.
    writeConfigFile({
      window: { floating: { startVisible: false } },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.getSection('behavior').startup.showFloating).toBe(
      false,
    )
  })

  it('repairs an all-false startup block persisted in config.json on load', () => {
    // Arrange: a hand-edited file that would otherwise boot zero windows.
    writeConfigFile({
      behavior: {
        startup: { showMain: false, showBraindump: false, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.getSection('behavior').startup.showMain).toBe(true)
  })
})

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

// Silence the real pino logger; the invariant-repair paths log.warn on a
// corrupted config, which would otherwise spew into the test output.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

/**
 * Writes a raw config object to a standalone file (NOT config.json) and returns
 * its path, so a test can drive `configManager.importConfig(path)`. The import
 * path runs the same migrate → merge → invariant pipeline as a disk load, but
 * through a different entry point worth covering independently.
 *
 * @param rawConfig - Partial config object to persist verbatim for import.
 * @returns Absolute path to the written import file.
 * @example
 * const path = writeImportFile({ window: { floating: { startVisible: true } } })
 * configManager.importConfig(path)
 */
function writeImportFile(rawConfig: Record<string, unknown>): string {
  const importPath = path.join(userDataDir.current, 'imported-config.json')
  fs.writeFileSync(importPath, JSON.stringify(rawConfig), 'utf8')
  return importPath
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

  it('migrates a legacy startVisible:true file when imported, not only on disk load', () => {
    // Arrange: a default-state manager plus a pre-feature file to import.
    const configManager = new ConfigManager()
    const importPath = writeImportFile({
      window: { floating: { startVisible: true } },
    })

    // Act
    configManager.importConfig(importPath)

    // Assert: the import entry point runs the same legacy migration as load.
    expect(configManager.getSection('behavior').startup.showFloating).toBe(true)
  })

  it('repairs an all-false startup block carried in by an imported file', () => {
    // Arrange: an exported config that would otherwise boot zero windows.
    const configManager = new ConfigManager()
    const importPath = writeImportFile({
      behavior: {
        startup: { showMain: false, showBraindump: false, showFloating: false },
      },
    })

    // Act
    configManager.importConfig(importPath)

    // Assert: the >=1 invariant is enforced on import, not only on load.
    expect(configManager.getSection('behavior').startup.showMain).toBe(true)
  })

  it('resets a non-object behavior block from disk to the default startup config', () => {
    // Arrange: a corrupted file where `behavior` is a string, not an object.
    writeConfigFile({ behavior: 'corrupted' })

    // Act
    const configManager = new ConfigManager()

    // Assert: the whole behavior block is rebuilt so the boot-time
    // `behavior.startup` read can never throw or read garbage.
    expect(configManager.getSection('behavior').startup).toEqual({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
  })

  it('resets a non-object startup block from disk to the default startup config', () => {
    // Arrange: `behavior` is a valid object but its `startup` is corrupted.
    writeConfigFile({ behavior: { startup: 'corrupted' } })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.getSection('behavior').startup).toEqual({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
  })

  it('resets an array startup block from disk to the default startup config', () => {
    // Arrange: `startup` is a JSON array. `typeof [] === 'object'`, so a bare
    // typeof guard would accept it and then strand every window false.
    writeConfigFile({ behavior: { startup: [] } })

    // Act
    const configManager = new ConfigManager()

    // Assert: the array is rejected and the startup block rebuilt from defaults.
    expect(configManager.getSection('behavior').startup).toEqual({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
  })

  it('resets an array behavior block from disk to the default startup config', () => {
    // Arrange: `behavior` itself is a JSON array (typeof 'object', not a record).
    writeConfigFile({ behavior: [] })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.getSection('behavior').startup).toEqual({
      showMain: true,
      showBraindump: false,
      showFloating: false,
    })
  })

  it('migrates a legacy startVisible flag without discarding unrelated settings when behavior is corrupt', () => {
    // Arrange: a corrupt string `behavior` alongside the legacy floating flag and
    // a custom main-window width. Pre-fix, writing `.startup` onto the string
    // threw, aborting loadConfig into a FULL default reset that lost the width.
    writeConfigFile({
      window: { main: { width: 1234 }, floating: { startVisible: true } },
      behavior: 'corrupted',
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the legacy flag migrated to showFloating, AND the unrelated custom
    // width survived (proving loadConfig did not fall back to a full-config reset).
    expect(configManager.getSection('behavior').startup.showFloating).toBe(true)
    expect(configManager.getSection('window').main.width).toBe(1234)
  })

  it('migrates a legacy startVisible flag when behavior is a corrupt array, not only a string', () => {
    // Arrange: `behavior` is a JSON array (the sneaky case — `typeof [] === 'object'`)
    // alongside the legacy floating flag. The migrate must replace the array with a
    // real object instead of writing a lost expando onto it and dropping the intent.
    writeConfigFile({
      window: { floating: { startVisible: true } },
      behavior: [],
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: legacy intent carried into showFloating; main stays on (default).
    const startup = configManager.getSection('behavior').startup
    expect(startup.showFloating).toBe(true)
    expect(startup.showMain).toBe(true)
  })
})

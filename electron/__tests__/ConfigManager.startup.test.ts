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
 * `new ConfigManager()` loads (and migrates/normalizes) it from disk. Typed as a
 * loose record so a test can persist a legacy shape (e.g. the retired `showMain`
 * key) that no longer exists on `StartupWindowConfig`.
 *
 * @param rawConfig - Partial config object to persist verbatim.
 * @example
 * writeConfigFile({ behavior: { startup: { showBraindump: true, showFloating: false } } })
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

  it('defaults to opening the Floating Navigator at launch', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    const startup = configManager.getDefaultConfig().behavior.startup

    // Assert: the Floating Navigator is the front door after main-window
    // retirement (T18), so it is the boot-safe default.
    expect(startup).toEqual({
      showBraindump: false,
      showFloating: true,
    })
  })

  it('re-enables the Floating Navigator when update() turns every startup window off', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act: disable both panels at once, which would boot zero windows.
    configManager.update({
      'behavior.startup.showBraindump': false,
      'behavior.startup.showFloating': false,
    })

    // Assert: the invariant backstop restores the Floating Navigator.
    expect(configManager.getSection('behavior').startup).toEqual({
      showBraindump: false,
      showFloating: true,
    })
  })

  it('re-enables the Floating Navigator when set() replaces the startup block with all-false', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    configManager.set('behavior.startup', {
      showBraindump: false,
      showFloating: false,
    })

    // Assert
    expect(configManager.getSection('behavior').startup.showFloating).toBe(true)
  })

  it('migrates a legacy main-only config from disk into the Floating Navigator, dropping the retired showMain key', () => {
    // Arrange: a config persisted before main-window retirement — the factory
    // default every untouched install carried (main on, both panels off).
    writeConfigFile({
      behavior: {
        startup: { showMain: true, showBraindump: false, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the now-defunct main choice migrates to the Floating front door
    // instead of booting a blank desktop, and the retired key is pruned (the
    // exact-shape match proves no stray `showMain` lingers in the saved config).
    const startup = configManager.getSection('behavior').startup
    expect(startup).toEqual({
      showBraindump: false,
      showFloating: true,
    })
    expect('showMain' in startup).toBe(false)
  })

  it('honors a Brain-Dump-only choice from disk without forcing another window on', () => {
    // Arrange: a legacy Brain-Dump-only launch already satisfies the >=1
    // invariant, so retiring main must not spuriously enable Floating too.
    writeConfigFile({
      behavior: {
        startup: { showMain: false, showBraindump: true, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the panel-only choice is honored and the retired key dropped.
    expect(configManager.getSection('behavior').startup).toEqual({
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

    // Assert: the legacy floating intent carries over to showFloating.
    const startup = configManager.getSection('behavior').startup
    expect(startup.showFloating).toBe(true)
    expect(startup.showBraindump).toBe(false)
  })

  it('does not override an explicit showFloating:false even when legacy startVisible is true', () => {
    // Arrange: user opted out of floating under the new model but kept Brain
    // Dump on, so the >=1 invariant is satisfied without floating.
    writeConfigFile({
      window: { floating: { startVisible: true } },
      behavior: {
        startup: { showBraindump: true, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the explicit choice wins; the startVisible migration is idempotent.
    expect(configManager.getSection('behavior').startup.showFloating).toBe(
      false,
    )
  })

  it('does not migrate a legacy startVisible:false flag into showFloating', () => {
    // Arrange: a present-but-false legacy flag alongside a Brain-Dump-only
    // choice — the false flag must not flip floating on (Brain Dump keeps the
    // invariant satisfied so the Floating default can't mask the migration).
    writeConfigFile({
      window: { floating: { startVisible: false } },
      behavior: {
        startup: { showBraindump: true, showFloating: false },
      },
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

    // Assert: the >=1 invariant repairs it to the Floating front door.
    expect(configManager.getSection('behavior').startup.showFloating).toBe(true)
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
    expect(configManager.getSection('behavior').startup.showFloating).toBe(true)
  })

  it('resets a non-object behavior block from disk to the default startup config', () => {
    // Arrange: a corrupted file where `behavior` is a string, not an object.
    writeConfigFile({ behavior: 'corrupted' })

    // Act
    const configManager = new ConfigManager()

    // Assert: the whole behavior block is rebuilt so the boot-time
    // `behavior.startup` read can never throw or read garbage.
    expect(configManager.getSection('behavior').startup).toEqual({
      showBraindump: false,
      showFloating: true,
    })
  })

  it('resets a non-object startup block from disk to the default startup config', () => {
    // Arrange: `behavior` is a valid object but its `startup` is corrupted.
    writeConfigFile({ behavior: { startup: 'corrupted' } })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.getSection('behavior').startup).toEqual({
      showBraindump: false,
      showFloating: true,
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
      showBraindump: false,
      showFloating: true,
    })
  })

  it('resets an array behavior block from disk to the default startup config', () => {
    // Arrange: `behavior` itself is a JSON array (typeof 'object', not a record).
    writeConfigFile({ behavior: [] })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.getSection('behavior').startup).toEqual({
      showBraindump: false,
      showFloating: true,
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

    // Assert: legacy intent carried into showFloating.
    const startup = configManager.getSection('behavior').startup
    expect(startup.showFloating).toBe(true)
    expect(startup.showBraindump).toBe(false)
  })
})

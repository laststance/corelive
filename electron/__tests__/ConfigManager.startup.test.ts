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
 * writeConfigFile({ behavior: { startup: { showLiveEditor: true, showFloating: false } } })
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
      showLiveEditor: false,
      showFloating: true,
    })
  })

  it('keeps the original config file when a later migration rejects its version', () => {
    // Arrange: the rename migration runs first, then the invalid numeric version
    // makes compareVersions abort before the loaded config is accepted.
    writeConfigFile({
      version: 1,
      window: { main: { width: 1337 } },
      braindump: { notes: { '1': 'Never overwrite me' } },
    })
    const configPath = path.join(userDataDir.current, 'config.json')
    const originalConfig = fs.readFileSync(configPath, 'utf8')

    // Act
    new ConfigManager()

    // Assert: fallback defaults stay in memory only; user data remains byte-identical.
    expect(fs.readFileSync(configPath, 'utf8')).toBe(originalConfig)
  })

  it('re-enables the Floating Navigator when update() turns every startup window off', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act: disable both panels at once, which would boot zero windows.
    configManager.update({
      'behavior.startup.showLiveEditor': false,
      'behavior.startup.showFloating': false,
    })

    // Assert: the invariant backstop restores the Floating Navigator.
    expect(configManager.getSection('behavior').startup).toEqual({
      showLiveEditor: false,
      showFloating: true,
    })
  })

  it('re-enables the Floating Navigator when set() replaces the startup block with all-false', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    configManager.set('behavior.startup', {
      showLiveEditor: false,
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
        startup: { showMain: true, showLiveEditor: false, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the now-defunct main choice migrates to the Floating front door
    // instead of booting a blank desktop, and the retired key is pruned (the
    // exact-shape match proves no stray `showMain` lingers in the saved config).
    const startup = configManager.getSection('behavior').startup
    expect(startup).toEqual({
      showLiveEditor: false,
      showFloating: true,
    })
    expect('showMain' in startup).toBe(false)
  })

  it('honors a LiveEditor-only choice from disk without forcing another window on', () => {
    // Arrange: a legacy LiveEditor-only launch already satisfies the >=1
    // invariant, so retiring main must not spuriously enable Floating too.
    writeConfigFile({
      behavior: {
        startup: { showMain: false, showLiveEditor: true, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the panel-only choice is honored and the retired key dropped.
    expect(configManager.getSection('behavior').startup).toEqual({
      showLiveEditor: true,
      showFloating: false,
    })
  })

  it('preserves panel notes, shortcuts, and startup choice across the LiveEditor rename', () => {
    // Arrange: simulate the exact config shape written by the previous release.
    writeConfigFile({
      braindump: {
        width: 620,
        notes: { '7': 'Keep this note' },
      },
      shortcuts: {
        toggleBrainDump: 'Alt+Space',
        toggleBrainDumpSecondary: 'Control+Shift+B',
      },
      behavior: {
        startup: { showBraindump: true, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()
    const persisted = JSON.parse(
      fs.readFileSync(path.join(userDataDir.current, 'config.json'), 'utf8'),
    ) as Record<string, unknown>

    // Assert: user content and preferences move to one canonical shape on disk.
    expect(configManager.get('liveEditor.notes', {})).toEqual({
      '7': 'Keep this note',
    })
    expect(configManager.get('liveEditor.width', 0)).toBe(620)
    expect(configManager.get('shortcuts.toggleLiveEditor', '')).toBe(
      'Alt+Space',
    )
    expect(configManager.get('shortcuts.toggleLiveEditorSecondary', '')).toBe(
      'Control+Shift+B',
    )
    expect(configManager.getSection('behavior').startup).toEqual({
      showLiveEditor: true,
      showFloating: false,
    })
    expect('braindump' in persisted).toBe(false)
  })

  it('keeps every category note when interrupted migration data contains both panel sections', () => {
    // Arrange: the legacy and canonical sections each own a different category;
    // the duplicate category proves canonical text wins deterministically.
    writeConfigFile({
      braindump: {
        notes: { '1': 'Legacy-only note', '2': 'Older duplicate' },
      },
      liveEditor: {
        notes: { '2': 'Canonical duplicate', '3': 'Canonical-only note' },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: no category disappears while the new section remains authoritative.
    expect(configManager.get('liveEditor.notes', {})).toEqual({
      '1': 'Legacy-only note',
      '2': 'Canonical duplicate',
      '3': 'Canonical-only note',
    })
  })

  it('migrates a legacy startVisible:true file into showFloating on first load', () => {
    // Arrange: a pre-feature config with the old floating flag and no startup.
    writeConfigFile({
      window: { floating: { startVisible: true } },
    })

    // Act
    const configManager = new ConfigManager()
    const persisted = JSON.parse(
      fs.readFileSync(path.join(userDataDir.current, 'config.json'), 'utf8'),
    ) as Record<string, unknown>

    // Assert: the legacy floating intent carries over and the old disk key is removed.
    const startup = configManager.getSection('behavior').startup
    expect(startup.showFloating).toBe(true)
    expect(startup.showLiveEditor).toBe(false)
    expect(persisted).not.toHaveProperty('window.floating.startVisible')
    expect(persisted).toHaveProperty('behavior.startup.showFloating', true)
  })

  it('does not override an explicit showFloating:false even when legacy startVisible is true', () => {
    // Arrange: user opted out of floating under the new model but kept
    // LiveEditor on, so the >=1 invariant is satisfied without floating.
    writeConfigFile({
      window: { floating: { startVisible: true } },
      behavior: {
        startup: { showLiveEditor: true, showFloating: false },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: the explicit choice wins; the startVisible migration is idempotent.
    expect(configManager.getSection('behavior').startup.showFloating).toBe(
      false,
    )
  })

  it('keeps Floating Navigator disabled when the legacy LiveEditor starts instead', () => {
    // Arrange: both startup choices use their pre-rename keys. LiveEditor keeps
    // the startup invariant valid while Floating must preserve its explicit OFF.
    writeConfigFile({
      window: { floating: { startVisible: false } },
      behavior: {
        startup: { showBraindump: true },
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert: defaults cannot turn Floating back on during the raw-config merge.
    expect(configManager.getSection('behavior').startup).toEqual({
      showLiveEditor: true,
      showFloating: false,
    })
  })

  it('repairs an all-false startup block persisted in config.json on load', () => {
    // Arrange: a hand-edited file that would otherwise boot zero windows.
    writeConfigFile({
      behavior: {
        startup: {
          showMain: false,
          showLiveEditor: false,
          showFloating: false,
        },
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
        startup: {
          showMain: false,
          showLiveEditor: false,
          showFloating: false,
        },
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
      showLiveEditor: false,
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
      showLiveEditor: false,
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
      showLiveEditor: false,
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
      showLiveEditor: false,
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
    expect(startup.showLiveEditor).toBe(false)
  })
})

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

// Silence the real pino logger; migration paths log on a corrupted config,
// which would otherwise spew into the test output.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imported after the mock so ConfigManager's `import { app }` is stubbed.
import { ConfigManager } from '../ConfigManager'

/** Every key retired with the Floating Navigator, as an older config.json carries them. */
const RETIRED_CONFIG_FIXTURE = {
  window: {
    main: { width: 1234 },
    floating: { width: 300, alwaysOnTop: true, visibleOnAllWorkspaces: true },
  },
  shortcuts: {
    toggleFloatingNavigator: 'CommandOrControl+3',
    focusFloatingNavigator: 'CommandOrControl+Shift+N',
    toggleAlwaysOnTop: 'CommandOrControl+Shift+A',
    toggleLiveEditor: 'Alt+Space',
  },
  behavior: {
    startOnLogin: true,
    startup: { showLiveEditor: false, showFloating: true },
  },
  liveEditor: {
    syncMode: false,
    lastCategoryId: 3,
    notes: { '3': 'Keep this note' },
  },
}

/**
 * Writes a raw config.json into the active temp userData dir so the next
 * `new ConfigManager()` loads (and migrates/normalizes) it from disk. Typed as a
 * loose record so a test can persist a legacy shape that no longer exists on
 * `AppConfig`.
 *
 * @param rawConfig - Partial config object to persist verbatim.
 * @example
 * writeConfigFile({ braindump: { notes: { '7': 'Keep this note' } } })
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
 * path runs the same migrate → merge pipeline as a disk load, but through a
 * different entry point worth covering independently.
 *
 * @param rawConfig - Partial config object to persist verbatim for import.
 * @returns Absolute path to the written import file.
 * @example
 * const path = writeImportFile({ window: { floating: { width: 300 } } })
 * configManager.importConfig(path)
 */
function writeImportFile(rawConfig: Record<string, unknown>): string {
  const importPath = path.join(userDataDir.current, 'imported-config.json')
  fs.writeFileSync(importPath, JSON.stringify(rawConfig), 'utf8')
  return importPath
}

/** Reads the persisted config.json back as a loose record. */
function readPersistedConfig(): Record<string, Record<string, unknown>> {
  return JSON.parse(
    fs.readFileSync(path.join(userDataDir.current, 'config.json'), 'utf8'),
  ) as Record<string, Record<string, unknown>>
}

/**
 * Asserts none of the retired Floating-era keys survive in a config snapshot.
 * @param config - In-memory sections or the persisted file.
 */
function expectNoRetiredKeys(
  config: Record<string, Record<string, unknown>>,
): void {
  expect(config.window).not.toHaveProperty('floating')
  expect(config.shortcuts).not.toHaveProperty('toggleFloatingNavigator')
  expect(config.shortcuts).not.toHaveProperty('focusFloatingNavigator')
  expect(config.shortcuts).not.toHaveProperty('toggleAlwaysOnTop')
  expect(config.behavior).not.toHaveProperty('startup')
  expect(config.liveEditor).not.toHaveProperty('syncMode')
  expect(config.liveEditor).not.toHaveProperty('lastCategoryId')
}

/** Snapshot the sections the retired keys lived in. */
function sectionsOf(
  configManager: ConfigManager,
): Record<string, Record<string, unknown>> {
  return {
    window: configManager.getSection('window') as unknown as Record<
      string,
      unknown
    >,
    shortcuts: configManager.getSection('shortcuts') as unknown as Record<
      string,
      unknown
    >,
    behavior: configManager.getSection('behavior') as unknown as Record<
      string,
      unknown
    >,
    liveEditor: configManager.getSection('liveEditor') as unknown as Record<
      string,
      unknown
    >,
  }
}

describe('ConfigManager legacy migrations', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-config-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
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

    // Act: load the file, run migrations, and fall back after version rejection.
    const configManager = new ConfigManager()

    // Assert: runtime state uses pristine defaults while user data remains byte-identical.
    expect(configManager.get('window.main.width', 0)).toBe(1200)
    expect(configManager.get('liveEditor.notes', { unexpected: true })).toEqual(
      {},
    )
    expect(fs.readFileSync(configPath, 'utf8')).toBe(originalConfig)
  })

  it('preserves panel notes and shortcuts across the LiveEditor rename', () => {
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
    })

    // Act
    const configManager = new ConfigManager()
    const persisted = readPersistedConfig()

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

  describe('pruneRetiredConfigKeys (Floating Navigator retirement)', () => {
    it('strips every retired key from an upgraded config.json on load, in memory and on disk', () => {
      // Arrange: a config written by a Floating-era release.
      writeConfigFile(RETIRED_CONFIG_FIXTURE)

      // Act
      const configManager = new ConfigManager()

      // Assert: retired keys are gone; unrelated user values survive.
      expectNoRetiredKeys(sectionsOf(configManager))
      expectNoRetiredKeys(readPersistedConfig())
      expect(configManager.get('window.main.width', 0)).toBe(1234)
      expect(configManager.get('shortcuts.toggleLiveEditor', '')).toBe(
        'Alt+Space',
      )
      expect(configManager.get('behavior.startOnLogin', false)).toBe(true)
      expect(configManager.get('liveEditor.notes', {})).toEqual({
        '3': 'Keep this note',
      })
    })

    it('strips every retired key from an imported config file', () => {
      // Arrange
      const configManager = new ConfigManager()
      const importPath = writeImportFile(RETIRED_CONFIG_FIXTURE)

      // Act
      const didImport = configManager.importConfig(importPath)

      // Assert
      expect(didImport).toBe(true)
      expectNoRetiredKeys(sectionsOf(configManager))
      expectNoRetiredKeys(readPersistedConfig())
      expect(configManager.get('liveEditor.notes', {})).toEqual({
        '3': 'Keep this note',
      })
    })

    it('does not throw when a section holding a retired key is not an object', () => {
      // Arrange: hand-edited garbage where sections should be.
      writeConfigFile({
        window: [],
        shortcuts: 'corrupted',
        behavior: { startup: 'corrupted', startOnLogin: true },
      })

      // Act: one load only — a second instance would read the already-pruned
      // file and prove nothing about the garbage sections.
      let configManager!: ConfigManager
      expect(() => {
        configManager = new ConfigManager()
      }).not.toThrow()

      // Assert: the load completed and the retired key is still dropped.
      expect(configManager.getSection('behavior')).not.toHaveProperty('startup')
      expect(configManager.get('behavior.startOnLogin', false)).toBe(true)
    })

    it('leaves a pristine config.json untouched (no rewrite when nothing was pruned)', () => {
      // Arrange: a config in the current shape, exactly as the app would save it.
      const pristineConfig = new ConfigManager().getDefaultConfig()
      writeConfigFile(pristineConfig)
      const configPath = path.join(userDataDir.current, 'config.json')
      const before = fs.readFileSync(configPath, 'utf8')

      // Act
      new ConfigManager()

      // Assert: byte-identical — no spurious write on every launch.
      expect(fs.readFileSync(configPath, 'utf8')).toBe(before)
    })

    it('prunes syncMode/lastCategoryId even when they arrive through the legacy braindump section', () => {
      // Arrange: a pre-rename config. The braindump → liveEditor migration
      // spreads the whole section, so the prune must run AFTER it.
      const legacyConfig = {
        braindump: {
          syncMode: false,
          lastCategoryId: 3,
          notes: { '3': 'Keep this note' },
        },
      }
      writeConfigFile(legacyConfig)

      // Act: disk load.
      const configManager = new ConfigManager()

      // Assert: notes migrated, retired keys absent in memory and on disk.
      expect(configManager.get('liveEditor.notes', {})).toEqual({
        '3': 'Keep this note',
      })
      expect(configManager.getSection('liveEditor')).not.toHaveProperty(
        'syncMode',
      )
      expect(configManager.getSection('liveEditor')).not.toHaveProperty(
        'lastCategoryId',
      )
      expect(readPersistedConfig().liveEditor).not.toHaveProperty('syncMode')
      expect(readPersistedConfig().liveEditor).not.toHaveProperty(
        'lastCategoryId',
      )

      // Act: the import entry point runs the same pipeline.
      const importPath = writeImportFile(legacyConfig)
      configManager.importConfig(importPath)

      // Assert
      expect(configManager.getSection('liveEditor')).not.toHaveProperty(
        'syncMode',
      )
      expect(configManager.getSection('liveEditor')).not.toHaveProperty(
        'lastCategoryId',
      )
      expect(configManager.get('liveEditor.notes', {})).toEqual({
        '3': 'Keep this note',
      })
    })
  })
})

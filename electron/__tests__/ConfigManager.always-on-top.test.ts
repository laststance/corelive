/**
 * @fileoverview BrainDump always-on-top config default + migration tests.
 *
 * Locks the contract that BrainDump ships UNPINNED (`alwaysOnTop=false`) and that
 * a pre-feature `config.json` lacking the key migrates to false — never
 * resurrects a stale `true`. Guards the 「固定しない」 default this preference exists
 * to deliver.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- ConfigManager.always-on-top
 */
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

/**
 * Writes a raw config.json into the active temp userData dir so the next
 * `new ConfigManager()` loads (and migrates/merges) it from disk.
 *
 * @param rawConfig - Partial config object to persist verbatim.
 */
function writeConfigFile(rawConfig: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(userDataDir.current, 'config.json'),
    JSON.stringify(rawConfig),
    'utf8',
  )
}

describe('ConfigManager BrainDump always-on-top', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-config-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('ships BrainDump unpinned by default', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    const braindump = configManager.getDefaultConfig().braindump

    // Assert: a `true` default would pin BrainDump on a fresh install — the exact
    // behavior this preference was added to avoid.
    expect(braindump.alwaysOnTop).toBe(false)
  })

  it('migrates a pre-feature config without braindump.alwaysOnTop to false, never stale-true', () => {
    // Arrange: a config.json written before the field existed — its braindump
    // block carries every sibling key BUT alwaysOnTop.
    writeConfigFile({
      braindump: {
        width: 480,
        height: 640,
        visibleOnAllWorkspaces: false,
        opacity: 0.95,
        syncMode: true,
        shortcut: 'Alt+Space',
        lastCategoryId: null,
        notes: {},
      },
    })

    // Act: loading merges the partial config over the defaults.
    const configManager = new ConfigManager()

    // Assert: the absent key resolves to the false default (passing `true` as the
    // lookup default proves the value is genuinely present-and-false, not falling
    // back) — the merge seeds from defaults and only overlays present keys.
    expect(configManager.get('braindump.alwaysOnTop', true)).toBe(false)
  })

  it('preserves an explicit braindump.alwaysOnTop=true opt-in from a saved config', () => {
    // Arrange: a user who turned BrainDump pinning on persists true.
    writeConfigFile({ braindump: { alwaysOnTop: true } })

    // Act
    const configManager = new ConfigManager()

    // Assert: the migration fills absences only — an explicit opt-in survives.
    expect(configManager.get('braindump.alwaysOnTop', false)).toBe(true)
  })
})

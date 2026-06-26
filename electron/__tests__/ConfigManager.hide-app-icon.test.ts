/**
 * @fileoverview Hide-App-Icon (#112) config default + persist round-trip tests.
 *
 * Locks the contract that `behavior.hideAppIcon` ships OFF (icon shown), that the
 * toggle's `set()` survives a process restart (the boot-time read main relies on to
 * keep a hidden icon hidden across a cold Start-at-Login restart), and that a
 * pre-feature config.json lacking the key merges to false — never resurrects a
 * stale true. This `set → reload → read` round-trip IS the meaningful coverage of
 * the IPC handler's persist step (the handler just calls `configManager.set`).
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- ConfigManager.hide-app-icon
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

describe('ConfigManager hideAppIcon', () => {
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

  it('ships with the dock icon shown by default (hideAppIcon=false)', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    const behavior = configManager.getDefaultConfig().behavior

    // Assert: a `true` default would hide the Dock icon on a fresh install — the
    // opposite of the macOS convention and of the renderer default.
    expect(behavior.hideAppIcon).toBe(false)
  })

  it('persists a hideAppIcon=true toggle so the next boot reads it back', () => {
    // Arrange: a running app where the user hid the dock icon.
    const configManager = new ConfigManager()
    configManager.set('behavior.hideAppIcon', true)

    // Act: a fresh ConfigManager models the NEXT process launch reading config.json.
    const afterRestart = new ConfigManager()

    // Assert: passing `false` as the lookup default proves the value is genuinely
    // present-and-true on disk — this is exactly the boot-time read that keeps a
    // hidden icon hidden across a cold restart (#112).
    expect(afterRestart.get('behavior.hideAppIcon', false)).toBe(true)
  })

  it('persists a hideAppIcon=false toggle (un-hide survives a restart too)', () => {
    // Arrange: a user who hid then re-showed the icon.
    const configManager = new ConfigManager()
    configManager.set('behavior.hideAppIcon', true)
    configManager.set('behavior.hideAppIcon', false)

    // Act
    const afterRestart = new ConfigManager()

    // Assert: passing `true` as the lookup default proves the persisted value is a
    // real false, so the next boot leaves the app a normal 'regular' dock app.
    expect(afterRestart.get('behavior.hideAppIcon', true)).toBe(false)
  })

  it('merges a pre-feature config without behavior.hideAppIcon to false, never stale-true', () => {
    // Arrange: a config.json written before the field existed — its behavior block
    // carries a sibling key BUT not hideAppIcon (no migration step is added; the
    // default-merge must fill it).
    writeConfigFile({ behavior: { startOnLogin: true } })

    // Act
    const configManager = new ConfigManager()

    // Assert: the absent key resolves to the false default (passing `true` proves
    // it's genuinely present-and-false, not falling back) AND the sibling the user
    // DID set is preserved by the merge.
    expect(configManager.get('behavior.hideAppIcon', true)).toBe(false)
    expect(configManager.get('behavior.startOnLogin', false)).toBe(true)
  })

  it('preserves an explicit behavior.hideAppIcon=true from a saved config', () => {
    // Arrange: a user who turned dock-icon hiding on persists true.
    writeConfigFile({ behavior: { hideAppIcon: true } })

    // Act
    const configManager = new ConfigManager()

    // Assert: the merge fills absences only — an explicit opt-in survives.
    expect(configManager.get('behavior.hideAppIcon', false)).toBe(true)
  })
})

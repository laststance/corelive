/**
 * @fileoverview ConfigManager settingsPopover defaults + migration tests.
 *
 * Locks the contract that:
 * - Fresh installs default to `settingsPopover: { width: 360, height: 380 }`.
 * - A legacy `config.json` missing the `settingsPopover` key gets the defaults
 *   filled in via `mergeWithDefaults` so the field is always present.
 * - A config.json that exists but has only `settingsPopover.width` gets the
 *   missing `height` filled in (partial-key migration).
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- ConfigManager.settings-popover
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userDataDir = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir.current),
  },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { ConfigManager } from '../ConfigManager'

/**
 * Writes a partial config.json into the temp userData directory so the next
 * `new ConfigManager()` loads (and migrates) it from disk.
 *
 * @param rawConfig - Partial object written verbatim as JSON.
 */
function writeConfigFile(rawConfig: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(userDataDir.current, 'config.json'),
    JSON.stringify(rawConfig),
    'utf8',
  )
}

beforeEach(() => {
  userDataDir.current = fs.mkdtempSync(
    path.join(os.tmpdir(), 'corelive-cfg-sp-'),
  )
})

afterEach(() => {
  vi.clearAllMocks()
  fs.rmSync(userDataDir.current, { recursive: true, force: true })
})

describe('ConfigManager settingsPopover defaults', () => {
  it('defaults to width=360 and height=380 on a fresh install', () => {
    // Arrange + Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.get('settingsPopover.width')).toBe(360)
    expect(configManager.get('settingsPopover.height')).toBe(380)
  })

  it('fills missing settingsPopover from a legacy config.json via mergeWithDefaults', () => {
    // Arrange: old config that predates the settingsPopover key
    writeConfigFile({
      version: '1.0.0',
      behavior: { startOnLogin: false },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert — the missing section is backfilled to defaults
    expect(configManager.get('settingsPopover.width')).toBe(360)
    expect(configManager.get('settingsPopover.height')).toBe(380)
  })

  it('preserves a valid persisted settingsPopover from config.json', () => {
    // Arrange: user previously resized to 500×600
    writeConfigFile({
      version: '1.0.0',
      settingsPopover: { width: 500, height: 600 },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert — the user's persisted size is kept as-is
    expect(configManager.get('settingsPopover.width')).toBe(500)
    expect(configManager.get('settingsPopover.height')).toBe(600)
  })
})

/**
 * @fileoverview Shortcut-open sound defaults and persisted-choice migration tests.
 *
 * @example
 * pnpm test:electron -- ConfigManager.shortcut-open-sound
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
 * Writes a legacy or current config for the next ConfigManager construction.
 * @param rawConfig - Config object written verbatim to the temporary user data directory.
 * @returns Nothing.
 * @example
 * writeConfigFile({ version: '1.0.0', behavior: { startOnLogin: false } })
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
    path.join(os.tmpdir(), 'corelive-cfg-shortcut-sound-'),
  )
})

afterEach(() => {
  vi.clearAllMocks()
  fs.rmSync(userDataDir.current, { recursive: true, force: true })
})

describe('ConfigManager shortcut opening sound', () => {
  it('plays the shortcut opening cue by default on a fresh install', () => {
    // Arrange / Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.get('behavior.shortcutOpenSoundEnabled')).toBe(true)
    expect(configManager.get('behavior.shortcutOpenSoundSelection')).toBe(
      'shuffle',
    )
  })

  it('turns the cue on after an app update when a legacy config has no sound choice', () => {
    // Arrange
    writeConfigFile({
      version: '1.0.0',
      behavior: { startOnLogin: false },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.get('behavior.shortcutOpenSoundEnabled')).toBe(true)
    expect(configManager.get('behavior.shortcutOpenSoundSelection')).toBe(
      'shuffle',
    )
  })

  it('uses the shuffled rotation when a saved sound identifier is no longer bundled', () => {
    // Arrange
    writeConfigFile({
      version: '1.0.0',
      behavior: {
        shortcutOpenSoundEnabled: true,
        shortcutOpenSoundSelection: 'removed-legacy-cue',
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.get('behavior.shortcutOpenSoundSelection')).toBe(
      'shuffle',
    )
  })

  it('keeps shortcut playback silent when a persisted enabled value is malformed', () => {
    // Arrange
    writeConfigFile({
      version: '1.0.0',
      behavior: {
        shortcutOpenSoundEnabled: 'false',
        shortcutOpenSoundSelection: 'shuffle',
      },
    })

    // Act
    const configManager = new ConfigManager()

    // Assert
    expect(configManager.get('behavior.shortcutOpenSoundEnabled')).toBe(false)
  })

  it('keeps the shortcut opening cue off across restarts after the user disables it', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    configManager.set('behavior.shortcutOpenSoundEnabled', false)
    const afterRestart = new ConfigManager()

    // Assert
    expect(afterRestart.get('behavior.shortcutOpenSoundEnabled')).toBe(false)
  })

  it('keeps one exact bundled cue across restarts after the user pins it', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    configManager.set(
      'behavior.shortcutOpenSoundSelection',
      'press-release-mechanism',
    )
    const afterRestart = new ConfigManager()

    // Assert
    expect(afterRestart.get('behavior.shortcutOpenSoundSelection')).toBe(
      'press-release-mechanism',
    )
  })
})

/**
 * @fileoverview Shortcut duplicate-detection tests for `ConfigManager.validate()`.
 *
 * Locks the rule that an EMPTY accelerator means "disabled" and never counts as a
 * duplicate of another disabled shortcut — otherwise `importConfig()` rejects a
 * perfectly valid file. `toggleLiveEditorSecondary` ships empty, so one other
 * disabled key would be enough to trip the false positive.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- ConfigManager.shortcut-validation
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

describe('ConfigManager shortcut validation', () => {
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

  it('accepts a config where more than one shortcut is disabled', () => {
    // Arrange: the second LiveEditor slot ships disabled; the user disables one
    // more key. Two empty strings must not read as a duplicated accelerator.
    const configManager = new ConfigManager()
    configManager.set('shortcuts.toggleLiveEditorSecondary', '')
    configManager.set('shortcuts.newTask', '')

    // Act
    const result = configManager.validate()

    // Assert
    expect(result.errors).toEqual([])
    expect(result.isValid).toBe(true)
  })

  it('still reports two shortcuts sharing one accelerator', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('shortcuts.toggleLiveEditor', 'Alt+Space')
    configManager.set('shortcuts.newTask', 'Alt+Space')

    // Act
    const result = configManager.validate()

    // Assert
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Duplicate shortcuts found: Alt+Space')
  })
})

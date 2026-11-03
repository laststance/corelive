/**
 * @fileoverview Show-in-Menu-Bar (#216 D5) config default + persist round-trip tests.
 *
 * `behavior.showInMenuBar` replaces the web Redux mirror that used to re-push the choice at
 * every launch: the bundled Settings window has no such store, so main owns the value.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const userDataDir = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir.current) },
}))
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { ConfigManager } from '../ConfigManager'
import {
  resolveShowInMenuBar,
  SHOW_IN_MENU_BAR_CONFIG_PATH,
} from '../utils/resolveHideAppIcon'

describe('ConfigManager showInMenuBar', () => {
  beforeEach(() => {
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-config-'),
    )
  })
  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
  })

  test('ships visible by default so a fresh install always has a menu-bar surface', () => {
    // Arrange / Act
    const config = new ConfigManager()

    // Assert
    expect(config.get(SHOW_IN_MENU_BAR_CONFIG_PATH)).toBe(true)
    expect(resolveShowInMenuBar(config)).toBe(true)
  })

  test('keeps a hidden menu-bar icon hidden after a restart', () => {
    // Arrange
    const first = new ConfigManager()
    first.set(SHOW_IN_MENU_BAR_CONFIG_PATH, false)

    // Act: a new process reads the persisted file.
    const restarted = new ConfigManager()

    // Assert
    expect(restarted.get(SHOW_IN_MENU_BAR_CONFIG_PATH)).toBe(false)
    expect(resolveShowInMenuBar(restarted)).toBe(false)
  })

  test('treats a config.json written before the key existed as visible', () => {
    // Arrange
    fs.writeFileSync(
      path.join(userDataDir.current, 'config.json'),
      JSON.stringify({ behavior: { hideAppIcon: true } }),
      'utf8',
    )

    // Act
    const config = new ConfigManager()

    // Assert
    expect(resolveShowInMenuBar(config)).toBe(true)
  })

  test.each(['false', 0, null])(
    'never hides the tray for the corrupt scalar %j, so the app cannot be stranded',
    (value) => {
      // Arrange / Act / Assert
      expect(resolveShowInMenuBar({ get: () => value })).toBe(true)
    },
  )
})

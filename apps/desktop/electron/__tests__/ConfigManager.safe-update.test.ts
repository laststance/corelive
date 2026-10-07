import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const userData = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({ app: { getPath: () => userData.directory } }))
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { ConfigManager } from '../ConfigManager'

beforeEach(() => {
  userData.directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'corelive-safe-update-'),
  )
})

afterEach(() => {
  fs.rmSync(userData.directory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

test('batch settings updates reject an unsafe path without redirecting it to a valid setting', () => {
  // Arrange
  const manager = new ConfigManager()
  manager.set('settingsPopover.width', 360)

  // Act
  const saved = manager.update({
    'settingsPopover.__proto__.width': 999,
    'settingsPopover.height': 480,
  })

  // Assert
  expect(saved).toBe(true)
  expect(manager.get('settingsPopover.width')).toBe(360)
  expect(new ConfigManager().get('settingsPopover.height')).toBe(480)
})

test('a rejected single setting path creates no partial configuration objects', () => {
  // Arrange
  const manager = new ConfigManager()

  // Act
  const saved = manager.set('temporary.constructor.name', 'changed')

  // Assert
  expect(saved).toBe(false)
  expect(manager.get('temporary')).toBeUndefined()
})

test('a batch persists all safe settings in one disk write', () => {
  // Arrange
  const manager = new ConfigManager()
  const writes = vi.spyOn(fs, 'writeFileSync')

  // Act
  const saved = manager.update({
    'settingsPopover.width': 500,
    'settingsPopover.height': 480,
  })

  // Assert
  expect(saved).toBe(true)
  expect(writes).toHaveBeenCalledTimes(1)
  const reloaded = new ConfigManager()
  expect(reloaded.get('settingsPopover.width')).toBe(500)
  expect(reloaded.get('settingsPopover.height')).toBe(480)
})

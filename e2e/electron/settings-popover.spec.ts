/**
 * End-to-end coverage for the Settings IPC surface (settings namespace).
 *
 * Tests the renderer→IPC→main-process round-trip for settings-related calls,
 * verifying the full stack is wired correctly across login-item, startup-config,
 * and app-visibility preferences.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let mainWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, mainWindow } = await setupElectronTest('settings-popover'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('hiding the menu bar icon setting reaches main process without error', async () => {
  // Arrange + Act: pass false (hide) — safe, does not affect test session
  const result = await mainWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setShowInMenuBar
    if (!setFn) throw new Error('setShowInMenuBar not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns a boolean (true=applied, false=tray unavailable in test env)
  expect(typeof result).toBe('boolean')
})

test('reading startup config exposes all three window flags', async () => {
  // Arrange + Act
  const config = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.settings?.getStartupConfig
    if (!getFn) throw new Error('getStartupConfig not in preload bridge')
    return getFn()
  })

  // Assert: all three boolean fields are present
  expect(typeof config.showMain).toBe('boolean')
  expect(typeof config.showBraindump).toBe('boolean')
  expect(typeof config.showFloating).toBe('boolean')
})

test('updating all startup window flags persists successfully', async () => {
  // Arrange
  const newConfig = {
    showMain: true,
    showBraindump: false,
    showFloating: false,
  }

  // Act
  const success = await mainWindow.evaluate(async (config) => {
    const setFn = window.electronAPI?.settings?.setStartupConfig
    if (!setFn) throw new Error('setStartupConfig not in preload bridge')
    return setFn(config)
  }, newConfig)

  // Assert: IPC handler returns true when config is written
  expect(success).toBe(true)
})

test('toggling dock icon visibility reaches main process without error', async () => {
  // Arrange + Act: pass false — "show dock icon" is the safe non-destructive state
  const result = await mainWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setHideAppIcon
    if (!setFn) throw new Error('setHideAppIcon not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns boolean success flag
  expect(typeof result).toBe('boolean')
})

/**
 * End-to-end coverage for the Settings IPC surface (settings namespace).
 *
 * Tests the renderer→IPC→main-process round-trip for settings-related calls,
 * verifying the full stack is wired correctly across login-item, startup-config,
 * and app-visibility preferences. After main-window retirement the settings
 * bridge is driven from the Settings window itself (`setupElectronTest`).
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let settingsWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, settingsWindow } =
    await setupElectronTest('settings-popover'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('hiding the menu bar icon setting reaches main process without error', async () => {
  // Arrange + Act: pass false (hide) — safe, does not affect test session
  const result = await settingsWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setShowInMenuBar
    if (!setFn) throw new Error('setShowInMenuBar not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns a boolean (true=applied, false=tray unavailable in test env)
  expect(typeof result).toBe('boolean')
})

test('reading startup config exposes both window flags', async () => {
  // Arrange + Act
  const config = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.settings?.getStartupConfig
    if (!getFn) throw new Error('getStartupConfig not in preload bridge')
    return getFn()
  })

  // Assert: both boolean fields are present
  expect(typeof config.showBraindump).toBe('boolean')
  expect(typeof config.showFloating).toBe('boolean')
})

test('updating the startup window flags persists successfully', async () => {
  // Arrange
  const newConfig = {
    showBraindump: false,
    showFloating: true,
  }

  // Act
  const success = await settingsWindow.evaluate(async (config) => {
    const setFn = window.electronAPI?.settings?.setStartupConfig
    if (!setFn) throw new Error('setStartupConfig not in preload bridge')
    return setFn(config)
  }, newConfig)

  // Assert: IPC handler returns true when config is written
  expect(success).toBe(true)
})

test('toggling dock icon visibility reaches main process without error', async () => {
  // Arrange + Act: pass false — "show dock icon" is the safe non-destructive state
  const result = await settingsWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setHideAppIcon
    if (!setFn) throw new Error('setHideAppIcon not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns boolean success flag
  expect(typeof result).toBe('boolean')
})

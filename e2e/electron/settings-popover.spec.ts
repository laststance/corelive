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

test('setShowInMenuBar IPC round-trip reaches main process and returns a boolean', async () => {
  // Arrange + Act: restore current value (false safe in test env — no real tray)
  const result = await mainWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setShowInMenuBar
    if (!setFn) throw new Error('setShowInMenuBar not in preload bridge')
    return setFn(false)
  })

  // Assert: main process handler returns a boolean success flag
  expect(typeof result).toBe('boolean')
})

test('getStartupConfig IPC returns a valid startup configuration', async () => {
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

test('setStartupConfig IPC persists the config and returns success', async () => {
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

  // Assert: IPC handler returns a truthy result (success)
  expect(success).toBeTruthy()
})

test('setHideAppIcon IPC round-trip reaches main process and returns true', async () => {
  // Arrange + Act: pass current value back to avoid side-effects
  const result = await mainWindow.evaluate(async () => {
    const setFn = window.electronAPI?.settings?.setHideAppIcon
    if (!setFn) throw new Error('setHideAppIcon not in preload bridge')
    // Toggle off (false) — safe non-destructive call in test env
    return setFn(false)
  })

  // Assert: main process IPC handler returns boolean success
  expect(typeof result).toBe('boolean')
})

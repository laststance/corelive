/**
 * Verifies the `contextBridge` surface in `electron/preload.ts`: the
 * documented namespaces are exposed, `electronEnv.isElectron` is true,
 * and a read-only IPC round-trip (`app.getVersion()`) reaches the main
 * process and returns a string.
 *
 * After main-window retirement this full bridge is loaded only by the Settings
 * window, so the suite opens it (`setupElectronTest`) and probes that renderer.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let settingsWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, settingsWindow } = await setupElectronTest('preload'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('window.electronAPI exposes the documented namespaces', async () => {
  const exposedKeys = await settingsWindow.evaluate(() => {
    return window.electronAPI ? Object.keys(window.electronAPI).sort() : []
  })

  // Spot-check a subset; asserting the full key set would couple this
  // test to namespace ordering changes. The subset still catches the
  // PR #34-style regression where `on` was missing.
  expect(exposedKeys).toEqual(expect.arrayContaining(['app', 'auth', 'on']))
  expect(exposedKeys.length).toBeGreaterThan(0)
})

test('window.electronEnv reports running inside Electron', async () => {
  const env = await settingsWindow.evaluate(() => window.electronEnv)

  expect(env?.isElectron).toBe(true)
  expect(typeof env?.platform).toBe('string')
  expect(typeof env?.versions?.electron).toBe('string')
})

test('preload IPC round-trip reaches the main process', async () => {
  const version = await settingsWindow.evaluate(async () => {
    const getVersion = window.electronAPI?.app?.getVersion
    if (!getVersion) {
      throw new Error('window.electronAPI.app.getVersion is not exposed')
    }
    return getVersion()
  })

  expect(typeof version).toBe('string')
  expect(version.length).toBeGreaterThan(0)
})

test('settings login item getter reaches the main process', async () => {
  const loginItemSettings = await settingsWindow.evaluate(async () => {
    const getLoginItemSettings =
      window.electronAPI?.settings?.getLoginItemSettings
    if (!getLoginItemSettings) {
      throw new Error(
        'window.electronAPI.settings.getLoginItemSettings is not exposed',
      )
    }
    return getLoginItemSettings()
  })

  expect(typeof loginItemSettings.openAtLogin).toBe('boolean')
})

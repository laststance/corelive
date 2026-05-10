/**
 * @fileoverview Electron preload contract E2E spec.
 *
 * Verifies the `contextBridge` surface exposed in `electron/preload.ts`:
 * 1. `window.electronAPI` exists and contains the expected top-level
 *    namespaces (catches regressions like PR #34's missing `on()`).
 * 2. `window.electronEnv` reports `isElectron: true` and a platform
 *    string — proves the preload actually executed inside the renderer.
 * 3. A read-only IPC round-trip (`window.electronAPI.app.getVersion()`)
 *    successfully reaches the main process and returns a string.
 *
 * Why `app.getVersion()`? It's a documented part of the public API,
 * has no side effects, and matches the package-level `app.getVersion()`
 * we assert in the startup spec — a successful round-trip proves the
 * full preload → IPC → main → preload path is wired.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import { launchElectronForTest } from './_helpers/launch'

let electronApp: ElectronApplication

test.beforeAll(async () => {
  electronApp = await launchElectronForTest('preload')
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('window.electronAPI exposes the documented namespaces', async () => {
  const mainWindow = await electronApp.firstWindow()
  await mainWindow.waitForLoadState('domcontentloaded')

  const exposedKeys = await mainWindow.evaluate(() => {
    const api = (
      globalThis as unknown as {
        electronAPI?: Record<string, unknown>
      }
    ).electronAPI
    return api ? Object.keys(api).sort() : []
  })

  // Spot-check a handful of the namespaces declared in
  // `electron/preload.ts:contextBridge.exposeInMainWorld('electronAPI', …)`.
  // Asserting all of them would couple the test to ordering changes; the
  // subset is enough to catch a regression like PR #34 (missing `on`).
  expect(exposedKeys).toEqual(expect.arrayContaining(['app', 'auth', 'on']))
  expect(exposedKeys.length).toBeGreaterThan(0)
})

test('window.electronEnv reports running inside Electron', async () => {
  const mainWindow = await electronApp.firstWindow()
  await mainWindow.waitForLoadState('domcontentloaded')

  const env = await mainWindow.evaluate(() => {
    return (
      globalThis as unknown as {
        electronEnv?: {
          isElectron?: boolean
          platform?: string
          versions?: { electron?: string }
        }
      }
    ).electronEnv
  })

  expect(env?.isElectron).toBe(true)
  expect(typeof env?.platform).toBe('string')
  expect(typeof env?.versions?.electron).toBe('string')
})

test('preload IPC round-trip reaches the main process', async () => {
  const mainWindow = await electronApp.firstWindow()
  await mainWindow.waitForLoadState('domcontentloaded')

  const version = await mainWindow.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        electronAPI?: { app?: { getVersion?: () => Promise<string> } }
      }
    ).electronAPI
    if (!api?.app?.getVersion) {
      throw new Error('window.electronAPI.app.getVersion is not exposed')
    }
    return api.app.getVersion()
  })

  // The version is whatever `app.getVersion()` returns; we don't assert
  // a specific value to avoid coupling to package.json bumps. A non-empty
  // string proves the IPC call resolved successfully.
  expect(typeof version).toBe('string')
  expect(version.length).toBeGreaterThan(0)
})

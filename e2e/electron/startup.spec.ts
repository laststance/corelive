/**
 * Asserts the integrated startup path: the main process boots, opens a
 * `BrowserWindow`, and loads the local Next.js renderer (proving the
 * `ELECTRON_RENDERER_URL` patch in `electron/main.ts` and the test-env
 * URL guard both work end-to-end).
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import { LOAD_TIMEOUT_MS, launchElectronForTest } from './_helpers/launch'

let electronApp: ElectronApplication

test.beforeAll(async () => {
  electronApp = await launchElectronForTest('startup')
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('main window opens and loads the local Next.js renderer', async () => {
  const mainWindow = await electronApp.firstWindow()

  // Wait for the renderer to actually load — `firstWindow()` resolves
  // before navigation completes, so URL/title checks would race.
  await mainWindow.waitForLoadState('domcontentloaded')

  // The Clerk redirect chain may briefly show `/` before settling on
  // `/login`. Assert with `waitForURL` so we tolerate the intermediate.
  await mainWindow.waitForURL(/(login|home|sign-in)/, {
    timeout: LOAD_TIMEOUT_MS,
  })

  const url = mainWindow.url()
  expect(url).toContain('localhost:3011')
  expect(url).toMatch(/(login|home|sign-in)/)
})

test('app reports the expected name from the main process', async () => {
  // `electronApp.evaluate` runs the function in the MAIN process — proves
  // we are talking to the real `electron` runtime, not just a renderer
  // page. `app.getName()` is read-only and side-effect free.
  const appName = await electronApp.evaluate(({ app }) => app.getName())
  expect(appName).toBeTruthy()
  expect(typeof appName).toBe('string')
})

test('renderer window.open requests do not create unmanaged BrowserWindows', async () => {
  const mainWindow = await electronApp.firstWindow()
  await mainWindow.waitForLoadState('domcontentloaded')
  await mainWindow.waitForURL(/(login|home|sign-in)/, {
    timeout: LOAD_TIMEOUT_MS,
  })

  const windowCountBefore = await electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().length
  })
  const unexpectedWindow = electronApp
    .waitForEvent('window', { timeout: 1_000 })
    .then(() => true)
    .catch(() => false)

  const popupResult = await mainWindow.evaluate(() => {
    const popup = window.open('https://example.com/qa-popup', '_blank')
    return popup === null ? 'blocked' : 'opened'
  })

  expect(popupResult).toBe('blocked')
  expect(await unexpectedWindow).toBe(false)

  const windowCountAfter = await electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().length
  })
  expect(windowCountAfter).toBe(windowCountBefore)
})

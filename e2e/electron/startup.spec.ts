/**
 * Asserts the integrated startup path after main-window retirement: the main
 * process boots and opens the Floating navigator front door, loading the local
 * Next.js renderer (proving the `ELECTRON_RENDERER_URL` patch in
 * `electron/main.ts` and the test-env URL guard both work end-to-end).
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import {
  LOAD_TIMEOUT_MS,
  RENDERER_URL,
  launchElectronForTest,
} from './_helpers/launch'

let electronApp: ElectronApplication

test.beforeAll(async () => {
  electronApp = await launchElectronForTest('startup')
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('the floating navigator front door opens and loads the local renderer', async () => {
  // On a fresh launch the only window is the Floating navigator front door
  // (showFloating default), so `firstWindow()` resolves to it.
  const floatingWindow = await electronApp.firstWindow()

  // Wait for the renderer to actually load — `firstWindow()` resolves
  // before navigation completes, so URL/title checks would race.
  await floatingWindow.waitForLoadState('domcontentloaded')

  await floatingWindow.waitForURL(/floating-navigator/, {
    timeout: LOAD_TIMEOUT_MS,
  })

  const url = floatingWindow.url()
  // Origin derives from the launch helper's ELECTRON_RENDERER_URL (single
  // source of truth), not a second hardcoded port that could drift from it.
  expect(new URL(url).origin).toBe(RENDERER_URL)
  expect(url).toContain('/floating-navigator')
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
  const floatingWindow = await electronApp.firstWindow()
  await floatingWindow.waitForLoadState('domcontentloaded')
  await floatingWindow.waitForURL(/floating-navigator/, {
    timeout: LOAD_TIMEOUT_MS,
  })

  const windowCountBefore = await electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().length
  })
  const unexpectedWindow = electronApp
    .waitForEvent('window', { timeout: 1_000 })
    .then(() => true)
    .catch(() => false)

  const popupResult = await floatingWindow.evaluate(() => {
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

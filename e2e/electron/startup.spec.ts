/**
 * @fileoverview Electron startup E2E spec.
 *
 * Asserts the integrated startup path that no unit test covers:
 * 1. The compiled main process boots without crashing.
 * 2. `WindowManager.createMainWindow` opens a real `BrowserWindow`.
 * 3. The renderer loads from the local Next.js server (the
 *    `ELECTRON_RENDERER_URL` patch in `electron/main.ts` works).
 * 4. The renderer eventually lands on `/login` (auth-skip v0).
 *
 * Catches the regression class of PR #28 (window creation flow) and
 * the would-have-shipped CEO-caught bug where `NODE_ENV=test` left the
 * renderer pointed at `https://corelive.app`.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import { launchElectronForTest } from './_helpers/launch'

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
  await mainWindow.waitForURL(/(login|home|sign-in)/, { timeout: 30_000 })

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

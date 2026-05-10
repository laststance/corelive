/**
 * Smoke-tests window-level operations from the main process: bounds are
 * non-zero after creation, `setBounds` round-trips with a ±1px DPI
 * tolerance, and `setSize` is idempotent. Asserts on `getBounds()` via
 * `electronApp.evaluate` (not `window.electronAPI.window`) so a preload
 * regression cannot silently mask a window-control failure.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import { launchElectronForTest } from './_helpers/launch'

let electronApp: ElectronApplication

test.beforeAll(async () => {
  electronApp = await launchElectronForTest('window-controls')

  // Wait for the renderer to load before any `electronApp.evaluate` call.
  // Without this wait, the main-process inspector context can be torn down
  // mid-evaluate while Electron is still creating the BrowserWindow and
  // loading the URL — Playwright surfaces that as
  // `Execution context was destroyed, most likely because of a navigation`
  // (the "navigation" wording is misleading; the destruction happens in
  // the Node-side execution context, not the renderer). Waiting for
  // `domcontentloaded` lets the main process reach a quiescent state where
  // CDP main-process evaluates are stable.
  const mainWindow = await electronApp.firstWindow()
  await mainWindow.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp?.close()
})

/** Tolerance (px) for `setBounds` round-trips under xvfb DPI scaling. */
const DPI_TOLERANCE_PX = 1

test('main window has non-zero bounds after creation', async () => {
  const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return window?.getBounds() ?? null
  })

  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThan(0)
  expect(bounds!.height).toBeGreaterThan(0)
})

test('setBounds round-trips with DPI tolerance', async () => {
  const targetBounds = { x: 50, y: 50, width: 1024, height: 768 }

  const actualBounds = await electronApp.evaluate(
    ({ BrowserWindow }, target) => {
      const window = BrowserWindow.getAllWindows()[0]
      if (!window) {
        throw new Error('No BrowserWindow available')
      }
      window.setBounds(target)
      return window.getBounds()
    },
    targetBounds,
  )

  // ±1px tolerance: xvfb at non-1.0 DPI scales rounds the size — see
  // the plan's Failure Mode F7. The tolerance is asymmetric in practice
  // (Linux often drops 1px), so check absolute difference.
  expect(Math.abs(actualBounds.x - targetBounds.x)).toBeLessThanOrEqual(
    DPI_TOLERANCE_PX,
  )
  expect(Math.abs(actualBounds.y - targetBounds.y)).toBeLessThanOrEqual(
    DPI_TOLERANCE_PX,
  )
  expect(Math.abs(actualBounds.width - targetBounds.width)).toBeLessThanOrEqual(
    DPI_TOLERANCE_PX,
  )
  expect(
    Math.abs(actualBounds.height - targetBounds.height),
  ).toBeLessThanOrEqual(DPI_TOLERANCE_PX)
})

test('setSize is idempotent', async () => {
  const targetSize = { width: 900, height: 700 }

  const sizes = await electronApp.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      throw new Error('No BrowserWindow available')
    }
    window.setSize(target.width, target.height)
    const first = window.getSize()
    window.setSize(target.width, target.height)
    const second = window.getSize()
    return { first, second }
  }, targetSize)

  expect(sizes.first).toEqual(sizes.second)
})

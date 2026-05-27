/**
 * Smoke-tests window-level operations from the main process: bounds are
 * non-zero after creation, `setBounds` round-trips with a ±1px DPI
 * tolerance, and `setSize` is idempotent. Asserts on `getBounds()` via
 * `electronApp.evaluate` (not `window.electronAPI.window`) so a preload
 * regression cannot silently mask a window-control failure.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import { setupElectronTest } from './_helpers/launch'

/** Tolerance (px) for window bounds/size round-trips under xvfb DPI scaling. */
const DPI_TOLERANCE_PX = 1
const MAIN_WINDOW_URL_PATTERN = /\/(home|login|sign-in)(?:\?|$|\/)/

let electronApp: ElectronApplication

test.beforeAll(async () => {
  // `setupElectronTest` includes the `domcontentloaded` wait — necessary
  // because the main-process inspector context can be torn down mid-evaluate
  // while Electron is still creating the BrowserWindow and loading the URL.
  // Playwright surfaces that as
  // `Execution context was destroyed, most likely because of a navigation`
  // (the "navigation" wording is misleading; the destruction happens in
  // the Node-side execution context, not the renderer).
  ;({ electronApp } = await setupElectronTest('window-controls'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('main window has non-zero bounds after creation', async () => {
  const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => {
      return /\/(home|login|sign-in)(?:\?|$|\/)/.test(
        candidate.webContents.getURL(),
      )
    })
    return window?.getBounds() ?? null
  })

  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThan(0)
  expect(bounds!.height).toBeGreaterThan(0)
})

test('setBounds round-trips with DPI tolerance', async () => {
  const targetBounds = { x: 50, y: 50, width: 1024, height: 768 }

  const actualBounds = await electronApp.evaluate(
    ({ BrowserWindow }, { patternSource, target }) => {
      const mainWindowPattern = new RegExp(patternSource)
      const window = BrowserWindow.getAllWindows().find((candidate) => {
        return mainWindowPattern.test(candidate.webContents.getURL())
      })
      if (!window) {
        throw new Error('No BrowserWindow available')
      }
      window.setBounds(target)
      return window.getBounds()
    },
    { patternSource: MAIN_WINDOW_URL_PATTERN.source, target: targetBounds },
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

  // Read via `getBounds()` (Rectangle object) instead of `getSize()`
  // (number[] tuple) so strict-index typing doesn't surface noise here.
  const sizes = await electronApp.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => {
      return /\/(home|login|sign-in)(?:\?|$|\/)/.test(
        candidate.webContents.getURL(),
      )
    })
    if (!window) {
      throw new Error('No BrowserWindow available')
    }
    window.setSize(target.width, target.height)
    const first = window.getBounds()
    window.setSize(target.width, target.height)
    const second = window.getBounds()
    return { first, second }
  }, targetSize)

  // Two consecutive `setSize` calls with the same target should converge
  // to the same size. WM ack is async on Linux + xvfb, so allow ±1px to
  // absorb rounding between the two reads (same tolerance used by the
  // `setBounds` round-trip test above).
  expect(Math.abs(sizes.first.width - sizes.second.width)).toBeLessThanOrEqual(
    DPI_TOLERANCE_PX,
  )
  expect(
    Math.abs(sizes.first.height - sizes.second.height),
  ).toBeLessThanOrEqual(DPI_TOLERANCE_PX)
})

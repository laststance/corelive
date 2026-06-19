/**
 * Smoke-tests window-level operations from the main process: bounds are
 * non-zero after creation, `setBounds` round-trips with a ±1px DPI
 * tolerance, and `setSize` is idempotent. Asserts on `getBounds()` via
 * `electronApp.evaluate` (not `window.electronAPI.window`) so a preload
 * regression cannot silently mask a window-control failure.
 *
 * After main-window retirement these target the Floating navigator — the
 * always-present front door — instead of a main window. Bounds stay within
 * the Floating window's 250–400px width / 300px-min height constraints so the
 * round-trips are not clamped.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

import { launchElectronForTest, waitForFloatingWindow } from './_helpers/launch'

/** Tolerance (px) for window bounds/size round-trips under xvfb DPI scaling. */
const DPI_TOLERANCE_PX = 1
const FLOATING_WINDOW_URL_PATTERN = /\/floating-navigator/

let electronApp: ElectronApplication

test.beforeAll(async () => {
  // Generic window-control smoke needs ANY real window. After main-window
  // retirement the always-present surface is the Floating front door, so
  // target it directly — `getBounds`/`setBounds` go through `electronApp`
  // (main process), so no preload bridge / Settings window is needed here.
  electronApp = await launchElectronForTest('window-controls')
  await waitForFloatingWindow(electronApp)
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('floating window has non-zero bounds after creation', async () => {
  const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => {
      return /\/floating-navigator/.test(candidate.webContents.getURL())
    })
    return window?.getBounds() ?? null
  })

  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThan(0)
  expect(bounds!.height).toBeGreaterThan(0)
})

test('setBounds round-trips with DPI tolerance', async () => {
  // Width 380 stays inside the Floating window's 250–400px range and height
  // 600 clears its 300px minimum, so the values are not clamped.
  const targetBounds = { x: 50, y: 50, width: 380, height: 600 }

  const actualBounds = await electronApp.evaluate(
    ({ BrowserWindow }, { patternSource, target }) => {
      const floatingWindowPattern = new RegExp(patternSource)
      const window = BrowserWindow.getAllWindows().find((candidate) => {
        return floatingWindowPattern.test(candidate.webContents.getURL())
      })
      if (!window) {
        throw new Error('No BrowserWindow available')
      }
      window.setBounds(target)
      return window.getBounds()
    },
    { patternSource: FLOATING_WINDOW_URL_PATTERN.source, target: targetBounds },
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
  // 360×500 also stays within the Floating window's size constraints.
  const targetSize = { width: 360, height: 500 }

  // Read via `getBounds()` (Rectangle object) instead of `getSize()`
  // (number[] tuple) so strict-index typing doesn't surface noise here.
  const sizes = await electronApp.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => {
      return /\/floating-navigator/.test(candidate.webContents.getURL())
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

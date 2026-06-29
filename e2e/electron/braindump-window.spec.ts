/**
 * End-to-end coverage for the BrainDump window IPC surface.
 *
 * Verifies that the renderer→IPC→main-process path wires the brainDump
 * namespace correctly: window toggle/show, opacity read/write, sync mode,
 * and shortcut config. Native Cocoa behaviors (always-on-top, vibrancy) are
 * covered by local macOS native QA.
 *
 * The brainDump IPC is driven from the Settings window — the only renderer that
 * carries the full `electronAPI` bridge after main-window retirement.
 *
 * Note: tests share one Electron app instance (beforeAll) and depend on
 * execution order (toggle-open → then check visibility). This is an
 * intentional tradeoff — Electron app launch is expensive per spec file.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { LOAD_TIMEOUT_MS, setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let settingsWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, settingsWindow } =
    await setupElectronTest('braindump-window'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('braindump opacity is within valid 0.30–1.00 bounds by default', async () => {
  // Arrange + Act
  const opacity = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.brainDump?.getOpacity
    if (!getFn) throw new Error('brainDump.getOpacity not in preload bridge')
    return getFn()
  })

  // Assert: main process clamps opacity to 0.30–1.00 on read
  expect(opacity).toBeGreaterThanOrEqual(0.3)
  expect(opacity).toBeLessThanOrEqual(1.0)
})

test('braindump sync mode is readable after app start', async () => {
  // Arrange + Act
  const syncMode = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.brainDump?.getSyncMode
    if (!getFn) throw new Error('brainDump.getSyncMode not in preload bridge')
    return getFn()
  })

  // Assert: sync mode is a boolean (on or off)
  expect(typeof syncMode).toBe('boolean')
})

test('braindump keyboard shortcut setting is readable after app start', async () => {
  // Arrange + Act
  const shortcut = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.brainDump?.getShortcut
    if (!getFn) throw new Error('brainDump.getShortcut not in preload bridge')
    return getFn()
  })

  // Assert: shortcut is a string (empty string when no shortcut is configured)
  expect(typeof shortcut).toBe('string')
})

test('opening braindump creates a new browser window', async () => {
  // Arrange: Settings + Floating are already open; toggling braindump must add
  // exactly one more window. Watch for the new window before calling toggle.
  const windowCountBefore = electronApp.windows().length
  const newWindowPromise = electronApp.waitForEvent('window', {
    timeout: LOAD_TIMEOUT_MS,
  })

  // Act
  await settingsWindow.evaluate(async () => {
    const toggleFn = window.electronAPI?.brainDump?.toggle
    if (!toggleFn) throw new Error('brainDump.toggle not in preload bridge')
    await toggleFn()
  })

  const braindumpWindow = await newWindowPromise

  // Assert: exactly one new window was opened
  expect(braindumpWindow).toBeTruthy()
  expect(electronApp.windows().length).toBe(windowCountBefore + 1)
})

test('signed-out BrainDump stays hidden while Floating remains the sign-in front door', async () => {
  // Arrange: the previous test created BrainDump while signed out. It must stay
  // hidden because the protected route redirects to /login.
  // Act
  const visibility = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.window?.getAuxVisibility
    if (!getFn) throw new Error('getAuxVisibility not in preload bridge')
    return getFn()
  })

  // Assert: login is not exposed in BrainDump; Floating is the sign-in surface.
  expect(visibility.braindump).toBe(false)
  expect(visibility.floating).toBe(true)
})

test('setting braindump opacity to 0.75 persists the exact value', async () => {
  // Arrange: 0.75 is in the valid 0.30–1.00 range, so it must not be clamped
  const targetOpacity = 0.75

  // Act
  const appliedOpacity = await settingsWindow.evaluate(async (opacity) => {
    const setFn = window.electronAPI?.brainDump?.setOpacity
    if (!setFn) throw new Error('brainDump.setOpacity not in preload bridge')
    return setFn(opacity)
  }, targetOpacity)

  // Assert: main process returns the exact value when it is in range
  expect(appliedOpacity).toBe(0.75)
})

test('updating braindump sync mode persists without error', async () => {
  // Arrange + Act: disable sync mode
  const result = await settingsWindow.evaluate(async () => {
    const setFn = window.electronAPI?.brainDump?.setSyncMode
    if (!setFn) throw new Error('brainDump.setSyncMode not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns true on success
  expect(result).toBe(true)
})

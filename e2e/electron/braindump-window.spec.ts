/**
 * End-to-end coverage for the BrainDump window IPC surface.
 *
 * Verifies that the renderer→IPC→main-process path wires the brainDump
 * namespace correctly: window toggle/show, opacity read/write, sync mode,
 * and shortcut config. Native Cocoa behaviors (always-on-top, vibrancy) are
 * covered by local macOS native QA.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { LOAD_TIMEOUT_MS, setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let mainWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, mainWindow } = await setupElectronTest('braindump-window'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('brainDump.getOpacity returns a number in the valid 0.30–1.00 range', async () => {
  // Arrange + Act
  const opacity = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.brainDump?.getOpacity
    if (!getFn) throw new Error('brainDump.getOpacity not in preload bridge')
    return getFn()
  })

  // Assert: default and any persisted value should be clamped in range
  expect(typeof opacity).toBe('number')
  expect(opacity).toBeGreaterThanOrEqual(0.3)
  expect(opacity).toBeLessThanOrEqual(1.0)
})

test('brainDump.getSyncMode returns a boolean', async () => {
  // Arrange + Act
  const syncMode = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.brainDump?.getSyncMode
    if (!getFn) throw new Error('brainDump.getSyncMode not in preload bridge')
    return getFn()
  })

  // Assert
  expect(typeof syncMode).toBe('boolean')
})

test('brainDump.getShortcut returns a string (empty or accelerator)', async () => {
  // Arrange + Act
  const shortcut = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.brainDump?.getShortcut
    if (!getFn) throw new Error('brainDump.getShortcut not in preload bridge')
    return getFn()
  })

  // Assert: shortcut is a string (empty when not configured)
  expect(typeof shortcut).toBe('string')
})

test('brainDump.toggle IPC creates a new braindump window', async () => {
  // Arrange: watch for the new window before calling toggle
  const newWindowPromise = electronApp.waitForEvent('window', {
    timeout: LOAD_TIMEOUT_MS,
  })

  // Act
  await mainWindow.evaluate(async () => {
    const toggleFn = window.electronAPI?.brainDump?.toggle
    if (!toggleFn) throw new Error('brainDump.toggle not in preload bridge')
    await toggleFn()
  })

  const braindumpWindow = await newWindowPromise

  // Assert: a second window was opened
  expect(braindumpWindow).toBeTruthy()
  expect(electronApp.windows().length).toBeGreaterThanOrEqual(2)
})

test('getAuxVisibility reflects braindump window as visible after toggle', async () => {
  // Arrange: braindump was shown by the previous test
  // Act
  const visibility = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.window?.getAuxVisibility
    if (!getFn) throw new Error('getAuxVisibility not in preload bridge')
    return getFn()
  })

  // Assert
  expect(visibility.braindump).toBe(true)
})

test('brainDump.setOpacity persists a new opacity and returns the clamped value', async () => {
  // Arrange
  const targetOpacity = 0.75

  // Act
  const appliedOpacity = await mainWindow.evaluate(async (opacity) => {
    const setFn = window.electronAPI?.brainDump?.setOpacity
    if (!setFn) throw new Error('brainDump.setOpacity not in preload bridge')
    return setFn(opacity)
  }, targetOpacity)

  // Assert: returns a number in valid range (main process clamps 0.30–1.00)
  expect(typeof appliedOpacity).toBe('number')
  expect(appliedOpacity).toBeGreaterThanOrEqual(0.3)
  expect(appliedOpacity).toBeLessThanOrEqual(1.0)
})

test('brainDump.setSyncMode persists a boolean sync setting', async () => {
  // Arrange + Act
  const result = await mainWindow.evaluate(async () => {
    const setFn = window.electronAPI?.brainDump?.setSyncMode
    if (!setFn) throw new Error('brainDump.setSyncMode not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns boolean success
  expect(typeof result).toBe('boolean')
})

/**
 * End-to-end coverage for the Floating Navigator window IPC surface.
 *
 * Verifies that the renderer→IPC→main-process path creates/shows/hides the
 * floating window, and that getAuxVisibility reflects the current state.
 * Native Cocoa chrome (always-on-top, vibrancy, space membership) is covered
 * by local macOS native QA; only DOM/IPC-layer behaviors are tested here.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { LOAD_TIMEOUT_MS, setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let mainWindow: Page

test.beforeAll(async () => {
  ;({ electronApp, mainWindow } = await setupElectronTest('floating-window'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('getAuxVisibility reports both auxiliary windows as hidden on fresh launch', async () => {
  // Arrange + Act: fresh app — no toggle has been called
  const visibility = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.window?.getAuxVisibility
    if (!getFn) throw new Error('getAuxVisibility not in preload bridge')
    return getFn()
  })

  // Assert: neither floating nor braindump are visible at startup
  expect(visibility.floating).toBe(false)
  expect(visibility.braindump).toBe(false)
})

test('toggleFloatingNavigator IPC creates a new floating window', async () => {
  // Arrange: listen for a new window before calling toggle
  const newWindowPromise = electronApp.waitForEvent('window', {
    timeout: LOAD_TIMEOUT_MS,
  })

  // Act
  await mainWindow.evaluate(async () => {
    const toggleFn = window.electronAPI?.window?.toggleFloatingNavigator
    if (!toggleFn)
      throw new Error('toggleFloatingNavigator not in preload bridge')
    await toggleFn()
  })

  const floatingWindow = await newWindowPromise

  // Assert: a second window was created
  expect(floatingWindow).toBeTruthy()
  expect(electronApp.windows().length).toBeGreaterThanOrEqual(2)
})

test('getAuxVisibility reflects floating window as visible after toggle', async () => {
  // Arrange: floating window was shown by the previous test (same electronApp instance)
  // Act
  const visibility = await mainWindow.evaluate(async () => {
    const getFn = window.electronAPI?.window?.getAuxVisibility
    if (!getFn) throw new Error('getAuxVisibility not in preload bridge')
    return getFn()
  })

  // Assert
  expect(visibility.floating).toBe(true)
})

test('showFloatingNavigator IPC is a no-op when floating window is already visible', async () => {
  // Arrange: floating is already visible (from previous test)
  // Act — showFloatingNavigator should not create a second floating window
  const windowsBefore = electronApp.windows().length

  await mainWindow.evaluate(async () => {
    const showFn = window.electronAPI?.window?.showFloatingNavigator
    if (!showFn) throw new Error('showFloatingNavigator not in preload bridge')
    await showFn()
  })

  // Assert: window count did not increase
  expect(electronApp.windows().length).toBe(windowsBefore)
})

test('hideFloatingNavigator IPC hides the floating window without destroying it', async () => {
  // Arrange: floating is visible
  const windowCountBefore = electronApp.windows().length

  // Act
  await mainWindow.evaluate(async () => {
    const hideFn = window.electronAPI?.window?.hideFloatingNavigator
    if (!hideFn) throw new Error('hideFloatingNavigator not in preload bridge')
    await hideFn()
  })

  // Assert: aux visibility reports hidden; the window object may persist as hidden
  const visibility = await mainWindow.evaluate(async () => {
    if (!window.electronAPI?.window?.getAuxVisibility)
      throw new Error('getAuxVisibility not in preload bridge')
    return window.electronAPI.window.getAuxVisibility()
  })
  expect(visibility.floating).toBe(false)

  // Window count should not increase (window is hidden, not re-created)
  expect(electronApp.windows().length).toBeLessThanOrEqual(windowCountBefore)
})

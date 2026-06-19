/**
 * End-to-end coverage for the Floating Navigator window IPC surface.
 *
 * After main-window retirement the Floating navigator is the signed-out FRONT
 * DOOR: it opens shown on a fresh launch (`showFloating` default). These tests
 * verify the renderer→IPC→main-process path toggles/shows/hides it from there,
 * and that `getAuxVisibility` reflects the current state. Native Cocoa chrome
 * (always-on-top, vibrancy, space membership) is covered by local macOS native
 * QA; only DOM/IPC-layer behaviors are tested here.
 *
 * The privileged `window` IPC is driven from the Settings window — the only
 * renderer that carries the full `electronAPI` bridge post-retirement.
 *
 * Note: tests in this file share one Electron app instance (beforeAll) and
 * depend on execution order because each window toggle changes shared state.
 * This is an intentional tradeoff — Electron app launch is expensive, and
 * the toggle sequence (shown → hidden → shown) is itself the feature path.
 * Visibility flips settle asynchronously (the show path waits for
 * ready-to-show), so the assertions poll `getAuxVisibility` rather than
 * sampling once.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import { LOAD_TIMEOUT_MS, setupElectronTest } from './_helpers/launch'

let electronApp: ElectronApplication
let settingsWindow: Page

/**
 * Reads the live aux-window visibility map through the Settings full bridge.
 * `getAuxVisibility` resolves a Promise over IPC, so the evaluate returns it
 * (Playwright awaits the returned thenable) instead of touching it in-page.
 */
const readAuxVisibility = async (): Promise<{
  floating: boolean
  braindump: boolean
}> =>
  settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.window?.getAuxVisibility
    if (!getFn) throw new Error('getAuxVisibility not in preload bridge')
    return getFn()
  })

const readFloatingVisible = async (): Promise<boolean> =>
  (await readAuxVisibility()).floating

test.beforeAll(async () => {
  ;({ electronApp, settingsWindow } =
    await setupElectronTest('floating-window'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('the floating navigator is shown as the front door on a fresh launch', async () => {
  // The front door is revealed a beat AFTER launch — the signed-out
  // restore-from-tray path shows it once the floating renderer settles
  // (~hundreds of ms after the Settings bridge is ready). Poll rather than
  // sampling once, so the assertion does not race that reveal.
  await expect
    .poll(readFloatingVisible, { timeout: LOAD_TIMEOUT_MS })
    .toBe(true)

  // Braindump was never opened in this spec, so it stays hidden.
  const { braindump } = await readAuxVisibility()
  expect(braindump).toBe(false)
})

test('toggling the floating navigator hides the front-door window', async () => {
  // Arrange: floating is currently shown (front door, from the previous test)
  const windowCountBefore = electronApp.windows().length

  // Act: toggle flips a shown floating window to hidden
  await settingsWindow.evaluate(async () => {
    const toggleFn = window.electronAPI?.window?.toggleFloatingNavigator
    if (!toggleFn)
      throw new Error('toggleFloatingNavigator not in preload bridge')
    await toggleFn()
  })

  // Assert: aux visibility settles to hidden, and the window was hidden (not
  // destroyed) — the page count stays the same.
  await expect
    .poll(readFloatingVisible, { timeout: LOAD_TIMEOUT_MS })
    .toBe(false)
  expect(electronApp.windows().length).toBe(windowCountBefore)
})

test('toggling again re-shows the floating navigator', async () => {
  // Arrange: floating is currently hidden (from the previous test)
  const windowCountBefore = electronApp.windows().length

  // Act: toggle flips it back to shown
  await settingsWindow.evaluate(async () => {
    const toggleFn = window.electronAPI?.window?.toggleFloatingNavigator
    if (!toggleFn)
      throw new Error('toggleFloatingNavigator not in preload bridge')
    await toggleFn()
  })

  // Assert: floating visible again, still reusing the same window
  await expect
    .poll(readFloatingVisible, { timeout: LOAD_TIMEOUT_MS })
    .toBe(true)
  expect(electronApp.windows().length).toBe(windowCountBefore)
})

test('showing the floating navigator when already open does not create a duplicate window', async () => {
  // Arrange: floating is already visible (from previous test)
  const windowsBefore = electronApp.windows().length

  // Act — showFloatingNavigator should not create a second floating window
  await settingsWindow.evaluate(async () => {
    const showFn = window.electronAPI?.window?.showFloatingNavigator
    if (!showFn) throw new Error('showFloatingNavigator not in preload bridge')
    await showFn()
  })

  // Assert: still visible, and window count did not increase
  await expect
    .poll(readFloatingVisible, { timeout: LOAD_TIMEOUT_MS })
    .toBe(true)
  expect(electronApp.windows().length).toBe(windowsBefore)
})

test('hiding the floating navigator makes aux visibility report it as hidden', async () => {
  // Arrange: floating is visible
  const windowCountBefore = electronApp.windows().length

  // Act
  await settingsWindow.evaluate(async () => {
    const hideFn = window.electronAPI?.window?.hideFloatingNavigator
    if (!hideFn) throw new Error('hideFloatingNavigator not in preload bridge')
    await hideFn()
  })

  // Assert: aux visibility settles to hidden
  await expect
    .poll(readFloatingVisible, { timeout: LOAD_TIMEOUT_MS })
    .toBe(false)

  // Window count must stay exactly the same (hidden, not destroyed or re-created)
  expect(electronApp.windows().length).toBe(windowCountBefore)
})

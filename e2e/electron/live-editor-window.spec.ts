/**
 * End-to-end coverage for the LiveEditor window IPC surface.
 *
 * Verifies that the renderer→IPC→main-process path wires the LiveEditor
 * namespace correctly: window toggle/show, opacity read/write, sync mode,
 * and shortcut config. Native Cocoa behaviors (always-on-top, vibrancy) are
 * covered by local macOS native QA.
 *
 * The LiveEditor IPC is driven from the Settings window — the only renderer that
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
    await setupElectronTest('live-editor-window'))
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('LiveEditor opacity is within valid 0.30–1.00 bounds by default', async () => {
  // Arrange + Act
  const opacity = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.liveEditor?.getOpacity
    if (!getFn) throw new Error('liveEditor.getOpacity not in preload bridge')
    return getFn()
  })

  // Assert: main process clamps opacity to 0.30–1.00 on read
  expect(opacity).toBeGreaterThanOrEqual(0.3)
  expect(opacity).toBeLessThanOrEqual(1.0)
})

test('LiveEditor sync mode is readable after app start', async () => {
  // Arrange + Act
  const syncMode = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.liveEditor?.getSyncMode
    if (!getFn) throw new Error('liveEditor.getSyncMode not in preload bridge')
    return getFn()
  })

  // Assert: sync mode is a boolean (on or off)
  expect(typeof syncMode).toBe('boolean')
})

test('LiveEditor keyboard shortcut setting is readable after app start', async () => {
  // Arrange + Act
  const shortcut = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.liveEditor?.getShortcut
    if (!getFn) throw new Error('liveEditor.getShortcut not in preload bridge')
    return getFn()
  })

  // Assert: shortcut is a string (empty string when no shortcut is configured)
  expect(typeof shortcut).toBe('string')
})

test('opening LiveEditor creates a new browser window', async () => {
  // Arrange: Settings + Floating are already open; toggling LiveEditor must add
  // exactly one more window. Watch for the new window before calling toggle.
  const windowCountBefore = electronApp.windows().length
  const newWindowPromise = electronApp.waitForEvent('window', {
    timeout: LOAD_TIMEOUT_MS,
  })

  // Act
  await settingsWindow.evaluate(async () => {
    const toggleFn = window.electronAPI?.liveEditor?.toggle
    if (!toggleFn) throw new Error('liveEditor.toggle not in preload bridge')
    await toggleFn()
  })

  const liveEditorWindow = await newWindowPromise

  // Assert: exactly one new window was opened
  expect(liveEditorWindow).toBeTruthy()
  expect(electronApp.windows().length).toBe(windowCountBefore + 1)
})

test('signed-out LiveEditor stays hidden while Floating remains the sign-in front door', async () => {
  // Arrange: the previous test created LiveEditor while signed out. It must stay
  // hidden because the protected route redirects to /login.
  // Act
  const visibility = await settingsWindow.evaluate(async () => {
    const getFn = window.electronAPI?.window?.getAuxVisibility
    if (!getFn) throw new Error('getAuxVisibility not in preload bridge')
    return getFn()
  })

  // Assert: login is not exposed in LiveEditor; Floating is the sign-in surface.
  expect(visibility.liveEditor).toBe(false)
  expect(visibility.floating).toBe(true)
})

test('setting LiveEditor opacity to 0.75 persists the exact value', async () => {
  // Arrange: 0.75 is in the valid 0.30–1.00 range, so it must not be clamped
  const targetOpacity = 0.75

  // Act
  const appliedOpacity = await settingsWindow.evaluate(async (opacity) => {
    const setFn = window.electronAPI?.liveEditor?.setOpacity
    if (!setFn) throw new Error('liveEditor.setOpacity not in preload bridge')
    return setFn(opacity)
  }, targetOpacity)

  // Assert: main process returns the exact value when it is in range
  expect(appliedOpacity).toBe(0.75)
})

test('updating LiveEditor sync mode persists without error', async () => {
  // Arrange + Act: disable sync mode
  const result = await settingsWindow.evaluate(async () => {
    const setFn = window.electronAPI?.liveEditor?.setSyncMode
    if (!setFn) throw new Error('liveEditor.setSyncMode not in preload bridge')
    return setFn(false)
  })

  // Assert: IPC handler returns true on success
  expect(result).toBe(true)
})

test('a second toggle key can be bound alongside the first', async () => {
  // Arrange: a chord no other slot holds
  const secondKey = 'Control+Shift+B'

  // Act
  const boundSecondKey = await settingsWindow.evaluate(async (accelerator) => {
    const setFn = window.electronAPI?.liveEditor?.setShortcutSecondary
    const getFn = window.electronAPI?.liveEditor?.getShortcutSecondary
    if (!setFn || !getFn) {
      throw new Error('liveEditor second-slot methods not in preload bridge')
    }
    await setFn(accelerator)
    return getFn()
  }, secondKey)

  // Assert: the second slot is live and reads back exactly what was requested
  expect(boundSecondKey).toBe('Control+Shift+B')
})

test('the second toggle key cannot duplicate the first', async () => {
  // Arrange: bind both slots to distinct keys, then aim the second at the first
  const rebind = await settingsWindow.evaluate(async () => {
    const liveEditor = window.electronAPI?.liveEditor
    if (
      !liveEditor?.setShortcutSecondary ||
      !liveEditor?.getShortcutSecondary
    ) {
      throw new Error('liveEditor second-slot methods not in preload bridge')
    }
    await liveEditor.setShortcut('Alt+Space')
    await liveEditor.setShortcutSecondary('Control+Shift+B')

    // Act: ask the second slot for the key the first one already holds
    const didAcceptDuplicate =
      await liveEditor.setShortcutSecondary('Alt+Space')
    return {
      didAcceptDuplicate,
      secondKeyAfterwards: await liveEditor.getShortcutSecondary(),
    }
  })

  // Assert: rejected, and the previously bound second key is left untouched
  expect(rebind.didAcceptDuplicate).toBe(false)
  expect(rebind.secondKeyAfterwards).toBe('Control+Shift+B')
})

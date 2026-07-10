/**
 * §6d keep-on-top cross-window sync — the REAL main→preload→DOM IPC seam.
 *
 * When always-on-top is changed for the Floating navigator from ANY entry point,
 * `WindowManager.setFloatingNavigatorAlwaysOnTop` broadcasts
 * `floating-window-always-on-top-changed` to the floating window; its preload
 * (`preload-floating.ts`) re-dispatches that IPC payload as a DOM `CustomEvent`
 * so the in-window pin button can re-sync its `aria-pressed` state.
 *
 * Unit tests already cover the two ends in isolation: `WindowManager.always-on-top`
 * proves the broadcast fires (and only when the window is open), and
 * `FloatingNavigator.test.tsx` proves the pin button reacts to the CustomEvent.
 * ONLY a live Electron app can prove the hop BETWEEN them — main-process broadcast
 * → preload forward → page `window` event — over real IPC. That untyped preload
 * channel string is exactly the kind of seam a unit test cannot regress-guard, so
 * this spec is its coverage.
 *
 * Auth note: the preload forward is registered at module scope, so it fires
 * regardless of whether the floating page is showing the signed-in navigator or
 * the signed-out front-door card. The CI harness is signed out (front door), and
 * this test asserts on the DOM event — not the pin button (absent when signed
 * out) — so it is deliberately auth-independent.
 *
 * Shares one Electron app instance across both tests (beforeAll); the listener and
 * its accumulator live on the floating page, which never reloads here (always-on-top
 * is a native NSWindow property), so events accumulate across the toggle sequence.
 */

import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  LOAD_TIMEOUT_MS,
  setupElectronTest,
  waitForFloatingWindow,
} from './_helpers/launch'

/** Test-only accumulator the spec installs on the floating page's `window`. */
declare global {
  interface Window {
    __floatingAlwaysOnTopEvents?: Array<{ alwaysOnTop?: boolean }>
  }
}

let electronApp: ElectronApplication
let settingsWindow: Page
let floatingWindow: Page

/**
 * Drives the canonical Settings-bridge setter that every always-on-top entry
 * point funnels through (`window.electronAPI.floatingPanels.setFloatingNavigatorAlwaysOnTop`),
 * so the broadcast under test is the production one, not a test shortcut.
 */
const setFloatingAlwaysOnTopFromSettings = async (
  enabled: boolean,
): Promise<void> => {
  await settingsWindow.evaluate(async (next) => {
    const setFn =
      window.electronAPI?.floatingPanels?.setFloatingNavigatorAlwaysOnTop
    if (!setFn)
      throw new Error('setFloatingNavigatorAlwaysOnTop not in preload bridge')
    await setFn(next)
  }, enabled)
}

/** Reads back every always-on-top CustomEvent the floating page has received. */
const readFloatingAlwaysOnTopEvents = async (): Promise<
  Array<{ alwaysOnTop?: boolean }>
> => floatingWindow.evaluate(() => window.__floatingAlwaysOnTopEvents ?? [])

test.beforeAll(async () => {
  ;({ electronApp, settingsWindow } = await setupElectronTest(
    'floating-always-on-top-sync',
  ))
  floatingWindow = await waitForFloatingWindow(electronApp)

  // Install the accumulator + listener BEFORE any toggle. Awaiting this evaluate
  // guarantees the listener is registered in-page before the first broadcast, so
  // the assertions below never race the dispatch.
  await floatingWindow.evaluate(() => {
    window.__floatingAlwaysOnTopEvents = []
    window.addEventListener(
      'floating-window-always-on-top-changed',
      (event) => {
        const detail = (event as CustomEvent<{ alwaysOnTop?: boolean }>).detail
        window.__floatingAlwaysOnTopEvents?.push(detail)
      },
    )
  })
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('turning off always-on-top from Settings reaches the floating window as a DOM event', async () => {
  // Arrange — floating defaults to pinned (true), so requesting false forces an
  // observable change and a broadcast.

  // Act
  await setFloatingAlwaysOnTopFromSettings(false)

  // Assert — the floating page received the broadcast as a CustomEvent carrying
  // the new state. Poll: the IPC round-trip + DOM dispatch settle asynchronously.
  await expect
    .poll(readFloatingAlwaysOnTopEvents, { timeout: LOAD_TIMEOUT_MS })
    .toContainEqual({ alwaysOnTop: false })
})

test('re-enabling always-on-top broadcasts the restored state to the floating window', async () => {
  // Arrange — the floating page is still listening from beforeAll; a second,
  // distinct broadcast must arrive when we flip the setting back.

  // Act
  await setFloatingAlwaysOnTopFromSettings(true)

  // Assert — the floating page now also saw the pinned state, proving the seam
  // forwards each change (not just the first).
  await expect
    .poll(readFloatingAlwaysOnTopEvents, { timeout: LOAD_TIMEOUT_MS })
    .toContainEqual({ alwaysOnTop: true })
})

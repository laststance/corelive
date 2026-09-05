/**
 * @fileoverview Host resolver pin. The failure this guards against is silent: if
 * the packaged panel (or an older install exposing only `brainDumpAPI`) were
 * misread as a browser, every keep and note would land in localStorage instead of
 * the account and the panel's config file — no error, just quietly wrong.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_NOTE_STORAGE_KEY } from './constants'
import { getLiveEditorHost, isElectronLiveEditorPanel } from './liveEditorHost'

/**
 * Builds the smallest object shaped like the preload bridge, keyed by identity in the specs.
 * @returns A bridge double whose methods are spies.
 * @example
 * installBridge('liveEditorAPI', fakeBridge())
 */
function fakeBridge() {
  return {
    window: {
      close: vi.fn(),
      toggle: vi.fn(),
      setOpacity: vi.fn(),
      getOpacity: vi.fn(),
      getBounds: vi.fn(),
      setBounds: vi.fn(),
    },
    note: { get: vi.fn(), set: vi.fn() },
    spaces: {
      getVisibleOnAllWorkspaces: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    },
  }
}

/**
 * Exposes a bridge under the given window property, as a preload script would.
 * @param propertyName - `liveEditorAPI` (canonical) or `brainDumpAPI` (pre-rename installs).
 * @param bridge - The bridge double.
 * @returns Nothing.
 * @example
 * installBridge('brainDumpAPI', fakeBridge())
 */
function installBridge(
  propertyName: 'liveEditorAPI' | 'brainDumpAPI',
  bridge: ReturnType<typeof fakeBridge>,
): void {
  Object.defineProperty(window, propertyName, {
    configurable: true,
    writable: true,
    value: bridge,
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  delete window.liveEditorAPI
  delete window.brainDumpAPI
})

describe('LiveEditor host resolver', () => {
  it('returns the preload bridge inside the Electron panel', () => {
    // Arrange
    const bridge = fakeBridge()
    installBridge('liveEditorAPI', bridge)

    // Act / Assert
    expect(getLiveEditorHost()).toBe(bridge)
    expect(isElectronLiveEditorPanel()).toBe(true)
  })

  it('still honours an older install that only exposes the legacy brainDumpAPI name', () => {
    // Arrange
    const bridge = fakeBridge()
    installBridge('brainDumpAPI', bridge)

    // Act / Assert: never misread as a browser (that would silently send keeps
    // to localStorage instead of the account).
    expect(getLiveEditorHost()).toBe(bridge)
    expect(isElectronLiveEditorPanel()).toBe(true)
  })

  it('falls back to the web host in a plain browser tab and keeps notes on the device', async () => {
    // Arrange
    const host = getLiveEditorHost()

    // Act
    await host.note.set(0, '- [ ] write one thing')

    // Assert
    expect(isElectronLiveEditorPanel()).toBe(false)
    await expect(host.note.get(0)).resolves.toBe('- [ ] write one thing')
    expect(localStorage.getItem(LOCAL_NOTE_STORAGE_KEY)).toBe(
      JSON.stringify({ '0': '- [ ] write one thing' }),
    )
  })

  it('reports web defaults that mark the editor ready with no preload', async () => {
    // Arrange
    const host = getLiveEditorHost()

    // Act / Assert: fully opaque and not pinned to every Space.
    await expect(host.window.getOpacity()).resolves.toBe(1)
    await expect(host.spaces.getVisibleOnAllWorkspaces()).resolves.toBe(false)
  })
})

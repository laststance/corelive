/**
 * @fileoverview Login-window preload surface whitelist.
 *
 * Pins the exact `contextBridge` surface {@link preload-login} hands to the login
 * window. That window loads a REMOTE page while the user is still signed out, so
 * every namespace bridged here is native reach granted before authentication —
 * and the scoping to `{ auth, oauth }` is what keeps
 * {@link ElectronStartupSync}'s method guards a no-op there (it only touches
 * `electronAPI.settings`). Asserted as a WHITELIST, not a subset, so spreading
 * the full main-window surface in fails instead of passing silently.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- preload-login-surface
 */
import { describe, expect, test, vi } from 'vitest'

// Defined via vi.hoisted so the (hoisted) vi.mock factory can reference these
// without a TDZ error. ipcRenderer is stubbed because the auth/oauth bridge
// factories close over it while building their method objects.
const { mockContextBridge, mockIpcRenderer } = vi.hoisted(() => {
  return {
    mockContextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    mockIpcRenderer: {
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  }
})

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}))

describe('login window preload surface', () => {
  test('bridges only the auth and oauth namespaces into the signed-out login window', async () => {
    // Arrange
    vi.resetModules()

    // Act
    // Import after Vitest clears mocks so the preload's bridge call remains observable.
    await import('../preload-login.ts')

    // Assert: one world, named electronAPI, carrying exactly two namespaces.
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1)
    const [exposedWorldName, exposedApi] =
      mockContextBridge.exposeInMainWorld.mock.calls[0]
    expect(exposedWorldName).toBe('electronAPI')
    expect(Object.keys(exposedApi).sort()).toEqual(['auth', 'oauth'])
  })
})

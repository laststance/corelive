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
import { describe, expect, it, vi } from 'vitest'

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

// Imported for its side effect: preload-login.ts calls exposeInMainWorld at
// module scope. Kept in its own test file because preload.ts exposes the SAME
// 'electronAPI' key — importing both here would overwrite this surface and the
// whitelist below would silently assert against the wrong preload.
await import('../preload-login.ts')

describe('login window preload surface', () => {
  it('bridges only the auth and oauth namespaces into the signed-out login window', () => {
    // Arrange: the module-scope import above ran preload-login's single
    // contextBridge.exposeInMainWorld call.

    // Act
    const [exposedWorldName, exposedApi] =
      mockContextBridge.exposeInMainWorld.mock.calls[0]

    // Assert: one world, named electronAPI, carrying exactly two namespaces.
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(exposedWorldName).toBe('electronAPI')
    expect(Object.keys(exposedApi).sort()).toEqual(['auth', 'oauth'])
  })
})

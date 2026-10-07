/**
 * @fileoverview Login-window preload surface whitelist.
 *
 * Pins the exact `contextBridge` surface {@link preload-login} hands to the login
 * window. That window loads a REMOTE page while the user is still signed out, so
 * every namespace bridged here is native reach granted before authentication —
 * and the scoping to auth, oauth and additive LiveEditor recovery keeps
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
  test('lets the signed-in login window retry LiveEditor without exposing settings or note mutation', async () => {
    // Arrange
    vi.resetModules()
    vi.stubGlobal('window', {
      location: { href: 'https://corelive.app/login-shell' },
    })

    // Act
    // Import after Vitest clears mocks so the preload's bridge call remains observable.
    await import('../preload-login.ts')
    vi.unstubAllGlobals()

    // Assert: one scoped world; recovery opens only the existing panel.
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1)
    const [exposedWorldName, exposedApi] =
      mockContextBridge.exposeInMainWorld.mock.calls[0]
    expect(exposedWorldName).toBe('electronAPI')
    expect(Object.keys(exposedApi).sort()).toEqual([
      'auth',
      'liveEditor',
      'oauth',
    ])
    expect(Object.keys(exposedApi.liveEditor)).toEqual(['show'])
    mockIpcRenderer.invoke.mockResolvedValueOnce(undefined)
    await exposedApi.liveEditor.show()
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
      'live-editor-window-show',
    )
    mockIpcRenderer.invoke.mockRejectedValueOnce(new Error('IPC unavailable'))
    await expect(exposedApi.liveEditor.show()).rejects.toThrow(
      'IPC unavailable',
    )
  })
})

import type {
  OfflineAuthBridge,
  OfflineAuthRequest,
} from '@corelive/desktop-contract/offline-auth'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.remove,
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('credential-only preload', () => {
  test('Clerk handshake query data may return to the exact broker document', async () => {
    // Arrange
    vi.stubGlobal('window', {
      location: new URL(
        'https://corelive.app/desktop-auth?__clerk_handshake=synthetic',
      ),
    })

    // Act
    await import('../preload-offline-auth')

    // Assert
    expect(mocks.expose.mock.calls[0]?.[0]).toBe('coreliveOfflineAuth')
  })

  test.each([
    'https://evil.example/desktop-auth',
    'https://corelive.app/settings',
    'https://clerk.corelive.app/v1/client/handshake',
    'https://corelive.app/desktop-auth?redirect=elsewhere',
  ])('withholds every capability from %s', async (href) => {
    // Arrange
    vi.stubGlobal('window', { location: new URL(href) })

    // Act
    await import('../preload-offline-auth')

    // Assert
    expect(mocks.expose).not.toHaveBeenCalled()
  })

  test('exposes only typed challenge and response methods and strips Electron event objects', async () => {
    // Arrange
    vi.stubGlobal('window', {
      location: new URL('https://corelive.app/desktop-auth'),
    })
    const request: OfflineAuthRequest = {
      requestId: '00000000-0000-4000-8000-000000000001',
      generation: 1,
      expectedAccountId: 'account-a',
    }
    mocks.invoke.mockResolvedValue(request)
    await import('../preload-offline-auth')
    const bridge = mocks.expose.mock.calls[0]![1] as OfflineAuthBridge
    const callback = vi.fn()

    // Act
    const ready = await bridge.ready()
    const cleanup = bridge.onRequest(callback)
    const listener = mocks.on.mock.calls[0]![1] as (
      event: unknown,
      request: OfflineAuthRequest,
    ) => void
    listener({ sender: 'must-not-escape' }, request)
    cleanup()

    // Assert
    expect(mocks.expose.mock.calls[0]![0]).toBe('coreliveOfflineAuth')
    expect(Object.keys(bridge)).toEqual(['ready', 'respond', 'onRequest'])
    expect(ready).toEqual(request)
    expect(callback).toHaveBeenCalledWith(request)
    expect(mocks.remove).toHaveBeenCalledWith('offline-auth-request', listener)
  })
})

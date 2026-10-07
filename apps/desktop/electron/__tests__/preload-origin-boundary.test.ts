import { afterEach, expect, test, vi } from 'vitest'

const expose = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: expose } }))
import { exposeTrustedBridge } from '../preload-shared/expose-trusted-bridge'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  expose.mockClear()
})
test.each([
  'https://clerk.corelive.app/v1/client/handshake?redirect_url=https%3A%2F%2Fcorelive.app',
  'https://example.com/',
])('provider and foreign documents receive no native bridge (%s)', (url) => {
  // Arrange
  vi.stubGlobal('window', { location: { href: url } })
  // Act
  exposeTrustedBridge('electronAPI', { nativeFixture: true })
  // Assert
  expect(expose).not.toHaveBeenCalled()
})
test('the app document receives its native namespace after the Clerk handshake returns', () => {
  // Arrange
  vi.stubGlobal('window', {
    location: { href: 'https://www.corelive.app/live-editor' },
  })
  const api = { nativeFixture: true }
  // Act
  exposeTrustedBridge('liveEditorAPI', api)
  // Assert
  expect(expose).toHaveBeenCalledExactlyOnceWith('liveEditorAPI', api)
})

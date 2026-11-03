import { afterEach, expect, test, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
}))
vi.stubGlobal('window', {
  location: { href: 'corelive-editor://app/settings.html' },
})
const { createSettingsBridge } = await import('../preload-settings')
vi.unstubAllGlobals()
const bridge = createSettingsBridge()

afterEach(() => invoke.mockReset())

test('Settings keeps a downloaded update when a later status poll fails', async () => {
  // Arrange
  const ready = {
    updateAvailable: true,
    updateDownloaded: true,
    downloadProgress: null,
    isChecking: false,
    message: 'Update downloaded',
  }
  invoke
    .mockResolvedValueOnce(ready)
    .mockRejectedValueOnce(new Error('private IPC detail'))

  // Act / Assert: failures must reject, so the renderer keeps the last successful snapshot.
  await expect(bridge.updater.getStatus()).resolves.toEqual(ready)
  await expect(bridge.updater.getStatus()).rejects.toThrow()
  expect(invoke.mock.calls).toEqual([
    ['updater-get-status'],
    ['updater-get-status'],
  ])
})

import type { ElectronAPI } from '@corelive/desktop-contract/electron-api'
import { afterEach, expect, test, vi } from 'vitest'

const { expose, invoke } = vi.hoisted(() => ({
  expose: vi.fn<(key: string, api: unknown) => void>(),
  invoke: vi.fn(),
}))
vi.mock('electron', () => ({ ipcRenderer: { invoke } }))
vi.mock('../logger', () => ({ log: { error: vi.fn() } }))
vi.mock('../preload-shared/expose-trusted-bridge', () => ({
  exposeTrustedBridge: expose,
}))
await import('../preload')
const bridge = expose.mock.calls.find(
  ([key]) => key === 'electronAPI',
)?.[1] as ElectronAPI

afterEach(() => invoke.mockReset())

test('Settings can preserve a downloaded update when the real preload status poll fails', async () => {
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
  await expect(bridge.updater.getStatus()).rejects.toThrow(
    'Update status unavailable',
  )
  expect(invoke.mock.calls).toEqual([
    ['updater-get-status'],
    ['updater-get-status'],
  ])
})

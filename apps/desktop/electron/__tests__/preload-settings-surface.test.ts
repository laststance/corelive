import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { invoke, exposeInMainWorld } = vi.hoisted(() => ({
  invoke: vi.fn(),
  exposeInMainWorld: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
  contextBridge: { exposeInMainWorld },
}))

/** Imports a fresh preload for one document URL, as Electron does per navigation. */
async function loadPreload(href: string): Promise<void> {
  vi.resetModules()
  vi.stubGlobal('window', { location: { href } })
  vi.stubGlobal('process', {
    ...process,
    isMainFrame: true,
    platform: 'darwin',
  })
  await import('../preload-settings')
}

beforeEach(() => {
  exposeInMainWorld.mockClear()
  invoke.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

test('the bundled Settings document receives exactly the named capability groups', async () => {
  // Arrange / Act
  await loadPreload('corelive-editor://app/settings.html')

  // Assert
  expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
  const [key, api] = exposeInMainWorld.mock.calls[0] as [string, object]
  expect(key).toBe('settingsAPI')
  expect(Object.keys(api).sort()).toEqual([
    'account',
    'app',
    'categories',
    'config',
    'floatingPanels',
    'liveEditor',
    'onChanged',
    'platform',
    'preferences',
    'settings',
    'snapshot',
    'syncDetails',
    'updater',
    'version',
  ])
})

test.each([
  'corelive-editor://app/index.html',
  'corelive-editor://app/settings.html?x=1',
  'https://corelive.app/settings',
])(
  'a different document (%s) receives no Settings capability',
  async (href) => {
    // Arrange / Act
    await loadPreload(href)

    // Assert
    expect(exposeInMainWorld).not.toHaveBeenCalled()
  },
)

test('Settings cannot read or write a config path outside its allowlist', async () => {
  // Arrange
  await loadPreload('corelive-editor://app/settings.html')
  const api = exposeInMainWorld.mock.calls[0]?.[1] as {
    config: { get: (path: string) => Promise<unknown> }
  }

  // Act / Assert
  await expect(api.config.get('liveEditor.notes.1')).rejects.toThrow(
    'not available to Settings',
  )
  expect(invoke).not.toHaveBeenCalled()
})

test('opening the dashboard sends no address from the renderer', async () => {
  // Arrange
  await loadPreload('corelive-editor://app/settings.html')
  const api = exposeInMainWorld.mock.calls[0]?.[1] as {
    account: { openDashboard: (...args: unknown[]) => Promise<unknown> }
  }
  invoke.mockResolvedValue(true)

  // Act
  await api.account.openDashboard('https://evil.example')

  // Assert
  expect(invoke).toHaveBeenCalledExactlyOnceWith(
    'settings-window-account-open-dashboard',
  )
})

test('sign-in controls travel as argument-free named channels', async () => {
  // Arrange
  await loadPreload('corelive-editor://app/settings.html')
  const api = exposeInMainWorld.mock.calls[0]?.[1] as {
    account: {
      signIn: (...args: unknown[]) => Promise<unknown>
      cancelSignIn: (...args: unknown[]) => Promise<unknown>
      clearAgain: (...args: unknown[]) => Promise<unknown>
      acknowledgeFirstUpload: (...args: unknown[]) => Promise<unknown>
    }
  }
  invoke.mockResolvedValue(undefined)

  // Act
  await api.account.signIn('https://evil.example')
  await api.account.cancelSignIn()
  await api.account.clearAgain()
  await api.account.acknowledgeFirstUpload()

  // Assert
  expect(invoke.mock.calls).toEqual([
    ['settings-window-account-sign-in'],
    ['settings-window-account-cancel-sign-in'],
    ['settings-window-account-clear-again'],
    ['settings-window-account-ack-first-upload'],
  ])
})

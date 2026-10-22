import type {
  OfflineSettingsAPI,
  OfflineSettingsResult,
} from '@corelive/desktop-contract/offline-editor-api'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { configureStore } from '@reduxjs/toolkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import { ElectronSettingsPage } from '@/components/electron/ElectronSettingsPage'
import { OfflineSettingsSync } from '@/components/electron/OfflineSettingsSync'
import electronSettings from '@/lib/redux/slices/electronSettingsSlice'
import settings from '@/lib/redux/slices/settingsSlice'
import { ThemeProvider } from '@/providers/ThemeProvider'
import '@/globals.css'

const parameters = new URLSearchParams(location.search)
let mode = parameters.get('bridge') ?? 'supported'
let preferences = {
  revision: 0,
  settings: UserSettingsStateSchema.parse({}),
  theme: 'light',
}
const acknowledgements = new Map<string, OfflineSettingsResult>()
let releasePending: (() => void) | undefined
/** Commits synthetic preferences once so lost acknowledgements exercise real coordinator replay.
 * @example commit(command)
 */
function commit(
  command: Parameters<OfflineSettingsAPI['patch']>[2],
): OfflineSettingsResult {
  const existing = acknowledgements.get(command.commandId)
  if (existing) return existing
  preferences = {
    revision: preferences.revision + 1,
    theme: command.theme ?? preferences.theme,
    settings: UserSettingsStateSchema.parse({
      ...preferences.settings,
      ...command.patch,
    }),
  }
  const result = { ok: true, generation: 1, preferences } as const
  acknowledgements.set(command.commandId, result)
  return result
}
Object.defineProperty(window, '__settingsFixture', {
  value: {
    control: (nextMode: string) => {
      mode = nextMode
      if (mode === 'supported') {
        releasePending?.()
        releasePending = undefined
      }
    },
    snapshot: () => preferences,
  },
})
const listeners = new Set<() => void>()
const offlineSettings: OfflineSettingsAPI = {
  version: 1,
  ...(mode !== 'legacy'
    ? {
        supportedKeys: Object.keys(
          UserSettingsStateSchema.shape,
        ) as (keyof typeof preferences.settings)[],
      }
    : {}),
  read: async () => ({ generation: 1, preferences }),
  prepare: async () => true,
  patch: async (_owner, _generation, command) => {
    if (mode === 'pending')
      return new Promise((resolve) => {
        releasePending = (): void => resolve(commit(command))
      })
    if (mode === 'rejected') return { ok: false, reason: 'storage-failed' }
    const acknowledged = acknowledgements.has(command.commandId)
    const result = commit(command)
    // Simulate a committed write whose first reply disappears, preserving its replay identity.
    if (mode === 'lost-ack' && !acknowledged)
      throw new Error('Synthetic lost acknowledgement')
    return result
  },
  onChanged: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  onManageCategories: () => () => undefined,
  consumeCategoryRequest: async () => null,
  categoryCreated: async () => true,
  refreshCategories: async () => undefined,
}
const config = new Map<string, unknown>([
  ['behavior.shortcutOpenSoundEnabled', true],
  ['behavior.shortcutOpenSoundSelection', 'shuffle'],
])
const noSubscription = () => () => undefined
const bridge = {
  offlineSettings,
  liveEditor: {
    getOpacity: async () => 1,
    setOpacity: async (value: number) => value,
    getShortcut: async () => 'CommandOrControl+Shift+Space',
    setShortcut: async (value: string) => value,
    getShortcutSecondary: async () => '',
    setShortcutSecondary: async (value: string) => value,
  },
  config: {
    get: async (path: string) => config.get(path),
    set: async (path: string, value: unknown) => {
      config.set(path, value)
      return true
    },
    open: async () => true,
  },
  settings: {
    setHideAppIcon: async () => true,
    setShowInMenuBar: async () => true,
    setStartAtLogin: async () => true,
    resetPopoverSize: async () => true,
  },
  floatingPanels: {
    getLiveEditorAlwaysOnTop: async () => false,
    setLiveEditorAlwaysOnTop: async () => true,
    getVisibleOnAllWorkspaces: async () => false,
    setVisibleOnAllWorkspaces: async () => true,
  },
  app: { getVersion: async () => '0.25.1' },
  updater: {
    getStatus: async () => ({
      isChecking: false,
      updateDownloaded: false,
      message: 'Update not available',
      updateAvailable: false,
      downloadProgress: null,
    }),
    checkForUpdates: async () => true,
    onStatus: noSubscription,
    onDownloadProgress: noSubscription,
    onUpdateDownloaded: noSubscription,
    quitAndInstall: async () => undefined,
  },
}
if (mode !== 'web') {
  Object.defineProperty(window, 'electronAPI', {
    value: bridge,
    configurable: true,
  })
  Object.defineProperty(window, 'electronEnv', {
    value: { isElectron: true, platform: 'darwin' },
    configurable: true,
  })
}
const store = configureStore({ reducer: { settings, electronSettings } })
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem>
    <QueryClientProvider client={query}>
      <Provider store={store}>
        <OfflineSettingsSync>
          <main className="mx-auto max-w-2xl space-y-12 px-4 py-6 sm:px-6">
            <ElectronSettingsPage />
          </main>
        </OfflineSettingsSync>
      </Provider>
    </QueryClientProvider>
  </ThemeProvider>,
)

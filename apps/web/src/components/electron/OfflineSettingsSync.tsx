'use client'

import { useUser } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useStore } from 'react-redux'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import {
  EMPTY_PREFERENCE_OUTCOME,
  OfflinePreferenceSync,
} from '@/lib/offline-settings-sync'
import {
  hydrateUserSettings,
  selectUserSettings,
} from '@/lib/redux/slices/settingsSlice'
import type { RootState } from '@/lib/redux/store'

const PreferenceSyncContext = createContext<OfflinePreferenceSync | null>(null)
const emptySubscribe = (): (() => void) => () => undefined
const emptySnapshot = () => EMPTY_PREFERENCE_OUTCOME

/** Exposes the account-owned coordinator's stable outcome to Settings controls.
 * @example const { outcome, retry } = useOfflinePreferenceOutcome()
 */
export function useOfflinePreferenceOutcome() {
  const sync: OfflinePreferenceSync | null = useContext(PreferenceSyncContext)
  const outcome = useSyncExternalStore(
    sync?.subscribe ?? emptySubscribe,
    sync?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  )
  return {
    outcome,
    retry: () => sync?.retry(),
    restore: async () => sync?.restoreConfirmed(),
  }
}

/** Owns native preference intent across navigation, outside the credential-only broker.
 * {@link ApplicationProviders} supplies the lifetime; only /settings may issue IPC.
 * @example <OfflineSettingsSync>{children}</OfflineSettingsSync>
 */
export function OfflineSettingsSync({ children }: { children?: ReactNode }) {
  const { user, isLoaded } = useUser()
  const pathname = usePathname()
  const store = useStore<RootState>()
  const { theme, setTheme } = useTheme()
  const owner = isLoaded ? user?.id : undefined
  const bridge =
    typeof window === 'undefined'
      ? undefined
      : window.electronAPI?.offlineSettings
  const sync: OfflinePreferenceSync | null = useMemo(
    () =>
      owner && bridge?.version === 1
        ? new OfflinePreferenceSync({
            accountId: owner,
            bridge,
            active: false,
            settings: () => selectUserSettings(store.getState()),
            applySettings: (settings) => {
              store.dispatch(hydrateUserSettings(settings))
            },
          })
        : null,
    [owner, bridge, store],
  )

  useCycleEffect(() => {
    if (!sync || !bridge) return
    sync.start()
    const unsubscribeStore = store.subscribe(() => sync.settingsChanged())
    const unsubscribeNative = bridge.onChanged(() => sync.refresh())
    return (): void => {
      unsubscribeStore()
      unsubscribeNative()
      sync.stop()
    }
  }, [sync, bridge, store])
  useCycleEffect(() => {
    sync?.setThemeHandler(setTheme)
    sync?.setActive(pathname === '/settings')
    sync?.themeChanged(theme)
  }, [sync, pathname, theme, setTheme])
  return <PreferenceSyncContext value={sync}>{children}</PreferenceSyncContext>
}

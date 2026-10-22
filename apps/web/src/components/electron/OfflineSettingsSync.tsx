'use client'

import { useUser } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useRef } from 'react'
import { useStore } from 'react-redux'
import { toast } from 'sonner'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { OfflinePreferenceSync } from '@/lib/offline-settings-sync'
import {
  hydrateUserSettings,
  selectUserSettings,
} from '@/lib/redux/slices/settingsSlice'
import type { RootState } from '@/lib/redux/store'

/**
 * Connects hydrated Settings to the prepared native account, retaining old-preload compatibility.
 * Mounted inside the normal app providers; the isolated auth broker never mounts this effect.
 * @example <OfflineSettingsSync />
 */
export function OfflineSettingsSync(): null {
  const { user, isLoaded } = useUser()
  const pathname = usePathname()
  const store = useStore<RootState>()
  const { theme, setTheme } = useTheme()
  const sync = useRef<OfflinePreferenceSync | null>(null)
  const owner = isLoaded ? user?.id : undefined

  useCycleEffect(() => {
    const bridge = window.electronAPI?.offlineSettings
    if (pathname !== '/settings' || !owner || bridge?.version !== 1) return
    const current = new OfflinePreferenceSync({
      accountId: owner,
      bridge,
      settings: () => selectUserSettings(store.getState()),
      applySettings: (settings) => {
        store.dispatch(hydrateUserSettings(settings))
      },
      applyTheme: setTheme,
      onError: () => {
        toast.error('Settings could not be saved on this Mac. Retrying…')
      },
    })
    sync.current = current
    const unsubscribeStore = store.subscribe(() => current.settingsChanged())
    const unsubscribeNative = bridge.onChanged(() => current.refresh())
    return (): void => {
      current.stop()
      unsubscribeStore()
      unsubscribeNative()
      sync.current = null
    }
  }, [owner, pathname, setTheme, store])

  // Run after subscription setup, including when the account changes with the same theme.
  useCycleEffect(() => {
    sync.current?.themeChanged(theme)
  }, [owner, pathname, setTheme, store, theme])
  return null
}

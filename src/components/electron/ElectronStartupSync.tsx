/**
 * Electron Startup Sync
 *
 * Forwards persisted Electron settings from renderer-side localStorage
 * to the main process at startup. The hideAppIcon preference is stored
 * by redux-storage-middleware in localStorage, but the macOS dock policy
 * (`app.setActivationPolicy`) is runtime-only and resets to 'regular' on
 * every launch. Without this sync, the Settings UI shows the toggle as ON
 * while the dock icon remains visible until the user toggles it again.
 *
 * Renders nothing. Mount once near the top of the React tree, inside
 * `<ReduxProvider>`.
 *
 * @module components/electron/ElectronStartupSync
 */
'use client'

import { useEffect } from 'react'

import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectHideAppIcon } from '@/lib/redux/slices/electronSettingsSlice'

/**
 * Pushes the persisted `hideAppIcon` value to the main process via IPC
 * after Redux hydrates from localStorage. The IPC handler in main.ts is
 * idempotent (re-applying the same activation policy is a no-op), so
 * firing on every selector change is safe.
 *
 * @returns Always null; this component renders nothing.
 *
 * @example
 * // In app/layout.tsx
 * <ReduxProvider>
 *   <ElectronStartupSync />
 *   {children}
 * </ReduxProvider>
 */
export function ElectronStartupSync(): null {
  const isElectron = useIsElectron()
  const hideAppIcon = useAppSelector(selectHideAppIcon)

  useEffect(() => {
    if (!isElectron) return
    if (typeof window === 'undefined') return
    void window.electronAPI?.settings?.setHideAppIcon(hideAppIcon)
  }, [isElectron, hideAppIcon])

  return null
}

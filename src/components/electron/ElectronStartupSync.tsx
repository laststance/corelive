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

import { useAppSelector } from '@/lib/redux/hooks'
import { selectHideAppIcon } from '@/lib/redux/slices/electronSettingsSlice'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'

/**
 * Pushes the persisted `hideAppIcon` value to the main process via IPC
 * after Redux hydrates from localStorage. The IPC handler in main.ts is
 * idempotent (re-applying the same activation policy is a no-op), so
 * firing on every selector change is safe.
 *
 * Uses `isElectronEnvironment()` directly inside the effect rather than
 * the `useIsElectron` hook: avoids importing the heavy auth-form module
 * (and its Clerk hooks) into the root layout chunk for web users, while
 * staying SSR-safe because effects only run in the browser.
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
  const hideAppIcon = useAppSelector(selectHideAppIcon)

  useEffect(() => {
    if (!isElectronEnvironment()) return
    // Surface IPC failures to the console; swallowing them silently would
    // mask main-process regressions during startup sync.
    //
    // The preload bridge (electron/preload.ts) wraps `typedInvoke` in a
    // try/catch and returns `false` instead of rejecting, so the meaningful
    // failure signal here is the boolean `false`, not a thrown error. The
    // `.catch` is still kept as defense-in-depth in case preload behavior
    // changes or someone exposes the raw IPC channel later.
    const syncPromise =
      window.electronAPI?.settings?.setHideAppIcon(hideAppIcon)
    syncPromise
      ?.then((ok) => {
        if (ok === false) {
          console.error(
            '[ElectronStartupSync] Failed to sync hideAppIcon: IPC returned false',
          )
        }
      })
      ?.catch((error: unknown) => {
        console.error(
          '[ElectronStartupSync] Failed to sync hideAppIcon:',
          error,
        )
      })
  }, [hideAppIcon])

  return null
}

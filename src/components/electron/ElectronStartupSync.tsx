'use client'

/**
 * Electron Startup Sync
 *
 * Forwards persisted Electron settings from renderer-side localStorage to the
 * main process at startup. Both the `hideAppIcon` (dock policy) and
 * `showInMenuBar` (tray icon) preferences live in localStorage via
 * redux-storage-middleware, but their main-process effects are runtime-only and
 * reset on every launch: the macOS dock policy (`app.setActivationPolicy`)
 * resets to 'regular', and the tray is always (re)created at boot by
 * SystemIntegrationErrorHandler regardless of the saved choice. Without this
 * sync, the Settings UI would show a toggle as OFF while the dock icon /
 * menu-bar icon stayed visible until the user toggled it again — i.e. the toggle
 * would "lie" across restarts.
 *
 * Renders nothing. Mount once near the top of the React tree, inside
 * `<ReduxProvider>`.
 *
 * @module components/electron/ElectronStartupSync
 */

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useAppSelector } from '@/lib/redux/hooks'
import {
  selectHideAppIcon,
  selectShowInMenuBar,
} from '@/lib/redux/slices/electronSettingsSlice'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'

/**
 * Reports an IPC settings-sync failure to the console without ever throwing.
 *
 * The preload bridge (electron/preload.ts) wraps `typedInvoke` in a try/catch
 * and returns `false` instead of rejecting, so the meaningful failure signal is
 * the boolean `false`, not a thrown error. The `.catch` is kept as
 * defense-in-depth in case preload behavior changes or someone exposes the raw
 * IPC channel later (which is also why `syncPromise` is treated as possibly
 * undefined). Swallowing failures silently would mask main-process regressions
 * during startup sync.
 *
 * @param syncPromise - The pending IPC call, or undefined if the bridge returned nothing.
 * @param label - Setting name used in the failure message (e.g. 'hideAppIcon').
 * @returns void; logs to `console.error` on a `false` resolution or rejection.
 * @example
 * reportSyncFailure(settings.setHideAppIcon(true), 'hideAppIcon')
 */
function reportSyncFailure(
  syncPromise: Promise<boolean> | undefined,
  label: string,
): void {
  syncPromise
    ?.then((ok) => {
      if (ok === false) {
        console.error(
          `[ElectronStartupSync] Failed to sync ${label}: IPC returned false`,
        )
      }
    })
    ?.catch((error: unknown) => {
      console.error(`[ElectronStartupSync] Failed to sync ${label}:`, error)
    })
}

/**
 * Pushes the persisted `hideAppIcon` and `showInMenuBar` values to the main
 * process via IPC after Redux hydrates from localStorage. The IPC handlers in
 * main.ts are idempotent (re-applying the same activation policy is a no-op;
 * `setMenuBarVisible` skips creating a second tray), so firing on every selector
 * change is safe.
 *
 * Each setting syncs in its OWN effect with its OWN method guard so they stay
 * independent: a re-render that only changes one setting re-syncs only that one,
 * and an older preload missing one method never suppresses the other's sync.
 *
 * Uses `isElectronEnvironment()` directly inside each effect rather than the
 * `useIsElectron` hook: avoids importing the heavy auth-form module (and its
 * Clerk hooks) into the root layout chunk for web users, while staying SSR-safe
 * because effects only run in the browser.
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
  const showInMenuBar = useAppSelector(selectShowInMenuBar)

  // Sync the dock-icon policy. Guard on the METHOD, not just the `settings`
  // namespace. This component is mounted in the root layout, so it runs on every
  // route — and the installed desktop app loads remote web against its own
  // FROZEN preload. Calling `undefined()` on an older preload would throw a
  // synchronous TypeError out of this effect, past its own `.catch`, to the
  // error boundary (and from the root layout it escapes `error.tsx` entirely —
  // see `global-error.tsx`). Uniform method-guarding future-proofs the bridge
  // against a reshuffle and matches the other Electron settings components.
  useCycleEffect(() => {
    if (!isElectronEnvironment()) return
    const settings = window.electronAPI?.settings
    if (typeof settings?.setHideAppIcon !== 'function') return
    // Call as a method so `this` stays bound to `settings`.
    reportSyncFailure(settings.setHideAppIcon(hideAppIcon), 'hideAppIcon')
  }, [hideAppIcon])

  // Sync the menu-bar (tray) visibility. Independent method guard for the same
  // frozen-preload reason as above; an old preload that lacks `setShowInMenuBar`
  // is skipped rather than crashing every route.
  useCycleEffect(() => {
    if (!isElectronEnvironment()) return
    const settings = window.electronAPI?.settings
    if (typeof settings?.setShowInMenuBar !== 'function') return
    // Call as a method so `this` stays bound to `settings`.
    reportSyncFailure(settings.setShowInMenuBar(showInMenuBar), 'showInMenuBar')
  }, [showInMenuBar])

  return null
}

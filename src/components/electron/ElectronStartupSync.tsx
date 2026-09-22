'use client'

/**
 * Electron Startup Sync
 *
 * Forwards persisted Electron settings from renderer-side localStorage to the
 * main process at startup. Both the `hideAppIcon` (dock policy) and
 * `showInMenuBar` (tray icon) settings live in localStorage via
 * redux-storage-middleware, but their main-process effects are runtime-only and
 * reset on every launch: the macOS dock policy (`app.setActivationPolicy`)
 * resets to 'regular', and the tray is always (re)created at boot by
 * SystemIntegrationErrorHandler regardless of the saved choice. Without this
 * sync, the Settings UI would show a toggle as OFF while the dock icon /
 * menu-bar icon stayed visible until the user toggled it again — i.e. the toggle
 * would "lie" across restarts.
 *
 * `hideAppIcon` is ALSO now bootstrapped by the main process at boot from its own
 * persisted config (ConfigManager `behavior.hideAppIcon`), so on a cold restart
 * the dock policy is correct before any window shows even if this renderer never
 * loads (#112). This component stays the live-toggle path and the writer that
 * SEEDS that config.
 *
 * It mirrors the STORE, never a render-time selector value: while hydrating
 * server HTML, react-redux renders {@link ReduxProvider}'s `serverState` (slice
 * defaults) first, then the restored localStorage state. A selector-driven effect
 * pushed that placeholder too — `hideAppIcon` false→true flipped the macOS
 * activation policy regular→accessory, which deactivates the app and blur-closed
 * the Settings popover the instant it first opened. The store itself is already
 * restored by mount (the storage middleware rehydrates in a microtask at store
 * creation) — see ElectronStartupSync.test.tsx.
 *
 * Renders nothing. Mount once near the top of the React tree, inside
 * `<ReduxProvider>`.
 *
 * @module components/electron/ElectronStartupSync
 */

import { useStore } from 'react-redux'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import {
  selectHideAppIcon,
  selectShowInMenuBar,
} from '@/lib/redux/slices/electronSettingsSlice'
import type { RootState } from '@/lib/redux/store'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'

/**
 * Pushes one setting to main and logs any failure, never throwing: it runs inside
 * a store subscriber, where a throw would abort Redux's listener loop and escape
 * `store.dispatch()` at whoever dispatched (e.g. a Settings toggle handler).
 *
 * The preload bridge (electron/preload.ts) wraps {@link typedInvoke} in a try/catch
 * and returns `false` instead of rejecting, so the meaningful failure signal is
 * the boolean `false`. The `async` thunk is the defense-in-depth against a frozen
 * or changed preload: `async` turns a synchronous throw into a rejection and
 * wraps a non-promise return value, so every failure mode lands on the same
 * logged path. Swallowing failures silently would mask main-process regressions
 * during startup sync.
 *
 * @param sendToMain - MUST be an `async` thunk calling the preload method; its body still runs synchronously, so IPC calls keep dispatch order.
 * @param label - Setting name used in the failure message (e.g. 'hideAppIcon').
 * @returns void; logs to `console.error` on a `false` resolution, a rejection, or a throw.
 * @example
 * pushSettingToMain(async () => settings.setHideAppIcon(true), 'hideAppIcon')
 */
function pushSettingToMain(
  sendToMain: () => Promise<unknown>,
  label: string,
): void {
  sendToMain()
    .then((ok) => {
      if (ok === false) {
        console.error(
          `[ElectronStartupSync] Failed to sync ${label}: IPC returned false`,
        )
      }
    })
    .catch((error: unknown) => {
      console.error(`[ElectronStartupSync] Failed to sync ${label}:`, error)
    })
}

/**
 * Mirrors the store's persisted `hideAppIcon` and `showInMenuBar` to the main
 * process via IPC: once on mount, then whenever either value changes. Reads
 * `store.getState()` (never a render-time selector) so the SSR hydration
 * placeholder cannot reach main — see the module doc.
 *
 * A Settings toggle ({@link ElectronSettingsPage}) already calls the bridge itself
 * and dispatches only on success, so the push it triggers here is a same-value
 * repeat. That is safe only because main's handlers are idempotent (re-applying
 * the same activation policy is a no-op;
 * {@link SystemTrayManager.setMenuBarVisible} skips creating a second tray) —
 * keep them that way.
 *
 * Each setting keeps its OWN last-pushed value and its OWN method guard so they
 * stay independent: a change to one setting re-syncs only that one, and an older
 * preload missing one method never suppresses the other's sync.
 *
 * Uses {@link isElectronEnvironment} directly inside the effect rather than the
 * {@link useIsElectron} hook: avoids importing the heavy auth-form module (and its
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
  const store = useStore<RootState>()

  // Keyed on `store`: a singleton today (one run), but a swapped store must be
  // re-subscribed and re-pushed instead of leaving this bound to a dead one.
  useCycleEffect(() => {
    if (!isElectronEnvironment()) return

    // Last value PUSHED to main, per setting — attempted, not confirmed: a failed
    // push is logged, never retried. An unrelated dispatch pushes nothing.
    let lastPushedHideAppIcon: boolean | undefined
    let lastPushedShowInMenuBar: boolean | undefined

    const syncChangedSettings = (): void => {
      const settings = window.electronAPI?.settings
      const state = store.getState()

      // Guard on the METHOD, not just the `settings` namespace. This component is
      // mounted in the root layout, so it runs on every route — and the installed
      // desktop app loads remote web against its own FROZEN preload, which may
      // predate a method. A missing method is skipped quietly (no error log, and
      // nothing recorded as pushed) rather than reported as a failed sync.
      const hideAppIcon = selectHideAppIcon(state)
      if (
        hideAppIcon !== lastPushedHideAppIcon &&
        typeof settings?.setHideAppIcon === 'function'
      ) {
        lastPushedHideAppIcon = hideAppIcon
        // Call as a method so `this` stays bound to `settings`.
        pushSettingToMain(
          async () => settings.setHideAppIcon(hideAppIcon),
          'hideAppIcon',
        )
      }

      // Menu-bar (tray) visibility: independent guard for the same frozen-preload
      // reason; an old preload lacking `setShowInMenuBar` is skipped, not crashed.
      const showInMenuBar = selectShowInMenuBar(state)
      if (
        showInMenuBar !== lastPushedShowInMenuBar &&
        typeof settings?.setShowInMenuBar === 'function'
      ) {
        lastPushedShowInMenuBar = showInMenuBar
        pushSettingToMain(
          async () => settings.setShowInMenuBar(showInMenuBar),
          'showInMenuBar',
        )
      }
    }

    syncChangedSettings()
    return store.subscribe(syncChangedSettings)
  }, [store])

  return null
}

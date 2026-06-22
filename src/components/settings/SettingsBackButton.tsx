'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Re-renders once after hydration so the client reads the real
 * `window.history.length` (the server snapshot is always `false`). History
 * length only changes on navigation, which unmounts this page, so there is
 * nothing to keep subscribed to afterwards.
 *
 * @param callback - React-supplied store-changed notifier.
 * @returns A no-op unsubscribe.
 */
function subscribeToHistory(callback: () => void): () => void {
  if (typeof window !== 'undefined') {
    queueMicrotask(callback)
  }
  return () => {}
}

/**
 * Whether `/settings` was reached via in-app navigation — i.e. there is a prior
 * history entry that `router.back()` can actually return to.
 *
 * @returns
 * - `true` when a previous history entry exists (sidebar → /settings)
 * - `false` on the server, or for a fresh load (tray popover / deep-link)
 * @example
 * getHasBackTargetSnapshot() // => true  (after sidebar push)
 * getHasBackTargetSnapshot() // => false (popover loadURL, history.length === 1)
 */
function getHasBackTargetSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return window.history.length > 1
}

/**
 * SSR snapshot — there is never history to go back to on the server, so the
 * button is absent until hydration reads the real value (no hydration flash of
 * a wrong state).
 *
 * @returns Always `false`.
 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * Back affordance for the standalone `/settings` route. Exists because
 * `/settings` renders outside the `(main)` sidebar layout and the Electron main
 * window has no browser chrome, so reaching Settings from the sidebar was a
 * dead end. Gated on history (not platform) so it appears for every in-app
 * arrival — web and Electron alike — yet stays hidden in the frameless tray
 * Settings popover (a fresh `loadURL`, dismissed on blur) and on direct web
 * deep-links, where `back()` has no target.
 *
 * @returns The ghost "Back" button, or `null` when there is nothing to go back to.
 * @example
 * // Top of the settings page, above the settings sections:
 * <SettingsBackButton />
 */
export const SettingsBackButton = function SettingsBackButton() {
  const router = useRouter()
  const hasBackTarget = useSyncExternalStore(
    subscribeToHistory,
    getHasBackTargetSnapshot,
    getServerSnapshot,
  )

  const handleBack = (): void => {
    router.back()
  }

  // Nothing to return to (tray popover / deep-link): `back()` would no-op, so
  // render nothing rather than a dead button.
  if (!hasBackTarget) return null

  return (
    <div className="p-4 pb-0">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 text-muted-foreground hover:text-foreground"
        onClick={handleBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
    </div>
  )
}

export default SettingsBackButton

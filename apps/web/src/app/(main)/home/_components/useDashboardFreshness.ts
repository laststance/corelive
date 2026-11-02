'use client'

import { useQueryClient } from '@tanstack/react-query'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { invalidateCategoryViews } from '@/lib/category-sync-channel'

/** How often a visible Home dashboard re-reads completions written by the desktop app. */
export const DASHBOARD_REFRESH_INTERVAL_MS = 15_000

/**
 * Keeps Home fresh while the desktop app writes elsewhere.
 *
 * Completions are created in the desktop app and reach the web only through
 * sync, so an open Home tab refreshes every category-derived view (heatmap,
 * day detail, journal, category list, bootstrap) on a timer, when the window
 * regains focus and when the tab becomes visible. Mounted once by
 * {@link Dashboard}.
 *
 * At most one refresh is in flight: a trigger that arrives while the previous
 * refresh is pending is dropped, and a hidden document never refreshes.
 *
 * @param intervalMs - Polling period; tests pass a small value.
 * @returns Nothing; subscribes for the component's lifetime.
 * @example
 * useDashboardFreshness() // refreshes every 15 s while visible
 */
export function useDashboardFreshness(
  intervalMs: number = DASHBOARD_REFRESH_INTERVAL_MS,
): void {
  const queryClient = useQueryClient()

  useCycleEffect(() => {
    let isRefreshInFlight = false

    const handleWake = (): void => {
      // Hidden tabs skip; a pending refresh absorbs overlapping triggers.
      if (isRefreshInFlight || document.visibilityState !== 'visible') return
      isRefreshInFlight = true
      invalidateCategoryViews(queryClient)
        .catch(() => {
          // A failed refresh must not wedge the guard; the next trigger retries.
        })
        .finally(() => {
          isRefreshInFlight = false
        })
    }

    const intervalId = window.setInterval(handleWake, intervalMs)
    window.addEventListener('focus', handleWake)
    document.addEventListener('visibilitychange', handleWake)
    return (): void => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWake)
      document.removeEventListener('visibilitychange', handleWake)
    }
  }, [intervalMs, queryClient])
}

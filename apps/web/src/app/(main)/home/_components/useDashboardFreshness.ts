'use client'

import { type QueryClient, useQueryClient } from '@tanstack/react-query'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { orpc } from '@/lib/orpc/client-query'

/** How often a visible Home dashboard re-reads completions written by the desktop app. */
export const DASHBOARD_REFRESH_INTERVAL_MS = 15_000

/**
 * Keeps Home fresh while the desktop app writes elsewhere.
 *
 * Completions are created in the desktop app and reach the web only through
 * sync, so an open Home tab runs {@link refreshDashboardViews} on a timer, when
 * the window regains focus and when the tab becomes visible. Mounted once by
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
      refreshDashboardViews(queryClient)
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

/**
 * Re-reads Home's single-request views, then the completed journal only when they changed.
 *
 * Invalidating an active infinite query refetches every page it has loaded, so
 * a journal scrolled deep into history would cost one request per page on
 * every tick. The heatmap and the category list are one request each and
 * change whenever a completion lands, is undone or moves category, so they
 * serve as the change signal. Called by {@link useDashboardFreshness}; local
 * mutations and peer-window broadcasts keep using `invalidateCategoryViews`,
 * which always refreshes the journal.
 *
 * @param queryClient - The client whose Home queries are refreshed.
 * @returns Resolves after the cheap views reconcile and, when they changed, the journal too.
 * @example
 * await refreshDashboardViews(queryClient) // journal refetched only if the heatmap or categories moved
 */
async function refreshDashboardViews(queryClient: QueryClient): Promise<void> {
  const signatureBeforeRefresh = readDashboardChangeSignature(queryClient)
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.category.list.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.completed.dayDetail.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.home.bootstrap.key() }),
  ])
  // Unchanged heatmap and categories mean no completion moved: skip the per-page journal refetch.
  if (readDashboardChangeSignature(queryClient) === signatureBeforeRefresh)
    return
  await queryClient.invalidateQueries({
    queryKey: orpc.completed.journal.key(),
  })
}

/**
 * Serializes the cached heatmap and category list for {@link refreshDashboardViews}' change check.
 * @param queryClient - The client holding the cached views.
 * @returns A JSON string that differs whenever either view's cached data differs.
 * @example
 * readDashboardChangeSignature(queryClient) // => '[[[["completed","heatmap"],…]],[…]]'
 */
function readDashboardChangeSignature(queryClient: QueryClient): string {
  return JSON.stringify([
    queryClient.getQueriesData({ queryKey: orpc.completed.heatmap.key() }),
    queryClient.getQueriesData({ queryKey: orpc.category.list.key() }),
  ])
}

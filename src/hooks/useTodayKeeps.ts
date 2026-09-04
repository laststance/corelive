'use client'

import { useUser } from '@clerk/nextjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore } from 'react'

import {
  countLocalCompletionsOnDay,
  getLocalCompletionsSnapshot,
  parseLocalCompletions,
  subscribeToLocalCompletions,
} from '@/lib/live-editor/localCompletionStore'
import {
  getTodayHeatmapQueryKey,
  todayHeatmapQueryOptions,
} from '@/lib/query/todayHeatmapQuery'
import { getViewerTimeZone } from '@/lib/utils/getViewerTimeZone'

import { useMounted } from './use-mounted'
import { useUpdateEffect } from './use-update-effect'
import { useLocalDayKey } from './useLocalDayKey'

/**
 * What the Today Ember knows: `undefined` while the answer is still resolving
 * (server render, hydration, Clerk not loaded, first fetch in flight), `null`
 * when the account's keeps cannot be reached (query errored with nothing cached
 * — never shown as a 0), otherwise today's count.
 */
export type TodayKeepsCount = number | null | undefined

/** Server snapshot for the device store — the server has no localStorage, so the count resolves after hydration. */
const getServerLocalCompletionsSnapshot = (): string | null => null

/**
 * Counts today's keeps for the Today Ember, switching source on the session: signed out reads the device store (synchronous, cross-tab, re-bucketed at local midnight); signed in reads the account's `days: 1` heatmap total — the same cache entry {@link useCompletionWriter} bumps — plus keeps made on this device before sign-in that have not merged yet. Called by the LiveEditor for both hosts.
 * @returns
 * - `undefined` until the source can answer (pre-mount, Clerk loading, first fetch)
 * - `null` signed in with a failed fetch and no cached total
 * - a number otherwise (device keeps today, or account total + unmerged device keeps)
 * @example
 * const todayKeeps = useTodayKeeps() // => 3
 */
export function useTodayKeeps(): TodayKeepsCount {
  const isMounted = useMounted()
  const { isLoaded: isAuthLoaded, isSignedIn } = useUser()
  const dayKey = useLocalDayKey()
  const queryClient = useQueryClient()
  // Stable per session, so both the local bucketing and the query key hold still.
  const timezone = getViewerTimeZone()

  const rawLocalCompletions = useSyncExternalStore(
    subscribeToLocalCompletions,
    getLocalCompletionsSnapshot,
    getServerLocalCompletionsSnapshot,
  )
  // Derived from the raw string so a same-content rewrite never re-parses for nothing.
  const unmergedLocalToday = useMemo(
    () =>
      countLocalCompletionsOnDay(
        parseLocalCompletions(rawLocalCompletions),
        dayKey,
        timezone,
      ),
    [rawLocalCompletions, dayKey, timezone],
  )

  // Signed in only; the key mirrors useCompletionWriter's optimistic bump.
  const { data: todayHeatmap, isError } = useQuery({
    ...todayHeatmapQueryOptions(),
    enabled: isSignedIn === true,
  })

  // The one-day key carries no date, so an observer that stays mounted across
  // local midnight (the always-on-top panel, a /write tab left open) would keep
  // serving yesterday's total: nothing remounts, refocuses or reconnects, and
  // `staleTime` only marks it stale. Reset rather than invalidate so the ember
  // returns to its resolving word instead of showing yesterday's number while
  // the refetch is in flight.
  useUpdateEffect(() => {
    void queryClient.resetQueries({ queryKey: getTodayHeatmapQueryKey() })
  }, [dayKey, queryClient])

  // The server render and the first client render must agree, so nothing is
  // claimed before mount (the ember shows its resolving word instead).
  if (!isMounted || !isAuthLoaded) return undefined
  if (isSignedIn !== true) return unmergedLocalToday
  if (todayHeatmap === undefined) return isError ? null : undefined
  return todayHeatmap.total + unmergedLocalToday
}

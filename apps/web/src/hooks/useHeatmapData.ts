'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useLocalDayKey } from '@/hooks/useLocalDayKey'
import { HOME_HEATMAP_DAYS } from '@/lib/constants/home'
import { orpc } from '@/lib/orpc/client-query'

/**
 * Category breakdown for a single day in the heatmap.
 * @example
 * { id: 1, name: "Work", color: "blue", count: 3 }
 */
export type HeatmapCategory = {
  id: number
  name: string
  color: string
  count: number
  /** Current hierarchy, also returned for historical completions. */
  parent?: { id: number; name: string; color: string } | null
}

/**
 * Single day entry in the heatmap data.
 * @example
 * { date: "2026-03-24", count: 5, categories: [{ id: 1, name: "Work", color: "blue", count: 3 }] }
 */
export type HeatmapDay = {
  date: string
  count: number
  categories: HeatmapCategory[]
}

/**
 * Provides the dashboard with one annual snapshot, its calendar-day index,
 * and the state needed to distinguish loading, stale data and first-load failure.
 * @param days - Number of days to look back (default: 365)
 * @returns
 * - heatmapValues: Array of { date, count } with YYYY/MM/DD format for @uiw/react-heat-map
 * - dataByDate: Map keyed by YYYY-MM-DD for tooltip lookup
 * - streaks: { current, longest } consecutive-day streaks
 * - total: Total completed tasks in the period
 * - Query status and refetch for the activity area
 * @example
 * const { heatmapValues, dataByDate, streaks, total } = useHeatmapData(365)
 * // heatmapValues => [{ date: "2026/03/24", count: 5 }, ...]
 * // dataByDate.get("2026-03-24") => { date: "2026-03-24", count: 5, categories: [...] }
 */
export function useHeatmapData(days: number = HOME_HEATMAP_DAYS) {
  const isClerkQueryReady = useClerkQueryReady()
  const today = useLocalDayKey()
  // Report the browser's IANA zone so the server buckets completions by the
  // user's LOCAL calendar day (L3) — keeping heatmap data aligned with the
  // locally-rendered grid. Stable per session, so the query key stays stable;
  // an absent/garbage zone makes the server fall back to UTC bucketing.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data, isLoading, isError, isPaused, isFetching, refetch } = useQuery({
    ...orpc.completed.heatmap.queryOptions({ input: { days, timezone } }),
    enabled: isClerkQueryReady,
  })

  // Keep the calendar-day index stable for the year-in-review effect.
  const { heatmapValues, dataByDate } = useMemo(
    () => ({
      heatmapValues:
        data?.data.map((d) => ({
          date: d.date.replace(/-/g, '/'),
          count: d.count,
        })) ?? [],
      dataByDate: new Map<string, HeatmapDay>(
        data?.data.map((d) => [d.date, d]) ?? [],
      ),
    }),
    [data],
  )

  return {
    heatmapValues,
    dataByDate,
    streaks: data?.streaks ?? { current: 0, longest: 0 },
    total: data?.total ?? 0,
    hasData: data !== undefined,
    // Compare coverage, not arrival time, since a response may cross midnight.
    isCurrentDay: data?.throughDate === today,
    isLoading,
    isError,
    isPaused,
    isFetching,
    refetch,
  }
}

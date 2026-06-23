'use client'

import { useQuery } from '@tanstack/react-query'

import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
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
 * Fetches and transforms heatmap data for the ContributionGraph component.
 * @param days - Number of days to look back (default: 365)
 * @returns
 * - heatmapValues: Array of { date, count } with YYYY/MM/DD format for @uiw/react-heat-map
 * - dataByDate: Map keyed by YYYY-MM-DD for tooltip lookup
 * - streaks: { current, longest } consecutive-day streaks
 * - total: Total completed tasks in the period
 * - isLoading / isError: Query states
 * @example
 * const { heatmapValues, dataByDate, streaks, total } = useHeatmapData(365)
 * // heatmapValues => [{ date: "2026/03/24", count: 5 }, ...]
 * // dataByDate.get("2026-03-24") => { date: "2026-03-24", count: 5, categories: [...] }
 */
export function useHeatmapData(days: number = 365) {
  const isClerkQueryReady = useClerkQueryReady()
  // Report the browser's IANA zone so the server buckets completions by the
  // user's LOCAL calendar day (L3) — keeping heatmap data aligned with the
  // locally-rendered grid. Stable per session, so the query key stays stable;
  // an absent/garbage zone makes the server fall back to UTC bucketing.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data, isLoading, isError } = useQuery({
    ...orpc.completed.heatmap.queryOptions({ input: { days, timezone } }),
    enabled: isClerkQueryReady,
  })

  // The React Compiler auto-memoizes these derivations on `data` identity, so
  // call sites (ContributionGraph, WeeklySummaryCard) keep receiving the same
  // Map and Array references across renders while `data` is unchanged — without
  // it, each render would hand them a fresh Map/Array and bust their own derived
  // caches (calcMonthlyMaxDates, aggregateLastSevenDays). TanStack Query already
  // dedups the network request and keeps `data` referentially stable via
  // structural sharing; this is the in-render dedup the compiler preserves now
  // that the manual useMemo is gone.
  const { heatmapValues, dataByDate } = {
    heatmapValues:
      data?.data.map((d) => ({
        date: d.date.replace(/-/g, '/'),
        count: d.count,
      })) ?? [],
    dataByDate: new Map<string, HeatmapDay>(
      data?.data.map((d) => [d.date, d]) ?? [],
    ),
  }

  return {
    heatmapValues,
    dataByDate,
    streaks: data?.streaks ?? { current: 0, longest: 0 },
    total: data?.total ?? 0,
    isLoading: !isClerkQueryReady || isLoading,
    isError,
  }
}

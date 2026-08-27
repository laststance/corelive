'use client'
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'

import { Grid } from '@/components/grid'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'

import { CompletedTodos } from './CompletedTodos'
import { ContributionGraph } from './ContributionGraph'
import { SundayDigestCard } from './SundayDigestCard'
import { WeeklySummaryCard } from './WeeklySummaryCard'
import { YearInReviewModal } from './YearInReviewModal'

/**
 * Read-only completion dashboard for Home — heatmap, weekly/Sunday digests and
 * the permanent win journal. Mounted by {@link HomeContent}; every card reads
 * the `completed.*` procedures, so LiveEditor check-offs are the only thing
 * that fills it.
 *
 * @returns The Home dashboard grid, or a loading state until Clerk + the query
 *   persister have settled.
 * @example
 * <Dashboard />
 */
export const Dashboard = function Dashboard() {
  const queryClient = useQueryClient()
  const isRestoring = useIsRestoring()
  const isClerkQueryReady = useClerkQueryReady()
  const isMounted = useMounted()

  // Categories drive the journal's filter dropdown only — no mutation path
  // reads them here anymore.
  const { data: categoryData } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })

  // Heatmap data shared with WeeklySummaryCard + SundayDigestCard (React Query
  // dedupes the underlying request with ContributionGraph's own call, so the
  // extra consumers add no network round-trips).
  const { dataByDate: heatmapByDate, isLoading: heatmapLoading } =
    useHeatmapData()

  // Cross-window sync: a LiveEditor completion writes to the Completed table in
  // its own window and broadcasts, so this window's heatmap / day-detail /
  // journal caches must be invalidated or they stay stale until reload.
  useCycleEffect(() => {
    return subscribeToTodoSync(() => {
      queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.dayDetail.key(),
      })
      queryClient.invalidateQueries({ queryKey: orpc.completed.journal.key() })
    })
  }, [queryClient])

  // Hold the loading state until mount (so server HTML and the hydration pass
  // match), Clerk resolves, and the persister finishes restoring.
  if (!isMounted || !isClerkQueryReady || isRestoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <Grid className="grid-cols-1 content-start gap-6 lg:grid-cols-2">
      {/* Activity heatmap spans both columns so the centerpiece gets the full
           content width DESIGN.md mandates. */}
      <div className="lg:col-span-2">
        {/* Suspense required because ContributionGraph + YearInReviewModal read
             URL params via Next.js 16's useSearchParams. */}
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Activity
                </CardTitle>
                <CardDescription>Loading activity data...</CardDescription>
              </CardHeader>
            </Card>
          }
        >
          <ContributionGraph />
          <YearInReviewModal
            dataByDate={heatmapByDate}
            isLoading={heatmapLoading}
            isRestoring={isRestoring}
          />
        </Suspense>
      </div>

      <div className="space-y-6">
        <WeeklySummaryCard
          dataByDate={heatmapByDate}
          isLoading={heatmapLoading}
        />

        <SundayDigestCard
          dataByDate={heatmapByDate}
          isLoading={heatmapLoading}
        />
      </div>

      <div className="space-y-6">
        <CompletedTodos categories={categoryData?.categories ?? []} />
      </div>
    </Grid>
  )
}

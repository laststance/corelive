'use client'
import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { Grid } from '@/components/grid'
import { Card, CardDescription, CardHeader } from '@/components/ui/card'
import { useMounted } from '@/hooks/use-mounted'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import { orpc } from '@/lib/orpc/client-query'

import { CompletedTodos } from './CompletedTodos'
import { ContributionGraph } from './ContributionGraph'
import { RecentActivityCard } from './RecentActivityCard'
import { SundayDigestCard } from './SundayDigestCard'
import { useDashboardFreshness } from './useDashboardFreshness'
import { YearInReviewModal } from './YearInReviewModal'

/**
 * Shows the annual heatmap, recent activity, Sunday recap, and journal in
 * {@link DashboardContent}. The activity views share one completion snapshot.
 *
 * @returns The dashboard or a loading state while Clerk and query restoration settle.
 * @example
 * <Dashboard />
 */
export const Dashboard = function Dashboard() {
  const isRestoring = useIsRestoring()
  const isClerkQueryReady = useClerkQueryReady()
  const isMounted = useMounted()

  const { data: categoryData } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })

  const activity = useHeatmapData()
  const activityRefreshUnavailable =
    !activity.isCurrentDay || activity.isError || activity.isPaused

  // Completions arrive from the desktop app through sync, so keep Home fresh.
  useDashboardFreshness()

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
    <Grid className="min-w-0 grid-cols-1 content-start gap-6">
      <Suspense
        fallback={
          <Card aria-busy>
            <CardHeader>
              <h2 className="type-h3">Activity</h2>
              <CardDescription role="status">Loading activity…</CardDescription>
            </CardHeader>
          </Card>
        }
      >
        <ContributionGraph activity={activity} />
        {activity.hasData ? (
          <>
            <YearInReviewModal dataByDate={activity.dataByDate} />
            <RecentActivityCard
              dataByDate={activity.dataByDate}
              isRefreshUnavailable={activityRefreshUnavailable}
            />
          </>
        ) : null}
        <SundayDigestCard
          dataByDate={activity.dataByDate}
          hidden={activityRefreshUnavailable}
        />
      </Suspense>

      <CompletedTodos
        categories={categoryData?.categories}
        hasActivityData={activity.hasData}
      />
    </Grid>
  )
}

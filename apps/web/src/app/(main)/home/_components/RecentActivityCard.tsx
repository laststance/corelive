'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { HeatmapDay } from '@/hooks/useHeatmapData'
import { useLocalDayKey } from '@/hooks/useLocalDayKey'
import { buildDateSyncUrl } from '@/lib/buildDateSyncUrl'

import { CategoryTotals } from './CategoryTotals'
import {
  ActivityDaySelector,
  DailyCompletionsChart,
} from './DailyCompletionsChart'
import {
  formatActivityDate,
  getRecentActivity,
  type ActivityPeriod,
} from './recentActivity'

const PERIODS = [7, 30] as const satisfies readonly ActivityPeriod[]

/**
 * Shows recent completions beneath the annual heatmap. Both chart and keyboard
 * controls use the day-detail URL consumed by {@link ContributionGraph}.
 * @example
 * <RecentActivityCard dataByDate={heatmapByDate} />
 */
export function RecentActivityCard({
  dataByDate,
  isRefreshUnavailable = false,
}: {
  isRefreshUnavailable?: boolean
  dataByDate: ReadonlyMap<string, HeatmapDay>
}) {
  const today = useLocalDayKey()
  const [period, setPeriod] = useState<ActivityPeriod>(7)
  const { start, end, days, total, activeDays, categories } = getRecentActivity(
    {
      dataByDate,
      today,
      period,
    },
  )

  const openDay = (date: string): void => {
    const { search, pathname, hash } = window.location
    const url = buildDateSyncUrl(search, pathname, date)
    window.history.replaceState(null, '', url + hash)
  }

  return (
    <Card className="@container/recent-activity">
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="space-y-1">
          <h2 className="type-h3">Recent activity</h2>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <time dateTime={start}>{formatActivityDate(start, 'full')}</time>
            {' – '}
            <time dateTime={end}>{formatActivityDate(end, 'full')}</time>
          </p>
        </div>
        <div
          role="group"
          aria-label="Activity period"
          className="bg-muted/40 inline-flex gap-1 rounded-lg border p-1"
        >
          {PERIODS.map((days) => (
            <Button
              key={days}
              size="sm"
              variant={days === period ? 'secondary' : 'ghost'}
              className="aria-pressed:shadow-xs min-h-9 aria-pressed:bg-background"
              type="button"
              aria-pressed={days === period}
              onClick={() => setPeriod(days)}
            >
              {days} days
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-sm text-muted-foreground">Completed</dt>
            <dd className="font-mono text-2xl font-medium tabular-nums">
              {total}
            </dd>
          </div>
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-sm text-muted-foreground">Active days</dt>
            <dd className="font-mono text-2xl font-medium tabular-nums">
              {activeDays}
            </dd>
          </div>
        </dl>

        {isRefreshUnavailable ? (
          <p role="status" className="text-sm text-muted-foreground">
            Recent activity is showing the last loaded data.
          </p>
        ) : null}
        <div className="@min-[40rem]/recent-activity:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid min-w-0 gap-6 border-t pt-5">
          <div className="min-w-0 space-y-3">
            {total > 0 ? (
              <DailyCompletionsChart days={days} onOpenDay={openDay} />
            ) : !isRefreshUnavailable ? (
              <p className="text-sm text-muted-foreground">
                No completions in this period.
              </p>
            ) : null}
            <ActivityDaySelector days={days} onOpenDay={openDay} />
          </div>
          {total > 0 ? (
            <section className="@min-[40rem]/recent-activity:border-t-0 @min-[40rem]/recent-activity:border-l @min-[40rem]/recent-activity:pt-0 @min-[40rem]/recent-activity:pl-6 min-w-0 space-y-3 border-t pt-5">
              <h3 className="text-sm font-medium">Category breakdown</h3>
              <CategoryTotals
                categories={categories}
                label="Completed by category"
                periodTotal={total}
              />
            </section>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

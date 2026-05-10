'use client'

import { match } from 'ts-pattern'

import { Card, CardContent } from '@/components/ui/card'
import type { HeatmapDay } from '@/hooks/useHeatmapData'
import {
  aggregateLastSevenDays,
  type WeeklyTrend,
} from '@/lib/aggregate-last-seven-days'
import { getColorDotClass } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

interface WeeklySummaryCardProps {
  /**
   * Map of YYYY-MM-DD → HeatmapDay returned by `useHeatmapData`. The card
   * derives all weekly stats from it on the client; no extra fetch.
   */
  dataByDate: Map<string, HeatmapDay>
  /**
   * Loading sentinel from `useHeatmapData`. Renders a quiet placeholder so
   * the layout doesn't jump when the heatmap query resolves.
   */
  isLoading?: boolean
}

/**
 * Maps the discriminated `WeeklyTrend` to the muted phrase shown under the
 * total count. Copy follows the DESIGN.md voice ("quiet pride", never
 * shouty, never KPI guilt). Negative deltas read factual, not judgmental.
 *
 * @param trend - Trend state from {@link aggregateLastSevenDays}
 * @returns
 * - Italic serif phrase rendered in muted foreground
 * @example
 * trendLabel({ kind: 'firstWeek' })           // => "your first week"
 * trendLabel({ kind: 'percent', value: 25 })  // => "↑ 25% from last week"
 * trendLabel({ kind: 'percent', value: -40 }) // => "↓ 40% from last week"
 */
function trendLabel(trend: WeeklyTrend): string {
  return match(trend)
    .with(
      { kind: 'firstWeek' },
      () => 'your first week — the room is just waking up.',
    )
    .with(
      { kind: 'flat' },
      () => 'a quiet week. the cathedral keeps the light on.',
    )
    .with({ kind: 'new' }, () => '↑ new this week.')
    .with({ kind: 'percent' }, ({ value }) => {
      if (value === 0) return "steady — last week's pace."
      const absolute = Math.abs(value)
      const arrow = value > 0 ? '↑' : '↓'
      return `${arrow} ${absolute}% from last week.`
    })
    .exhaustive()
}

/**
 * Weekly summary card mounted under the ContributionGraph on the home
 * route. Shows a 7-day rolling total, the top categories the user touched,
 * and a week-over-week trend line — derived purely from the heatmap
 * response the parent already fetched.
 *
 * Design intent (DESIGN.md "Warm Cathedral"):
 * - Quiet pride, not KPI grading.
 * - Newsreader (serif italic) for the trend line, Geist Mono (tabular-nums)
 *   for the count, Inter Tight default for chips.
 * - Negative deltas read factual ("↓ 25%"), never red, never alarming.
 *
 * @example
 * <WeeklySummaryCard dataByDate={dataByDate} isLoading={isLoading} />
 */
export function WeeklySummaryCard({
  dataByDate,
  isLoading,
}: WeeklySummaryCardProps) {
  const stats = aggregateLastSevenDays(dataByDate, new Date())

  return (
    <Card aria-label="This week summary">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            this week
          </p>
          <span
            aria-label={`${stats.totalCompleted} completed this week`}
            className={cn(
              'font-mono text-2xl font-medium tabular-nums text-foreground',
              isLoading && 'opacity-40',
            )}
          >
            {stats.totalCompleted}
          </span>
        </div>

        <p className="font-serif text-sm italic text-muted-foreground">
          {isLoading ? '…' : trendLabel(stats.trend)}
        </p>

        {stats.topCategories.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {stats.topCategories.map((category) => (
              <li
                key={category.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs"
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block size-1.5 rounded-full',
                    getColorDotClass(category.color),
                  )}
                />
                <span className="text-foreground">{category.name}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {category.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

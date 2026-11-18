import type { HeatmapCategory, HeatmapDay } from '@/hooks/useHeatmapData'
import { rollupCategoryTotals } from '@/lib/rollupCategoryTotals'
import { shiftIsoDate } from '@/lib/shiftIsoDate'

export type ActivityPeriod = 7 | 30
export type ActivityDay = Pick<HeatmapDay, 'date' | 'count'>

const UNASSIGNED = { id: 0, name: 'Unassigned', color: 'neutral' }

/**
 * Builds the recent activity card's inclusive calendar window from the annual heatmap.
 * @param today - Browser-local calendar key in YYYY-MM-DD format.
 * @example
 * const activity = getRecentActivity({ dataByDate, today: '2026-11-18', period: 7 })
 */
export function getRecentActivity({
  dataByDate,
  today,
  period,
}: {
  dataByDate: ReadonlyMap<string, HeatmapDay>
  today: string
  period: ActivityPeriod
}) {
  const start = shiftIsoDate(today, 1 - period)
  const categoryCounts: HeatmapCategory[] = []
  let total = 0
  let activeDays = 0
  let unassignedCount = 0

  const days = Array.from({ length: period }, (_, index): ActivityDay => {
    const date = shiftIsoDate(start, index)
    const day = dataByDate.get(date)
    if (!day?.count) return { date, count: 0 }

    total += day.count
    activeDays += 1
    categoryCounts.push(...day.categories)

    // A completion can be present in the daily total even when its category is missing.
    const categorized = day.categories.reduce(
      (sum, category) => sum + category.count,
      0,
    )
    unassignedCount += Math.max(0, day.count - categorized)
    return { date, count: day.count }
  })

  if (unassignedCount > 0) {
    categoryCounts.push({ ...UNASSIGNED, count: unassignedCount })
  }

  return {
    start,
    end: today,
    days,
    total,
    activeDays,
    categories: rollupCategoryTotals(categoryCounts),
  }
}

const ACTIVITY_DATE_FORMATS = {
  short: new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
  full: new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }),
}

/**
 * Formats local day keys for the range, chart and date picker without shifting the bucket.
 * @example
 * formatActivityDate('2026-11-18', 'full') // => 'Nov 18, 2026'
 */
export function formatActivityDate(
  date: string,
  format: keyof typeof ACTIVITY_DATE_FORMATS,
): string {
  return ACTIVITY_DATE_FORMATS[format].format(new Date(`${date}T00:00:00Z`))
}

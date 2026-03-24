'use client'

import HeatMap from '@uiw/react-heat-map'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import type { HeatmapDay } from '@/hooks/useHeatmapData'

/** GitHub-style green gradient for heatmap intensity levels. */
const PANEL_COLORS: Record<string, string> = {
  0: '#161b22',
  2: '#0e4429',
  4: '#006d32',
  10: '#26a641',
  20: '#39d353',
}

/** Legend color squares matching the gradient. */
const LEGEND_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']

/** Week day labels for the heatmap Y-axis. */
const WEEK_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

/**
 * Map of category color names to hex values.
 * @example
 * getCategoryHex("blue") // => "#3b82f6"
 */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  pink: '#ec4899',
  orange: '#f97316',
  cyan: '#06b6d4',
  indigo: '#6366f1',
  gray: '#6b7280',
}

/**
 * Resolves a category color name to its hex value.
 * Falls back to the raw color string if not in the map (supports custom hex).
 * @param color - Color name or hex string
 * @returns Hex color string
 * @example
 * getCategoryHex("blue") // => "#3b82f6"
 * getCategoryHex("#ff0000") // => "#ff0000"
 */
function getCategoryHex(color: string): string {
  return CATEGORY_COLOR_MAP[color] ?? color
}

/**
 * Formats a YYYY/MM/DD or YYYY-MM-DD date string to a human-readable format.
 * @param dateStr - Date string
 * @returns Formatted date like "March 24, 2026"
 * @example
 * formatDate("2026/03/24") // => "March 24, 2026"
 */
function formatDate(dateStr: string): string {
  const normalized = dateStr.replace(/\//g, '-')
  const date = new Date(normalized + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Tooltip content showing category breakdown for a specific day.
 */
function CategoryBreakdown({ day }: { day: HeatmapDay }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{formatDate(day.date)}</p>
      {day.categories.length > 0 ? (
        <div className="space-y-0.5">
          {day.categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: getCategoryHex(cat.color) }}
              />
              <span>{cat.name}</span>
              <span className="ml-auto text-muted-foreground">{cat.count}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="border-t pt-1 text-xs text-muted-foreground">
        {day.count} task{day.count !== 1 ? 's' : ''} completed
      </p>
    </div>
  )
}

/**
 * GitHub-style contribution heatmap showing completed task activity.
 * Displays a full-year calendar grid with green intensity gradient.
 * Hover shows category breakdown via tooltip.
 *
 * @example
 * <ContributionGraph />
 */
export function ContributionGraph() {
  const { heatmapValues, dataByDate, total, isLoading } = useHeatmapData()

  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Activity
          </CardTitle>
          <CardDescription>Loading activity data...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Activity
          <Badge variant="secondary">{total} completed</Badge>
        </CardTitle>
        <CardDescription>Task completions in the last year</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <TooltipProvider delayDuration={100}>
            <HeatMap
              value={heatmapValues}
              startDate={startDate}
              weekLabels={WEEK_LABELS}
              panelColors={PANEL_COLORS}
              rectSize={11}
              space={2}
              style={{
                color: 'var(--muted-foreground)',
                fontSize: '10px',
              }}
              rectRender={(props, data) => {
                const dateKey = data.date?.replace(/\//g, '-') ?? ''
                const dayData = dataByDate.get(dateKey)

                if (!dayData || dayData.count === 0) {
                  return <rect {...props} />
                }

                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <rect {...props} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <CategoryBreakdown day={dayData} />
                    </TooltipContent>
                  </Tooltip>
                )
              }}
            />
          </TooltipProvider>
        </div>
        {/* Legend */}
        <div className="mt-2 flex items-center justify-end gap-1 text-xs">
          <span className="mr-1 text-muted-foreground">Less</span>
          {LEGEND_COLORS.map((color) => (
            <span
              key={color}
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
          ))}
          <span className="ml-1 text-muted-foreground">More</span>
        </div>
      </CardContent>
    </Card>
  )
}

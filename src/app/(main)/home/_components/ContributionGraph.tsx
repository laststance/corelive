'use client'

import HeatMap from '@uiw/react-heat-map'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

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
import { useComponentEffect } from '@/hooks/useComponentEffect'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import type { HeatmapDay } from '@/hooks/useHeatmapData'
import { calcMonthlyMaxDates } from '@/lib/calcMonthlyMaxDates'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import { DayDetailInputSchema } from '@/server/schemas/completed'

import { DayDetailDialog } from './DayDetailDialog'

/** Milliseconds in a single day. */
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000

/** Number of days displayed in a week column. */
const DAYS_IN_WEEK = 7

/** Reserved width for week-day labels inside the SVG. */
const HEATMAP_LEFT_PAD = 28

/** Minimum cell size — DESIGN.md heatmap cell-sizing lock (Heatmap Cathedral D6). */
const HEATMAP_MIN_RECT_SIZE = 12

/** Maximum cell size — DESIGN.md heatmap cell-sizing lock (Heatmap Cathedral D6). */
const HEATMAP_MAX_RECT_SIZE = 32

/** Gap between heatmap cells. */
const HEATMAP_SPACE = 2

/**
 * Theme-aware heatmap gradient expressed through global CSS variables.
 *
 * Keys are threshold *upper bounds* for `existColor` semantics in
 * @uiw/react-heat-map: it returns the value of the smallest key strictly
 * greater than the day's count. So count=1,2,3 falls into bucket `4` (L1),
 * count=4..9 falls into `10` (L2), and so on — matching DESIGN.md's
 * intensity bands and DayDetailDialog's `getIntensityFromCount`.
 */
const PANEL_COLORS: Record<string, string> = {
  0: 'var(--heatmap-level-0)',
  4: 'var(--heatmap-level-1)',
  10: 'var(--heatmap-level-2)',
  20: 'var(--heatmap-level-3)',
  1000: 'var(--heatmap-level-4)',
}

/** Legend color squares matching the gradient. */
const LEGEND_COLORS = [
  'var(--heatmap-level-0)',
  'var(--heatmap-level-1)',
  'var(--heatmap-level-2)',
  'var(--heatmap-level-3)',
  'var(--heatmap-level-4)',
]

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
const CategoryBreakdown = memo(function CategoryBreakdown({
  day,
}: {
  day: HeatmapDay
}) {
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
})

/**
 * GitHub-style contribution heatmap showing completed task activity.
 * Displays a full-year calendar grid with green intensity gradient.
 * Hover shows category breakdown via tooltip.
 *
 * @example
 * <ContributionGraph />
 */
export const ContributionGraph = memo(function ContributionGraph() {
  const { heatmapValues, dataByDate, total, isLoading } = useHeatmapData()
  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useObservedElementWidth(containerRef)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // `?date=YYYY-MM-DD` deep-link: validated via the same Zod schema the
  // server uses for `getDayDetail`, so invalid input is rejected with the
  // identical contract. The dep `[dateParam]` keeps the effect a one-shot
  // per URL change — internal day-nav (<,>,j,k) does not write back to the
  // URL (per plan §1.6), so this never thrashes.
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date')

  useComponentEffect(() => {
    // Closing the dialog when `?date=` is removed or invalidated keeps URL
    // and dialog state coupled. Without this, navigating from `?date=valid`
    // → `?date=` (or `?date=garbage`) would leave a stale dialog open even
    // though the deep-link contract says invalid input keeps the dialog
    // closed (CodeRabbit review on PR #38).
    if (!dateParam) {
      setSelectedDate(null)
      return
    }
    const parsed = DayDetailInputSchema.safeParse({ date: dateParam })
    if (parsed.success) {
      setSelectedDate(parsed.data.date)
    } else {
      setSelectedDate(null)
      // Sonner `id` dedupes the toast across React reconciliation passes so
      // SSR→hydrate or Suspense fallback→resolution cycles can't stack two
      // identical "invalid date" toasts on the same URL value (E2E flake on
      // CI Linux had `..×× F` strict-mode locator violations otherwise).
      toast.error('Invalid date in URL — showing your activity instead.', {
        id: `invalid-date-${dateParam}`,
      })
    }
  }, [dateParam])

  const endDate = useMemo(() => normalizeDate(new Date()), [])
  const startDate = useMemo(
    () => getAlignedHeatmapStartDate(endDate),
    [endDate],
  )
  const weekCount = useMemo(
    () => getHeatmapWeekCount(startDate, endDate),
    [startDate, endDate],
  )
  const heatmapLayout = useMemo(
    () => calculateHeatmapLayout(containerWidth, weekCount),
    [containerWidth, weekCount],
  )
  // Set of YYYY-MM-DD strings for each month's peak day. The ◎ overlay below
  // reads `monthlyMaxDates.has(dateKey)` on every rect render, so memoizing
  // the Set keeps that O(1) lookup stable across re-renders triggered by
  // hover/tooltip state.
  const monthlyMaxDates = useMemo(
    () => calcMonthlyMaxDates(dataByDate),
    [dataByDate],
  )
  // Functional setState lets us avoid depending on `selectedDate`, so the
  // callback identity stays stable across renders. PR2 will reuse this exact
  // handler for j/k keyboard navigation — keeping it stable matters because
  // `useKeyboardNav` will attach it to a window event listener.
  const handleNavigate = useCallback((dayOffset: -1 | 1) => {
    setSelectedDate((currentDate) =>
      currentDate ? shiftIsoDate(currentDate, dayOffset) : currentDate,
    )
  }, [])

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
        <div ref={containerRef} className="overflow-x-auto pb-1">
          <TooltipProvider delayDuration={100}>
            <HeatMap
              value={heatmapValues}
              startDate={startDate}
              endDate={endDate}
              weekLabels={WEEK_LABELS}
              panelColors={PANEL_COLORS}
              legendCellSize={0}
              rectSize={heatmapLayout.rectSize}
              space={HEATMAP_SPACE}
              width={heatmapLayout.width}
              style={{
                color: 'var(--muted-foreground)',
                fontSize: '10px',
              }}
              rectRender={(props, data) => {
                const dateKey = toIsoDateKey(data.date)
                const dayData = dataByDate.get(dateKey)
                const handleSelect = () => {
                  if (dateKey) setSelectedDate(dateKey)
                }
                const isMonthlyPeak = monthlyMaxDates.has(dateKey)

                if (!dayData || dayData.count === 0) {
                  return (
                    <rect
                      {...props}
                      onClick={handleSelect}
                      style={{ ...props.style, cursor: 'pointer' }}
                    />
                  )
                }

                // ◎ overlay marks each month's peak day. Painted in primary-foreground so
                // it reads against the warmer L3/L4 bands without breaking the palette;
                // pointer-events: none keeps the rect's click + tooltip intact.
                // aria-hidden because the glyph is decorative — VoiceOver/NVDA would
                // otherwise announce "circled bullet" between every neighboring cell's
                // tooltip, which is noisy and adds no information the rect doesn't carry.
                const monthlyPeakMark = isMonthlyPeak ? (
                  <text
                    x={Number(props.x) + Number(props.width) / 2}
                    y={Number(props.y) + Number(props.height) / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.floor(heatmapLayout.rectSize * 0.5)}
                    fill="var(--primary-foreground)"
                    aria-hidden
                    style={{ pointerEvents: 'none' }}
                  >
                    ◎
                  </text>
                ) : null

                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <g>
                        <rect
                          {...props}
                          onClick={handleSelect}
                          style={{ ...props.style, cursor: 'pointer' }}
                        />
                        {monthlyPeakMark}
                      </g>
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
        <DayDetailDialog
          date={selectedDate}
          onOpenChange={(open) => {
            if (!open) setSelectedDate(null)
          }}
          onNavigate={handleNavigate}
        />
      </CardContent>
    </Card>
  )
})

/**
 * Observes an element and returns its current content width.
 * @param elementRef - Reference to the container element
 * @returns
 * - The measured width in pixels after mount
 * - `null` before the first measurement completes
 * @example
 * const containerRef = useRef<HTMLDivElement>(null)
 * const width = useObservedElementWidth(containerRef)
 */
function useObservedElementWidth<T extends HTMLElement>(
  elementRef: React.RefObject<T | null>,
): number | null {
  const [elementWidth, setElementWidth] = useState<number | null>(null)

  useComponentEffect(() => {
    const element = elementRef.current

    if (!element) {
      return
    }

    const updateWidth = (nextWidth: number) => {
      setElementWidth(Math.floor(nextWidth))
    }

    updateWidth(element.clientWidth)

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => updateWidth(element.clientWidth)
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? element.clientWidth
      updateWidth(nextWidth)
    })

    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [elementRef])

  return elementWidth
}

type HeatmapLayout = {
  rectSize: number
  width: number
}

/**
 * Calculates the heatmap dimensions needed to fill available space without clipping the year.
 * @param containerWidth - Measured width of the card content area
 * @param weekCount - Number of week columns that must be rendered
 * @returns
 * - `rectSize`: Cell size that best uses the current width
 * - `width`: SVG width, allowing horizontal scroll only when the card is too narrow
 * @example
 * calculateHeatmapLayout(720, 53) // => { rectSize: 11, width: 717 }
 * calculateHeatmapLayout(480, 53) // => { rectSize: 8, width: 558 }
 */
function calculateHeatmapLayout(
  containerWidth: number | null,
  weekCount: number,
): HeatmapLayout {
  const minimumWidth =
    HEATMAP_LEFT_PAD + weekCount * (HEATMAP_MIN_RECT_SIZE + HEATMAP_SPACE)

  if (!containerWidth || containerWidth <= minimumWidth) {
    return {
      rectSize: HEATMAP_MIN_RECT_SIZE,
      width: minimumWidth,
    }
  }

  const nextRectSize = clampNumber(
    Math.floor((containerWidth - HEATMAP_LEFT_PAD) / weekCount) - HEATMAP_SPACE,
    HEATMAP_MIN_RECT_SIZE,
    HEATMAP_MAX_RECT_SIZE,
  )
  const nextWidth =
    HEATMAP_LEFT_PAD + weekCount * (nextRectSize + HEATMAP_SPACE)

  return {
    rectSize: nextRectSize,
    width: nextWidth,
  }
}

/**
 * Returns the Sunday-aligned starting point for the trailing one-year heatmap.
 * @param endDate - Last visible date in the heatmap
 * @returns
 * - A normalized date exactly one year back
 * - Shifted to the previous Sunday so week columns stay aligned
 * @example
 * getAlignedHeatmapStartDate(new Date('2026-04-08T00:00:00')) // => Sunday-aligned date near 2025-04-08
 */
function getAlignedHeatmapStartDate(endDate: Date): Date {
  const startDate = new Date(endDate)
  startDate.setFullYear(startDate.getFullYear() - 1)
  const dayOfWeek = startDate.getDay()

  if (dayOfWeek === 0) {
    return startDate
  }

  startDate.setDate(startDate.getDate() - dayOfWeek)
  return startDate
}

/**
 * Counts how many week columns are needed between two dates, inclusive.
 * @param startDate - First visible date in the heatmap
 * @param endDate - Last visible date in the heatmap
 * @returns
 * - Number of week columns required to render the full date range
 * @example
 * getHeatmapWeekCount(new Date('2025-04-06T00:00:00'), new Date('2026-04-08T00:00:00')) // => 53
 */
function getHeatmapWeekCount(startDate: Date, endDate: Date): number {
  const totalDayCount =
    Math.floor((endDate.getTime() - startDate.getTime()) / ONE_DAY_IN_MS) + 1

  return Math.ceil(totalDayCount / DAYS_IN_WEEK)
}

/**
 * Normalizes a date to local midnight so layout math stays stable across renders.
 * @param date - Date to normalize
 * @returns
 * - A new date at 00:00:00 local time
 * @example
 * normalizeDate(new Date('2026-04-08T15:30:00')) // => 2026-04-08T00:00:00 local
 */
function normalizeDate(date: Date): Date {
  const normalizedDate = new Date(date)
  normalizedDate.setHours(0, 0, 0, 0)
  return normalizedDate
}

/**
 * Restricts a numeric value to an inclusive range.
 * @param value - Value to clamp
 * @param min - Smallest allowed value
 * @param max - Largest allowed value
 * @returns
 * - `min` when the value is too small
 * - `max` when the value is too large
 * - The original value when it already fits the range
 * @example
 * clampNumber(4, 8, 28) // => 8
 * clampNumber(18, 8, 28) // => 18
 */
function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Converts a heatmap rect's raw `data.date` (the library emits `YYYY/M/D` with
 * no zero-padding) into the canonical `YYYY-MM-DD` form used by the server
 * aggregation (`updatedAt.toISOString().split('T')[0]`) and by `dataByDate`.
 *
 * Without this, the click handler passed `2026-5-10` to `getDayDetail`, which
 * never matches the server's `2026-05-10` bucket — so the dialog returned
 * count=0 ("rest day") for cells the heatmap painted as L1+. Also unblocks
 * `formatDate`, which falls back to "INVALID DATE" when given non-padded ISO.
 *
 * @param rawDate - The `data.date` value from @uiw/react-heat-map (`YYYY/M/D`)
 * @returns A zero-padded `YYYY-MM-DD` string, or empty string when unparseable
 * @example
 * toIsoDateKey("2026/5/10")  // => "2026-05-10"
 * toIsoDateKey("2026/12/3")  // => "2026-12-03"
 * toIsoDateKey(undefined)    // => ""
 */
function toIsoDateKey(rawDate: string | undefined): string {
  if (!rawDate) return ''
  const parts = rawDate.split('/')
  if (parts.length !== 3) return ''
  const [year, month, day] = parts
  if (!year || !month || !day) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

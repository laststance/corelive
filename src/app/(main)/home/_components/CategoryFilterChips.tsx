'use client'

import { match } from 'ts-pattern'

import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useIsMobile } from '@/hooks/use-mobile'
import type { HeatmapDay } from '@/hooks/useHeatmapData'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import {
  aggregateCategoryTrends,
  type CategoryTrend,
  type CategoryTrendEntry,
} from '@/lib/aggregate-category-trends'
import { getColorDotClass } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

/**
 * Threshold above which we collapse the chip row into a `<Select>` on
 * mobile. CEO §3.5 calls this out as cuttable scope: at 5+ chips the row
 * starts wrapping and reads noisy on a phone — a dropdown is calmer and
 * keeps the screen quiet (DESIGN.md "Warm Cathedral" voice).
 */
const MOBILE_COLLAPSE_THRESHOLD = 5

interface CategoryFilterChipsProps {
  /**
   * Heatmap data from `useHeatmapData()`. The component computes per-
   * category 7-day trends client-side from this Map — no extra fetch.
   */
  dataByDate: Map<string, HeatmapDay>
  /**
   * Loading sentinel from `useHeatmapData`. Renders a quiet placeholder so
   * the card height does not jump when the heatmap query resolves.
   */
  isLoading?: boolean
}

/**
 * Short label suffix for the WoW trend, e.g. `"↑ 25%"` or `"new"`.
 * Returns an empty string when the trend should NOT show a delta (the
 * `firstWeek` / `flat` arms — chip already communicates inactivity via
 * the muted count).
 *
 * @param trend - Trend state from {@link aggregateCategoryTrends}
 * @returns
 * - Plain-text delta suffix or `''`
 * @example
 * trendSuffix({ kind: 'percent', value: 25 })  // => "↑ 25%"
 * trendSuffix({ kind: 'percent', value: -40 }) // => "↓ 40%"
 * trendSuffix({ kind: 'new' })                 // => "new"
 * trendSuffix({ kind: 'flat' })                // => ""
 */
function trendSuffix(trend: CategoryTrend): string {
  return match(trend)
    .with({ kind: 'firstWeek' }, () => '')
    .with({ kind: 'flat' }, () => '')
    .with({ kind: 'new' }, () => 'new')
    .with({ kind: 'percent' }, ({ value }) => {
      if (value === 0) return ''
      const arrow = value > 0 ? '↑' : '↓'
      return `${arrow} ${Math.abs(value)}%`
    })
    .exhaustive()
}

/**
 * One-line accessible summary for a chip, read aloud by screen readers
 * via `aria-label`. Includes the count + trend so AT users get the same
 * information as sighted users (the small arrow isn't announced).
 *
 * @param entry - Per-category aggregated trend entry
 * @param isActive - Whether this chip is the currently selected filter
 * @returns
 * - Human-readable label like "writing, 5 this week, up 25% from last week"
 * @example
 * chipAccessibleLabel(entry, true)
 * // => "writing filter active, 5 this week, up 25% from last week"
 */
function chipAccessibleLabel(
  entry: CategoryTrendEntry,
  isActive: boolean,
): string {
  const trendSentence = match(entry.trend)
    .with({ kind: 'firstWeek' }, () => 'no activity this week')
    .with({ kind: 'flat' }, () => 'a quiet week')
    .with({ kind: 'new' }, () => 'new this week')
    .with({ kind: 'percent' }, ({ value }) => {
      if (value === 0) return "steady — last week's pace"
      if (value > 0) return `up ${value}% from last week`
      return `down ${Math.abs(value)}% from last week`
    })
    .exhaustive()
  const activePrefix = isActive ? 'filter active, ' : ''
  return `${entry.name}, ${activePrefix}${entry.currentCount} this week, ${trendSentence}`
}

/**
 * Renders a single chip button. Extracted so the desktop (chip row) and
 * mobile (Select item) renderers stay focused.
 *
 * @example
 * <CategoryChip entry={entry} isActive={false} onClick={toggle} />
 */
function CategoryChip({
  entry,
  isActive,
  onClick,
}: {
  entry: CategoryTrendEntry
  isActive: boolean
  onClick: () => void
}) {
  const suffix = trendSuffix(entry.trend)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={chipAccessibleLabel(entry, isActive)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card hover:bg-muted',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block size-1.5 rounded-full',
          getColorDotClass(entry.color),
        )}
      />
      <span>{entry.name}</span>
      <span
        aria-hidden
        className={cn(
          'font-mono tabular-nums',
          isActive ? 'text-background/80' : 'text-muted-foreground',
        )}
      >
        {entry.currentCount}
      </span>
      {suffix && (
        <span
          aria-hidden
          className={cn(
            'font-serif italic',
            isActive ? 'text-background/80' : 'text-muted-foreground',
          )}
        >
          {suffix}
        </span>
      )}
    </button>
  )
}

/**
 * Per-category trend chip row mounted under the WeeklySummaryCard on the
 * home route. Each chip shows the category name, last-7-day count, and a
 * subtle WoW trend indicator. Clicking a chip toggles
 * `useSelectedCategory` so the user can quickly drill into a single
 * category's todo list.
 *
 * Layout rules (DESIGN.md):
 * - Desktop / <5 categories → wraps a chip row.
 * - Mobile + ≥5 categories → collapses to a `<Select>` dropdown to keep
 *   the screen calm (CEO §3.5 cuttable-scope note).
 *
 * Voice:
 * - Trend phrasing is factual ("↑ 25%"), never KPI guilt ("you crushed
 *   it"). `firstWeek` and `flat` states emit no arrow/delta — the count
 *   alone speaks for them.
 *
 * @param dataByDate - Heatmap data from `useHeatmapData()`
 * @param isLoading - Whether the heatmap query is still settling
 * @returns
 * - A Card with chips (or Select on mobile + ≥5 categories)
 * - `null` when there is no category activity to show (keeps the layout
 *   quiet for brand-new users)
 * @example
 * <CategoryFilterChips dataByDate={dataByDate} isLoading={false} />
 */
export function CategoryFilterChips({
  dataByDate,
  isLoading,
}: CategoryFilterChipsProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
  const isMobile = useIsMobile()
  // Compute against `new Date()` per render so the window rolls forward
  // at the day boundary without a useMemo on stale anchor — same trade-
  // off SundayDigestCard made (correctness > re-render micro-opt).
  const entries = aggregateCategoryTrends(dataByDate, new Date())

  // Skeleton during the initial heatmap fetch — keeps card height stable
  // so the layout doesn't shift when data arrives.
  if (isLoading) {
    return (
      <Card aria-busy aria-label="Loading category breakdown">
        <CardContent className="p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            categories
          </p>
          <p className="pt-3 font-serif text-sm italic text-muted-foreground">
            …
          </p>
        </CardContent>
      </Card>
    )
  }

  // No categories with activity in the last 14 days — render nothing
  // rather than an empty-state nag, matching DESIGN.md voice.
  if (entries.length === 0) return null

  const useSelectFallback =
    isMobile && entries.length >= MOBILE_COLLAPSE_THRESHOLD

  return (
    <Card aria-label="Category breakdown">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            categories
          </p>
          {selectedCategoryId !== null && (
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className="font-serif text-xs italic text-muted-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              show all
            </button>
          )}
        </div>

        {useSelectFallback ? (
          <Select
            value={
              selectedCategoryId !== null ? String(selectedCategoryId) : 'all'
            }
            onValueChange={(value) =>
              setSelectedCategoryId(value === 'all' ? null : Number(value))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {entries.map((entry) => {
                const suffix = trendSuffix(entry.trend)
                return (
                  <SelectItem key={entry.id} value={String(entry.id)}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block size-1.5 rounded-full',
                          getColorDotClass(entry.color),
                        )}
                      />
                      <span>{entry.name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {entry.currentCount}
                      </span>
                      {suffix && (
                        <span className="font-serif italic text-muted-foreground">
                          {suffix}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        ) : (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {entries.map((entry) => {
              const isActive = selectedCategoryId === entry.id
              return (
                <li key={entry.id}>
                  <CategoryChip
                    entry={entry}
                    isActive={isActive}
                    onClick={() =>
                      setSelectedCategoryId(isActive ? null : entry.id)
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

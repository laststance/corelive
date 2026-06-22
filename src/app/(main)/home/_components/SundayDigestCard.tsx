'use client'

import { X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMounted } from '@/hooks/use-mounted'
import type { HeatmapDay } from '@/hooks/useHeatmapData'
import { aggregateLastSevenDays } from '@/lib/aggregate-last-seven-days'
import { getColorDotClass } from '@/lib/category-colors'
import { log } from '@/lib/logger'
import { shiftIsoDate } from '@/lib/shiftIsoDate'
import { cn } from '@/lib/utils'

/**
 * Window the digest summarises. Anchored to the *local* Sunday so the user's
 * perceived week boundary lines up with when the card appears — using UTC
 * would surface the digest on a Saturday afternoon for JST users.
 */
const DIGEST_WINDOW_DAYS = 7

/**
 * Local-day index for Sunday. JS Date.getDay() spec: 0=Sunday, 6=Saturday.
 */
const SUNDAY_DAY_INDEX = 0

/**
 * localStorage key prefix for the per-week dismiss flag. The full key is
 * `${PREFIX}${localSundayIso}` so each Sunday gets a fresh key — next week
 * the card reappears automatically without any cleanup logic.
 */
const DISMISS_KEY_PREFIX = 'corelive.sunday-digest-dismissed.'

interface SundayDigestCardProps {
  /** Per-day heatmap entries from `useHeatmapData()` — same Map the
   * WeeklySummaryCard reads, so no extra fetch. */
  dataByDate: Map<string, HeatmapDay>
  /** Loading sentinel from `useHeatmapData`. The card stays hidden while
   * the query is in-flight so the digest never shows zero-and-then-real. */
  isLoading?: boolean
  /** Optional injection for tests. Production callers leave undefined. */
  now?: Date
}

/**
 * Picks the single best day from a 7-day window ending on `windowEndIsoDate`.
 * "Best" = highest `count`; ties broken by *recency* (later date wins) so the
 * highlighted day feels current rather than randomly chosen from the week.
 *
 * @param dataByDate - Per-day heatmap entries
 * @param windowEndIsoDate - Inclusive YYYY-MM-DD anchor (the local Sunday)
 * @returns
 * - `{ date, count, categories }` for the best day, or `null` if the entire
 *   window has zero activity
 * @example
 * pickBestDay(map, '2026-05-10')
 * // => { date: '2026-05-08', count: 6, categories: [...] }
 */
function pickBestDay(
  dataByDate: Map<string, HeatmapDay>,
  windowEndIsoDate: string,
): HeatmapDay | null {
  let best: HeatmapDay | null = null
  for (let dayOffset = 0; dayOffset < DIGEST_WINDOW_DAYS; dayOffset++) {
    const isoDate = shiftIsoDate(windowEndIsoDate, -dayOffset)
    const day = dataByDate.get(isoDate)
    if (!day || day.count === 0) continue
    if (!best || day.count > best.count) {
      best = day
    }
  }
  return best
}

/**
 * Formats a YYYY-MM-DD date as a short, locale-friendly label for display.
 * Pinned to `en-US` so CI runs on locales without Intl data still render
 * consistently. Uses `T00:00:00Z` so the formatted day matches the bucket
 * key exactly across TZs.
 *
 * @param isoDate - YYYY-MM-DD UTC date string
 * @returns
 * - Short "Fri, May 8" style label
 * @example
 * formatShortDay('2026-05-08') // => "Fri, May 8"
 */
function formatShortDay(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Reads the per-week dismiss flag from localStorage. Returns `false` when
 * the key is absent or storage is unavailable, so the card defaults to
 * visible — failing-quiet is correct here (the digest is opt-out).
 *
 * @param weekKey - localStorage key derived from the local Sunday's ISO date
 * @returns
 * - `true` if the digest has been dismissed for this week
 */
function readDismissed(weekKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(weekKey) === '1'
  } catch {
    return false
  }
}

/**
 * Persists the per-week dismiss flag. Storage errors are swallowed —
 * over-showing the digest is preferable to throwing in an event handler.
 *
 * @param weekKey - localStorage key for the current Sunday
 */
function writeDismissed(weekKey: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(weekKey, '1')
  } catch (error) {
    log.warn('Failed to persist sunday digest dismissal', error)
  }
}

/**
 * Returns the YYYY-MM-DD ISO date for the local Sunday that anchors the
 * digest window. When `now` is already a Sunday, returns that day's local
 * date; otherwise returns the *most recent* prior Sunday.
 *
 * Local TZ is used intentionally — "Sunday" should match the user's
 * perceived calendar week boundary, not the UTC week.
 *
 * @param now - Anchor Date in the caller's local TZ
 * @returns
 * - YYYY-MM-DD string in the local TZ
 * @example
 * // when now is a Wednesday
 * localSundayIso(new Date('2026-05-13T12:00:00Z')) // => "2026-05-10"
 */
function localSundayIso(now: Date): string {
  const local = new Date(now)
  const daysSinceSunday = local.getDay()
  local.setDate(local.getDate() - daysSinceSunday)
  // Hand-roll the YYYY-MM-DD string from local-TZ getters — ECMAScript
  // does not spec a stable format for `toLocaleDateString('en-CA')`, and
  // engine/CLDR updates have flipped it from `yyyy-MM-dd` to `M/d/yyyy`
  // in the wild (see CodeRabbit thread on PR #39). If that ever happens
  // again the dismiss key, `shiftIsoDate` input, and `new Date()` parser
  // would all silently break.
  const year = local.getFullYear()
  const month = String(local.getMonth() + 1).padStart(2, '0')
  const day = String(local.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * "Memory Lane" Sunday digest card. Renders only on local Sunday, only when
 * heatmap data has loaded, and only when the user has not dismissed it for
 * this week. Surfaces:
 *
 * - Total things done in the last 7 days
 * - Best day of the week (date + count)
 * - Top categories the user touched
 *
 * Voice follows DESIGN.md §Voice (quiet companion, never KPI grading). When
 * the week was zero, the card shows a soft "the room was quiet this week"
 * line instead of suppressing entirely — the digest is meant to reassure
 * on rest weeks too (north star: self-affirmation, never failure framing).
 *
 * Dismiss is scoped to the calendar week via a localStorage key keyed on
 * the local Sunday's ISO date. Next Sunday gets a fresh key automatically.
 *
 * @example
 * <SundayDigestCard dataByDate={dataByDate} isLoading={isLoading} />
 */
export const SundayDigestCard = function SundayDigestCard({
  dataByDate,
  isLoading,
  now,
}: SundayDigestCardProps) {
  const isMounted = useMounted()

  // Derive calendar keys per render so a re-render after midnight can move the
  // card to the new local day without storing a stale Date object.
  const today = now ?? new Date()
  const isSunday = today.getDay() === SUNDAY_DAY_INDEX
  const sundayIso = localSundayIso(today)
  const weekKey = `${DISMISS_KEY_PREFIX}${sundayIso}`

  // Render-time dismiss read (post-mount only) avoids hydration mismatch —
  // server can't know what's in client localStorage, so we treat the card
  // as visible during SSR and let the post-mount state correct if needed.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  const dismissed = isMounted
    ? dismissedAt === weekKey || readDismissed(weekKey)
    : false

  // Derive the stats once per `dataByDate` / local Sunday key.
  //
  // Pass the local Sunday's YYYY-MM-DD key straight to
  // `aggregateLastSevenDays`, which now anchors on a local-day key (L3). The
  // visibility window (local Sunday) and the data window stay in lockstep, so
  // a JST Sunday-morning recap includes Sunday's data instead of mis-bucketing
  // it as the prior UTC (Saturday) day.
  const weekStats = aggregateLastSevenDays(dataByDate, sundayIso)
  const bestDay = pickBestDay(dataByDate, sundayIso)

  const handleDismiss = () => {
    writeDismissed(weekKey)
    setDismissedAt(weekKey)
  }

  if (!isMounted) return null
  if (isLoading) return null
  if (!isSunday) return null
  if (dismissed) return null
  // Note: an empty `dataByDate` does NOT suppress the card — a fully
  // quiet week is exactly the case the "the room was quiet this week —
  // that is fine too." copy was added for (DESIGN.md north star:
  // self-affirmation, never failure framing).

  return (
    <Card aria-label="A quiet Sunday recap">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              a quiet sunday recap
            </p>
            <p className="font-serif text-base italic text-foreground">
              {weekStats.totalCompleted === 0
                ? 'the room was quiet this week — that is fine too.'
                : `${weekStats.totalCompleted} things made it onto the wall.`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss the Sunday recap until next week"
            onClick={handleDismiss}
            className="size-7 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        {bestDay ? (
          <p className="text-sm text-muted-foreground">
            brightest day:{' '}
            <span className="text-foreground">
              {formatShortDay(bestDay.date)}
            </span>{' '}
            <span className="font-mono tabular-nums">
              {bestDay.count} {bestDay.count === 1 ? 'thing' : 'things'}
            </span>
          </p>
        ) : null}

        {weekStats.topCategories.length > 0 && (
          <ul
            aria-label="Top categories this week"
            className="flex flex-wrap gap-1.5"
          >
            {weekStats.topCategories.map((category) => (
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

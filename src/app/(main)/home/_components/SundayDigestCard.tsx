'use client'

import { X } from 'lucide-react'
import { useMemo, useState } from 'react'

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
  // Format in local TZ — `toLocaleDateString` with the en-CA locale yields
  // a YYYY-MM-DD shape without needing to slice an ISO string.
  return local.toLocaleDateString('en-CA')
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
export function SundayDigestCard({
  dataByDate,
  isLoading,
  now,
}: SundayDigestCardProps) {
  const isMounted = useMounted()

  // Stabilize `today` so a fresh `new Date()` per render does not
  // invalidate the `summary` memo every paint — when the caller omits
  // `now`, the value is captured once on first render (sufficient: the
  // digest is a Sunday-only card, no need to track minutes within a day).
  const today = useMemo(() => now ?? new Date(), [now])
  const isSunday = today.getDay() === SUNDAY_DAY_INDEX
  const weekKey = `${DISMISS_KEY_PREFIX}${localSundayIso(today)}`

  // Render-time dismiss read (post-mount only) avoids hydration mismatch —
  // server can't know what's in client localStorage, so we treat the card
  // as visible during SSR and let the post-mount state correct if needed.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  const dismissed = isMounted
    ? dismissedAt === weekKey || readDismissed(weekKey)
    : false

  // Derive the stats once per `dataByDate` / `today` identity.
  //
  // Why anchor on UTC-midnight-of-local-Sunday: `aggregateLastSevenDays`
  // builds its window via `formatUTCDateISO`, which would otherwise read
  // the UTC calendar day of `today` — at e.g. JST Sunday 06:00 that day
  // is still Saturday in UTC, so the user would see a "Sunday recap" that
  // misses Sunday's data. Re-deriving the anchor from the local Sunday's
  // ISO string keeps the visibility window (local Sunday) and the data
  // window (the same Sunday key) in lockstep.
  const summary = useMemo(() => {
    const sundayIso = localSundayIso(today)
    const sundayAnchor = new Date(`${sundayIso}T00:00:00.000Z`)
    const weekStats = aggregateLastSevenDays(dataByDate, sundayAnchor)
    const bestDay = pickBestDay(dataByDate, sundayIso)
    return { weekStats, bestDay }
  }, [dataByDate, today])

  if (!isMounted) return null
  if (isLoading) return null
  if (!isSunday) return null
  if (dismissed) return null
  if (dataByDate.size === 0) return null

  const { weekStats, bestDay } = summary

  const handleDismiss = () => {
    writeDismissed(weekKey)
    setDismissedAt(weekKey)
  }

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

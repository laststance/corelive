'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ImageDown } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useKeyboardNav } from '@/hooks/useKeyboardNav'
import { getColorDotClass } from '@/lib/category-colors'
import { exportDayAsImage } from '@/lib/export-day-as-image'
import { formatClockTime } from '@/lib/formatClockTime'
import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import {
  getHeatmapIntensityFromCount,
  HEATMAP_LEVEL_TOKENS,
  type Intensity,
} from '@/lib/heatmap-intensity'
import { log } from '@/lib/logger'
import { orpc } from '@/lib/orpc/client-query'
import { cn } from '@/lib/utils'

interface DayDetailDialogProps {
  date: string | null
  onOpenChange: (open: boolean) => void
  /**
   * Optional day navigation callback. When provided, `< >` icon buttons are
   * rendered inside DialogHeader. The handler receives a signed day offset
   * (`-1` for previous, `1` for next) and is expected to swap `date` for the
   * shifted YYYY-MM-DD on the parent. Co-designed with PR2's keyboard nav so
   * the same handler can be reused by `useKeyboardNav` without API churn.
   */
  onNavigate?: (dayOffset: -1 | 1) => void
}

interface DayState {
  intensity: Intensity
  bandToken: string
  name: string
  voice: string
  isCathedralLit: boolean
}

/**
 * Turns a day's completion count into the design-finalized state copy and the
 * heatmap palette token used by the dialog's level band. Intensity and its band
 * token come from heatmap-intensity.ts, so the dialog band and the
 * ContributionGraph cell for the same day always agree.
 * @param dayCount - Completed tasks on the clicked day
 * @returns A DayState describing band color, italic display name, voice line, and cathedral-lit flag.
 * @example
 * getDayState(0)  // => { intensity: 0, bandToken: "var(--hm-0)", name: "rest day", ... }
 * getDayState(22) // => { intensity: 4, bandToken: "var(--hm-4)", name: "cathedral lit", isCathedralLit: true, ... }
 */
function getDayState(dayCount: number): DayState {
  const intensity = getHeatmapIntensityFromCount(dayCount)
  // Band color is purely intensity-indexed; the match below only varies the copy.
  const bandToken = HEATMAP_LEVEL_TOKENS[intensity]
  return match(intensity)
    .with(0, () => ({
      intensity: 0 as const,
      bandToken,
      name: 'rest day',
      voice: 'rest days are days too. the cathedral keeps the light on.',
      isCathedralLit: false,
    }))
    .with(1, () => ({
      intensity: 1 as const,
      bandToken,
      name: 'started',
      voice: 'a couple things landed. that counts.',
      isCathedralLit: false,
    }))
    .with(2, () => ({
      intensity: 2 as const,
      bandToken,
      name: 'good day',
      voice: 'a productive rhythm — solid showing.',
      isCathedralLit: false,
    }))
    .with(3, () => ({
      intensity: 3 as const,
      bandToken,
      name: 'full day',
      voice: 'the day kept its rhythm — quietly full.',
      isCathedralLit: false,
    }))
    .with(4, () => ({
      intensity: 4 as const,
      bandToken,
      name: 'cathedral lit',
      voice: "the day held everything. that's not a fluke.",
      isCathedralLit: true,
    }))
    .exhaustive()
}

/**
 * Formats a YYYY-MM-DD date string to a long-form readable label.
 *
 * Parses + formats in UTC so the displayed date matches the bucket the
 * server, heatmap cell, URL `?date=` param, and `shiftIsoDate` all operate
 * on. Without `timeZone: 'UTC'` a user in (say) UTC-8 sees "March 31, 2026"
 * for `2026-04-01` because `new Date('2026-04-01...')` is UTC midnight and
 * `toLocaleDateString` defaults to local TZ — the subtitle drifts one day
 * back relative to every other surface.
 *
 * @param isoDate - YYYY-MM-DD date string
 * @returns Long-form date like "May 10, 2026"
 * @example
 * formatDate("2026-05-10") // => "May 10, 2026" (in any timezone)
 */
function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Picks the single most-used category name across a day's completed
 * tasks. Used by the share card to render the "mostly <category>" line.
 * Ties broken alphabetically (locale-insensitive 'en') so two days with
 * the same task mix produce identical share cards across machines.
 *
 * @param tasks - The day's completed tasks
 * @returns
 * - Category name with the highest occurrence
 * - `null` when no task carries a category
 * @example
 * getTopCategoryName([
 *   { category: { name: 'writing' } },
 *   { category: { name: 'reading' } },
 *   { category: { name: 'writing' } },
 * ]) // => 'writing'
 */
function getTopCategoryName<T extends { category?: { name: string } | null }>(
  tasks: ReadonlyArray<T>,
): string | null {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const name = task.category?.name
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    // Deterministic tie-break — locale-insensitive so CI/local agree.
    return a[0].localeCompare(b[0], 'en')
  })[0]![0]
}

/**
 * Day-detail dialog opened by clicking a Heatmap cell. Renders the day's
 * level band (paper → terracotta), italic state name, voice line, and a
 * compact list of the day's completed tasks. The cathedral-lit halo (soft
 * amber box-shadow ring) only appears on full days (intensity 4); today
 * gets a pulse-dot "still going" footer when the count is non-zero.
 *
 * @param date - YYYY-MM-DD date string; null collapses the dialog
 * @param onOpenChange - Forwarded to Radix Dialog to drive open state from the parent
 * @example
 * <DayDetailDialog date={selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)} />
 */
export const DayDetailDialog = function DayDetailDialog({
  date,
  onOpenChange,
  onNavigate,
}: DayDetailDialogProps) {
  const isClerkQueryReady = useClerkQueryReady()
  const [isSaving, setIsSaving] = useState(false)
  // `placeholderData: keepPreviousData` so that pressing j/k or the < >
  // chevrons doesn't flash the header back to "rest day" while the next
  // day's query is in flight. The previous day's count + state band hold
  // until the new data lands — TanStack Query v5 marks the result as
  // `isPlaceholderData` so we can still gate the task list separately.
  const { data, isLoading, isPlaceholderData } = useQuery({
    ...orpc.completed.dayDetail.queryOptions({
      input: {
        date: date ?? '1970-01-01',
        // Bucket the cell's day by the browser's local zone (L3) so the
        // dialog's entries match the locally-rendered heatmap cell exactly.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }),
    enabled: isClerkQueryReady && date !== null,
    placeholderData: keepPreviousData,
  })

  const isOpen = date !== null
  const dayCount = data?.count ?? 0
  const state = getDayState(dayCount)
  const isToday = date !== null && date === getLocalTodayIsoDate()

  /**
   * Captures the day's stats as a PNG via html-to-image and triggers a
   * browser download. The button stays disabled while a previous capture
   * is in flight so a double-click doesn't spawn parallel toPng calls
   * (each of which would append its own off-screen card).
   */
  const handleShare = async () => {
    if (!date || dayCount === 0 || isSaving) return
    setIsSaving(true)
    try {
      const topCategoryName = data?.tasks
        ? getTopCategoryName(data.tasks)
        : null
      const dataUrl = await exportDayAsImage({
        isoDate: date,
        totalCompleted: dayCount,
        topCategoryName,
      })
      const anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = `corelive-${date}.png`
      anchor.click()
    } catch (error) {
      // log.warn keeps the error visible without bubbling a toast — the
      // button re-enables in the finally so the user can simply retry.
      log.warn('Failed to export day as image', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handlePreviousDay = () => {
    onNavigate?.(-1)
  }

  const handleNextDay = () => {
    onNavigate?.(1)
  }

  // j/k keyboard nav reuses the same `onNavigate` contract as the `< >`
  // buttons, so the dialog has a single source of truth for day-stepping.
  // Esc dismiss is delegated to Radix Dialog natively (don't double-handle).
  useKeyboardNav({
    isOpen,
    onPrev: handlePreviousDay,
    onNext: handleNextDay,
  })

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('sm:max-w-md', state.isCathedralLit && 'cathedral-lit')}
      >
        {date && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="size-9 rounded-md border border-border"
                  style={{ backgroundColor: state.bandToken }}
                />

                <div className="flex flex-col items-start gap-0.5">
                  <DialogTitle className="font-serif text-2xl italic text-foreground">
                    {state.name}
                  </DialogTitle>
                  <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {formatDate(date)}
                  </p>
                </div>
                {/* `mr-8` clears the Dialog's absolute-positioned close X (right-4) so action buttons don't visually collide with it */}
                <div className="ml-auto mr-8 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={handleShare}
                    disabled={
                      isSaving ||
                      dayCount === 0 ||
                      isLoading ||
                      isPlaceholderData
                    }
                    aria-label="Save as image"
                  >
                    <ImageDown />
                  </Button>
                  {onNavigate && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={handlePreviousDay}
                        aria-label="Previous day"
                      >
                        <ChevronLeft />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={handleNextDay}
                        aria-label="Next day"
                      >
                        <ChevronRight />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <DialogDescription className="pt-1 font-serif text-sm italic text-muted-foreground">
                {state.voice}
              </DialogDescription>
            </DialogHeader>

            {isLoading || isPlaceholderData ? (
              <p className="text-sm text-muted-foreground">…</p>
            ) : dayCount === 0 ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                {isToday
                  ? 'today is still open — there is no shape to it yet.'
                  : 'no tasks landed on this day. rest is a choice, not a void.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data?.tasks.map((task) => (
                  <li
                    key={`${task.source}-${task.id}`}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'inline-block size-2 shrink-0 rounded-full',
                        getColorDotClass(task.category?.color),
                      )}
                    />

                    <span className="text-sm text-foreground">
                      {task.title}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {formatClockTime(task.completedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {isToday && dayCount > 0 && (
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-block size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
                />
                still going · {formatClockTime(new Date())}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

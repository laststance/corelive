'use client'

import { useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { getColorDotClass } from '@/lib/category-colors'
import { orpc } from '@/lib/orpc/client-query'
import { cn } from '@/lib/utils'

interface DayDetailDialogProps {
  date: string | null
  onOpenChange: (open: boolean) => void
}

type Intensity = 0 | 1 | 2 | 3 | 4

interface DayState {
  intensity: Intensity
  bandToken: string
  name: string
  voice: string
  isCathedralLit: boolean
}

/**
 * Maps the day's completion count to one of five Warm Cathedral intensity
 * levels. Mirrors the existing heatmap thresholds in ContributionGraph so a
 * cell's visual level and the dialog's level band stay in lockstep.
 * @param dayCount - Completed tasks on the clicked day
 * @returns
 * - 0 when no tasks (rest)
 * - 1 for 1–3 tasks (started)
 * - 2 for 4–9 tasks (good day)
 * - 3 for 10–19 tasks (full day)
 * - 4 for 20+ tasks (cathedral lit)
 * @example
 * getIntensityFromCount(0)  // => 0
 * getIntensityFromCount(7)  // => 2
 * getIntensityFromCount(22) // => 4
 */
function getIntensityFromCount(dayCount: number): Intensity {
  if (dayCount === 0) return 0
  if (dayCount < 4) return 1
  if (dayCount < 10) return 2
  if (dayCount < 20) return 3
  return 4
}

/**
 * Turns a day's completion count into the design-finalized state copy and
 * the heatmap palette token used by the dialog's level band.
 * @param dayCount - Completed tasks on the clicked day
 * @returns A DayState describing band color, italic display name, voice line, and cathedral-lit flag.
 * @example
 * getDayState(0)  // => { intensity: 0, bandToken: "var(--hm-0)", name: "rest day", ... }
 * getDayState(22) // => { intensity: 4, bandToken: "var(--hm-4)", name: "cathedral lit", isCathedralLit: true, ... }
 */
function getDayState(dayCount: number): DayState {
  const intensity = getIntensityFromCount(dayCount)
  return match(intensity)
    .with(0, () => ({
      intensity: 0 as const,
      bandToken: 'var(--hm-0)',
      name: 'rest day',
      voice: 'rest days are days too. the cathedral keeps the light on.',
      isCathedralLit: false,
    }))
    .with(1, () => ({
      intensity: 1 as const,
      bandToken: 'var(--hm-1)',
      name: 'started',
      voice: 'a couple things landed. that counts.',
      isCathedralLit: false,
    }))
    .with(2, () => ({
      intensity: 2 as const,
      bandToken: 'var(--hm-2)',
      name: 'good day',
      voice: 'a productive rhythm — solid showing.',
      isCathedralLit: false,
    }))
    .with(3, () => ({
      intensity: 3 as const,
      bandToken: 'var(--hm-3)',
      name: 'full day',
      voice: 'the day kept its rhythm — quietly full.',
      isCathedralLit: false,
    }))
    .with(4, () => ({
      intensity: 4 as const,
      bandToken: 'var(--hm-4)',
      name: 'cathedral lit',
      voice: "the day held everything. that's not a fluke.",
      isCathedralLit: true,
    }))
    .exhaustive()
}

/**
 * Formats a YYYY-MM-DD date string to a long-form readable label.
 * @param isoDate - YYYY-MM-DD date string
 * @returns Long-form date like "May 10, 2026"
 * @example
 * formatDate("2026-05-10") // => "May 10, 2026"
 */
function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`)
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Formats a Date into a 24-hour HH:MM string for completion timestamps.
 * @param when - Timestamp the task was marked done
 * @returns 24-hour clock string like "18:47"
 * @example
 * formatTime(new Date("2026-05-10T18:47:00")) // => "18:47"
 */
function formatTime(when: Date): string {
  return when.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Returns today's calendar date in YYYY-MM-DD using UTC, matching the
 * heatmap aggregation bucketing in getDayDetail / getHeatmap.
 * @returns YYYY-MM-DD string
 * @example
 * getTodayDateString() // => "2026-05-11"
 */
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]!
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
export function DayDetailDialog({ date, onOpenChange }: DayDetailDialogProps) {
  const isClerkQueryReady = useClerkQueryReady()
  const { data, isLoading } = useQuery({
    ...orpc.completed.dayDetail.queryOptions({
      input: { date: date ?? '1970-01-01' },
    }),
    enabled: isClerkQueryReady && date !== null,
  })

  const isOpen = date !== null
  const dayCount = data?.count ?? 0
  const state = getDayState(dayCount)
  const isToday = date !== null && date === getTodayDateString()

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
              </div>
              <DialogDescription className="pt-1 font-serif text-sm italic text-muted-foreground">
                {state.voice}
              </DialogDescription>
            </DialogHeader>

            {isLoading ? (
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
                      {formatTime(task.completedAt)}
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
                still going · {formatTime(new Date())}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { memo, useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import type { HeatmapDay } from '@/hooks/useHeatmapData'
import {
  aggregateYearInReview,
  parseForceDate,
  shouldAutoOpenYir,
} from '@/lib/aggregate-year-in-review'
import { getColorDotClass } from '@/lib/category-colors'
import { log } from '@/lib/logger'
import { cn } from '@/lib/utils'

/**
 * localStorage key *prefix* recording the year for which we have already
 * auto-opened the Year-in-Review modal. The full key is
 * `${STORAGE_KEY_PREFIX}${clerkUserId}`. Once a user dismisses the modal
 * in any given year, the auto-open trigger stays suppressed until next
 * January — they can still re-open it manually if we surface a button
 * (out of PR-C scope).
 *
 * Per-user namespacing mirrors the streak-notification key so two
 * accounts sharing one browser do not suppress each other's modal.
 */
const STORAGE_KEY_PREFIX = 'corelive.yir-shown-year.'

interface YearInReviewModalProps {
  /** Heatmap data from `useHeatmapData()`. */
  dataByDate: Map<string, HeatmapDay>
  /** Loading sentinel; the modal stays closed while data is hydrating. */
  isLoading?: boolean
  /** Tanstack-Query persister rehydration sentinel; same gate the streak hook uses. */
  isRestoring?: boolean
}

/**
 * Reads the auto-open dedupe value from localStorage. Returns `0` when
 * the key is missing, malformed, or fails the integer check — failing
 * open is preferable to silently suppressing a real milestone.
 *
 * @param storageKey - Fully namespaced localStorage key
 * @returns
 * - The stored year as a 4-digit integer, or `0` on miss / corruption
 * @example
 * readStoredYear('corelive.yir-shown-year.user_xyz') // => 2025
 */
function readStoredYear(storageKey: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return 0
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return 0
    // Defend against tampered or stale-schema values — only accept a
    // plausible 4-digit calendar year (matches what we write).
    if (parsed < 1970 || parsed > 9999) return 0
    return parsed
  } catch {
    return 0
  }
}

/**
 * Persists the auto-open dedupe value. Swallows storage errors so the
 * modal render path keeps working in restricted-storage environments.
 *
 * @param storageKey - Fully namespaced localStorage key
 * @param year - 4-digit calendar year just shown
 * @example
 * writeStoredYear('corelive.yir-shown-year.user_xyz', 2026)
 */
function writeStoredYear(storageKey: string, year: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, String(year))
  } catch (error) {
    log.warn('Failed to persist YIR year', error)
  }
}

/**
 * Year-in-Review modal mounted on the home route. Auto-opens once per
 * calendar year for eligible users when "today" is in December.
 *
 * The `?force=YYYY-MM-DD` URL flag bypasses the December check so QA can
 * snapshot the modal mid-May — see {@link parseForceDate}. The flag is
 * intentionally NOT documented in the UI; it stays a debug affordance.
 *
 * Per-user dedupe via `corelive.yir-shown-year.${clerkUserId}` so two
 * accounts sharing one device/browser don't suppress each other's modal.
 *
 * Voice (DESIGN.md "Warm Cathedral"): "a year of showing up" — warm,
 * never KPI. Lists totals factually with the "shown up N days" framing
 * the rest of the app uses. No "you crushed it" / "all-time high" /
 * percentile comparisons.
 *
 * @example
 * <YearInReviewModal dataByDate={heatmapByDate} isLoading={heatmapLoading} />
 */
export const YearInReviewModal = memo(function YearInReviewModal({
  dataByDate,
  isLoading,
  isRestoring,
}: YearInReviewModalProps) {
  const { user } = useUser()
  const userId = user?.id
  const searchParams = useSearchParams()
  const forceParam = searchParams.get('force')
  // Memoize by the raw URL string — `parseForceDate` returns a fresh `Date`
  // on every call, so without `useMemo` the effect's `forcedToday` dep
  // changes identity each render. That made `?force=YYYY-MM-DD` re-open the
  // modal immediately after the user clicked Close (a re-render produced a
  // new Date → effect re-fired → setOpen(true)).
  const forcedToday = useMemo(() => parseForceDate(forceParam), [forceParam])

  const [open, setOpen] = useState(false)
  // Dedupe force-mode opens by `forceParam` value. Without this, every
  // `dataByDate` refetch (TanStack Query background revalidation) or
  // persister rehydration re-runs the effect with the same truthy
  // `forcedToday` and calls `setOpen(true)` again — so the modal pops
  // back open immediately after the QA user clicks Close. The dedupe
  // key is intentionally the raw URL param string, not `forcedToday`'s
  // Date identity, so changing the URL to a new `?force=` value DOES
  // re-open (which is the desired QA flow).
  const lastShownForceParam = useRef<string | null>(null)

  // Auto-open evaluation:
  // 1. Wait for the heatmap data + persister rehydration before reading.
  //    A stale persisted snapshot must not auto-fire a modal for a year
  //    the user has actually already dismissed.
  // 2. Require a Clerk userId for per-account dedupe. When signed out,
  //    skip silently — the home route only renders for signed-in users
  //    so this is a defensive guard, not a happy path.
  // 3. `?force=YYYY-MM-DD` flag bypasses the December calendar gate.
  //    The dedupe key is also bypassed so QA can re-open repeatedly.
  // 4. Otherwise apply the real-clock + activity-days check.
  //
  // The eslint-disable below is intentional: the effect's job is to read
  // and write the localStorage dedupe key — that's an external store
  // side effect, not "adjusting state from a prop change". The lint
  // heuristic mis-fires here.

  useCycleEffect(() => {
    if (isLoading) return
    if (isRestoring) return
    if (dataByDate.size === 0 && !forcedToday) return
    if (!userId) return

    const todayAnchor = forcedToday ?? new Date()
    const summary = aggregateYearInReview(dataByDate, todayAnchor)

    if (forcedToday) {
      // QA override: open unconditionally; do NOT write the dedupe key
      // so the next normal December auto-open still happens. The ref
      // gates the open so a `dataByDate` refetch / persister rehydrate
      // doesn't re-fire `setOpen(true)` after the user closed it.
      if (lastShownForceParam.current === forceParam) return
      lastShownForceParam.current = forceParam
      setOpen(true)
      return
    }

    if (!shouldAutoOpenYir(todayAnchor, summary)) return

    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`
    const storedYear = readStoredYear(storageKey)
    if (storedYear >= summary.year) return // already shown this year

    setOpen(true)
    writeStoredYear(storageKey, summary.year)
  }, [dataByDate, isLoading, isRestoring, userId, forcedToday, forceParam])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  if (!open) return null

  // Recompute the summary at render time — `useEffect` decided to open;
  // here we just need the values to display. Recomputing is cheap (single
  // Map walk) and avoids carrying state in two places.
  const summary = aggregateYearInReview(dataByDate, forcedToday ?? new Date())

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            A year of showing up.
          </DialogTitle>
          <DialogDescription className="font-serif italic text-muted-foreground">
            this is yours now — {summary.year} in quiet review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat
              label="completed"
              value={summary.totalCompleted}
              isLoading={isLoading}
            />
            <Stat
              label="days shown up"
              value={summary.activeDays}
              isLoading={isLoading}
            />
            <Stat
              label="longest streak"
              value={summary.longestStreak}
              isLoading={isLoading}
            />
          </div>

          {summary.topCategories.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                where the year went
              </p>
              <ul className="space-y-1.5">
                {summary.topCategories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block size-2 rounded-full',
                          getColorDotClass(category.color),
                        )}
                      />
                      <span className="text-foreground">{category.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {category.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="font-serif text-sm italic text-muted-foreground">
            the cathedral remembers. thank you for keeping the light on.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="font-serif italic"
          >
            close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

/**
 * Single stat tile inside the modal. Geist Mono tabular numbers + serif
 * caption so the number reads steady and the label reads warm.
 *
 * @example
 * <Stat label="completed" value={412} isLoading={false} />
 */
const Stat = memo(function Stat({
  label,
  value,
  isLoading,
}: {
  label: string
  value: number
  isLoading?: boolean
}) {
  return (
    <div className="space-y-1">
      <p
        aria-label={isLoading ? `Loading ${label}` : `${value} ${label}`}
        className={cn(
          'font-mono text-3xl font-medium tabular-nums text-foreground',
          isLoading && 'opacity-40',
        )}
      >
        {isLoading ? '—' : value}
      </p>
      <p className="font-serif text-xs italic text-muted-foreground">{label}</p>
    </div>
  )
})

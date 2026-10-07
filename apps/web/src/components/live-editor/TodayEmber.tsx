'use client'

import { useState } from 'react'

import type { TodayKeepsCount } from '@/hooks/useTodayKeeps'
import { HEATMAP_LEVEL_TOKENS } from '@/lib/heatmap-intensity'
import { cn } from '@/lib/utils'

/** Unlit cell — the year heatmap's rest-day token, so the ember matches every theme. */
const UNLIT_CELL_TOKEN = HEATMAP_LEVEL_TOKENS[0]

/**
 * Lit cell — the year heatmap's brightest token. The 1–3 ramp is skipped on
 * purpose: the ember is a lamp, not a grade, and the dark themes' `--hm-1` is
 * nearly invisible (design review DR6).
 */
const LIT_CELL_TOKEN = HEATMAP_LEVEL_TOKENS[4]

type TodayEmberProps = {
  /** Today's count from {@link useTodayKeeps}: `undefined` resolving, `null` unreachable. */
  count: TodayKeepsCount
  /** Electron panel variant: 16px cell, headline only, no sub-line. */
  compact?: boolean
}

type EmberCopy = {
  headline: React.ReactNode
  subline: string | null
  lit: boolean
}

/**
 * Picks the ember's words for a count — every variant the design review approved, plus the resolving word shown before the source can answer. Called on every render of {@link TodayEmber}.
 * @param count - Today's count, `undefined` while resolving, `null` when unreachable.
 * @returns
 * - resolving: "Today", unlit, no sub-line
 * - unreachable: "Can't reach your keeps right now", unlit, no sub-line
 * - 0: "Nothing kept yet today" + "Your day starts here.", unlit
 * - 1 / N: "1 thing kept today" / "N things kept today" + the gathering line, lit
 * @example
 * resolveEmberCopy(0) // => { headline: 'Nothing kept yet today', subline: 'Your day starts here.', lit: false }
 */
function resolveEmberCopy(count: TodayKeepsCount): EmberCopy {
  if (count === undefined) {
    return { headline: 'Today', subline: null, lit: false }
  }
  if (count === null) {
    return {
      headline: "Can't reach your keeps right now",
      subline: null,
      lit: false,
    }
  }
  if (count === 0) {
    return {
      headline: 'Nothing kept yet today',
      subline: 'Your day starts here.',
      lit: false,
    }
  }
  return {
    headline: (
      <>
        <span className="font-mono tabular-nums">{count}</span>{' '}
        {count === 1 ? 'thing' : 'things'} kept today
      </>
    ),
    subline: "Finished lines gather here. They don't disappear.",
    lit: true,
  }
}

/**
 * Shows today's keeps for {@link LiveEditorTodayEmber}, sweeping on increments and snapping back on Undo.
 * @param props - {@link TodayEmberProps}
 * @returns A polite live region: the cell (decorative) and the headline / sub-line.
 * @example
 * <TodayEmber count={3} />
 * <TodayEmber count={todayKeeps} compact />
 */
export function TodayEmber({ count, compact = false }: TodayEmberProps) {
  // Adjusting state on a prop change (React docs pattern): an increment re-keys
  // the sweep layer so its animation restarts; a decrement changes nothing, so
  // the cell simply snaps to its new state.
  const [{ lastCount, sweepKey, wasLitBeforeSweep }, setSweep] = useState({
    lastCount: count,
    sweepKey: 0,
    wasLitBeforeSweep: false,
  })
  if (count !== lastCount) {
    const isIncrement =
      typeof count === 'number' &&
      typeof lastCount === 'number' &&
      count > lastCount
    // Keep a settled layer beneath repeat sweeps so an already-lit cell never flashes dark.
    setSweep({
      lastCount: count,
      sweepKey: isIncrement ? sweepKey + 1 : sweepKey,
      wasLitBeforeSweep: isIncrement ? lastCount >= 1 : wasLitBeforeSweep,
    })
  }

  const copy = resolveEmberCopy(count)
  const hasSweptThisSession = sweepKey > 0
  // Lit with no sweep (mounted already lit, or lit before this increment):
  // a plain lit layer; the sweep layer, when present, animates on top of it.
  const showSettledLitLayer =
    copy.lit && (!hasSweptThisSession || wasLitBeforeSweep)
  const showSweepLayer = copy.lit && hasSweptThisSession

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={count === undefined ? true : undefined}
      className={cn(
        'flex gap-3 font-sans',
        compact ? 'items-center py-2' : 'items-start py-1',
      )}
    >
      <span
        aria-hidden="true"
        data-lit={copy.lit ? 'true' : 'false'}
        className={cn(
          // The unlit token sits ~1.05:1 against the page in every theme, so
          // without an edge there is no cell to light — just empty space.
          'relative shrink-0 overflow-hidden border border-border',
          compact ? 'size-4 rounded-sm' : 'size-6 rounded-md',
        )}
        style={{ backgroundColor: UNLIT_CELL_TOKEN }}
      >
        {showSettledLitLayer && (
          <span
            data-ember-lit
            className="absolute inset-0"
            style={{ backgroundColor: LIT_CELL_TOKEN }}
          />
        )}
        {showSweepLayer && (
          <span
            key={sweepKey}
            data-ember-sweep={sweepKey}
            className="motion-safe:animate-ember-sweep absolute inset-0"
            style={{ backgroundColor: LIT_CELL_TOKEN }}
          />
        )}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            'font-semibold text-foreground',
            compact ? 'text-xs' : 'text-base',
          )}
        >
          {copy.headline}
        </p>
        {!compact && copy.subline !== null && (
          <p className="text-sm text-muted-foreground">{copy.subline}</p>
        )}
      </div>
    </div>
  )
}

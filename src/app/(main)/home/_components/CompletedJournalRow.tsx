import { CheckCircle2 } from 'lucide-react'
import React from 'react'

import { getColorDotClass } from '@/lib/category-colors'
import { formatClockTime } from '@/lib/formatClockTime'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectShowCompletedTaskStrikethrough } from '@/lib/redux/slices/settingsSlice'
import { cn } from '@/lib/utils'
import type { DayDetailTask } from '@/server/schemas/completed'

interface CompletedJournalRowProps {
  /** One merged journal entry (`Todo`-sourced or `Completed`-table-sourced). */
  entry: DayDetailTask
}

/**
 * One row in the permanent completion journal — renders a finished task as a
 * win (check indicator + title + category dot + completion time), mirroring the
 * day-detail dialog row so the two completed surfaces read identically.
 *
 * Every win is a permanent record now that the Todo write paths are retired —
 * legacy `todo`-source rows and LiveEditor `completed`-source rows both render
 * the same static filled check. Rendered by {@link CompletedTodos} for every
 * entry of `completed.journal`.
 *
 * @param entry - The merged journal entry to display.
 * @returns A single bordered journal row.
 * @example
 * <CompletedJournalRow entry={entry} />
 */
export const CompletedJournalRow = function CompletedJournalRow({
  entry,
}: CompletedJournalRowProps) {
  const showCompletedTaskStrikethrough = useAppSelector(
    selectShowCompletedTaskStrikethrough,
  )

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      {/* Permanent record: a static, display-only check for every source. */}
      <CheckCircle2
        className="size-5 shrink-0 text-primary"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {/* Keep the quieter completed tone while letting users remove the line decoration. */}
        <div
          className={cn(
            'block break-words text-muted-foreground',
            showCompletedTaskStrikethrough && 'line-through',
          )}
        >
          {entry.title}
        </div>
        {entry.category && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  getColorDotClass(entry.category.color),
                )}
              />

              {entry.category.name}
            </span>
          </div>
        )}
      </div>
      {/* Completion time, right-aligned — mirrors the day-detail dialog row. */}
      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
        {formatClockTime(entry.completedAt)}
      </span>
    </div>
  )
}

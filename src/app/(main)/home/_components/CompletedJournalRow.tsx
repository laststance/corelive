import { CheckCircle2 } from 'lucide-react'
import React from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { getColorDotClass } from '@/lib/category-colors'
import { formatClockTime } from '@/lib/formatClockTime'
import { cn } from '@/lib/utils'
import type { DayDetailTask } from '@/server/schemas/completed'

interface CompletedJournalRowProps {
  /** One merged journal entry (`Todo`-sourced or `Completed`-table-sourced). */
  entry: DayDetailTask
  /**
   * Uncomplete handler, wired only for `todo`-source rows (the correction path
   * that survives retiring per-item delete). `completed`-source rows are an
   * immutable import/braindump record, so they render a static check instead.
   */
  onUncomplete?: (id: string) => void
}

/**
 * One row in the permanent completion journal — renders a finished task as a
 * win (check indicator + title + category dot + completion time), mirroring the
 * day-detail dialog row so the two completed surfaces read identically.
 *
 * Source decides the left affordance: a `todo`-source win keeps an interactive
 * checkbox so an accidental completion can be reversed (un-checking re-opens the
 * task); a `completed`-source win (paste-import / braindump) is a permanent
 * record and shows a static filled check. Rendered by {@link CompletedTodos} for
 * every entry of `completed.journal`.
 *
 * @param entry - The merged journal entry to display.
 * @param onUncomplete - Called with the stringified id when a `todo`-source row is un-checked.
 * @returns A single bordered journal row.
 * @example
 * <CompletedJournalRow entry={entry} onUncomplete={toggleComplete} />
 */
export const CompletedJournalRow = function CompletedJournalRow({
  entry,
  onUncomplete,
}: CompletedJournalRowProps) {
  // Un-checking a todo-source win reverses the completion (true → false). It is
  // intentionally quiet (no completion cue) — only finishing a task celebrates.
  const handleUncomplete = () => {
    onUncomplete?.(String(entry.id))
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      {entry.source === 'todo' ? (
        // Reversible win: the checked box un-completes on toggle. Expand the
        // 16px box to a ≥24px hit target (WCAG 2.5.8 AA) via `tap-target-24`.
        <Checkbox
          checked
          onCheckedChange={handleUncomplete}
          id={`journal-todo-${entry.id}`}
          aria-label={entry.title}
          className="tap-target-24"
        />
      ) : (
        // Permanent import/braindump record: a static, display-only check.
        <CheckCircle2
          className="size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        {/* Completed wins read as done — line-through muted, matching the app's
             established completed-task styling (TodoItem) this list replaces. */}
        <div className="block break-words text-muted-foreground line-through">
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

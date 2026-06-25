'use client'

import { useDroppable } from '@dnd-kit/react'
import { Archive } from 'lucide-react'

/**
 * dnd-kit droppable id for the 居残りモード "tuck one finished task away" zone.
 * Shared between this drop target and TodoList's `handleDragEnd` branch so a
 * sortable row dropped here is archived (delete→Completed) instead of reordered.
 */
export const COMPLETED_DROPZONE_ID = 'completed-dropzone'

/**
 * Retain-mode-only landing strip (issue #113) that lets a single finished
 * (strikethrough) row be dragged out of the active list into the Completed
 * journal — the per-row button is the keyboard path, this is the pointer path.
 * It exists ONLY as a drop target: no task list, no count (the heatmap stays the
 * visible payoff; a "Completed: N" tile would read as a forbidden KPI per
 * DESIGN.md). Rendered inside TodoList's DragDropProvider; the drop is handled
 * there. Warms with a primary tint (never success-green) while a row hovers it.
 * @param isTogglePending - True while ANY completion toggle is still saving. In
 *   that window TodoList's handleDragEnd no-ops a drop here (the row isn't durably
 *   completed yet, so archiving would hard-delete the win). The zone dims and
 *   drops its active tint to mirror that guard — the same disabled feedback the
 *   per-row Tuck button shows — so the block is visible, never a silent failure.
 * @returns A dashed "Completed" drop zone for one-at-a-time tucking.
 * @example
 * <CompletedDropZone isTogglePending={isAnyTogglePending} />
 */
export const CompletedDropZone = function CompletedDropZone({
  isTogglePending = false,
}: {
  isTogglePending?: boolean
}) {
  const { ref, isDropTarget } = useDroppable({ id: COMPLETED_DROPZONE_ID })

  // A drop is a no-op while a toggle is in flight, so suppress the "active
  // target" tint even if dnd-kit reports a hover — promising a landing we'd
  // refuse would be the silent failure path the per-row guard avoids.
  const showActiveTint = isDropTarget && !isTogglePending

  return (
    <div
      ref={ref}
      data-testid="completed-dropzone"
      // Communicate the temporarily-inert state to assistive tech (absent, not
      // ="false", in the normal case so it stays quiet).
      aria-disabled={isTogglePending || undefined}
      // Quiet companion, not a coach: a calm place to tuck a finished thing. The
      // warm tint is primary (amber), never success-green — filing a win is not
      // an error and not a second celebration (DESIGN.md motion/voice notes).
      className={`mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm transition-colors ${
        showActiveTint
          ? 'bg-primary/10 border-primary text-foreground'
          : 'border-muted-foreground/30 text-muted-foreground'
      } ${isTogglePending ? 'opacity-50' : ''}`}
    >
      <Archive className="h-4 w-4" aria-hidden="true" />
      <span>Completed</span>
    </div>
  )
}

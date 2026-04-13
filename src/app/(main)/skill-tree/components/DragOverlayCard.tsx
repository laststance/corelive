'use client'

/**
 * A non-interactive floating preview of a task card, rendered inside
 * `<DragOverlay>` while a drag is in progress.
 *
 * @param props.text - The display text of the task being dragged.
 * @returns A visually distinct, slightly rotated card with no pointer events.
 *
 * @example
 * import { DragOverlay } from '@dnd-kit/core'
 *
 * <DragOverlay>
 *   {activeTodo ? <DragOverlayCard text={activeTodo.text} /> : null}
 * </DragOverlay>
 */
export function DragOverlayCard({ text }: { text: string }) {
  return (
    <div
      // eslint-disable-next-line dslint/token-only -- skill-tree card dimensions not in design tokens
      className="pointer-events-none min-w-[200px] max-w-[260px] rounded-lg border border-[var(--st-gold)] bg-[var(--st-surface)] p-3 text-left text-sm text-[var(--st-cream)] shadow-2xl"
      style={{ transform: 'rotate(-2deg)' }}
    >
      {text}
    </div>
  )
}

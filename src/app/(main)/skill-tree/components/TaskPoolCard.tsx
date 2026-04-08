'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

/**
 * A draggable card representing a completed Todo in the pool drawer.
 * Uses `useDraggable` for DnD and renders as a button for a11y.
 *
 * @param props.id - The Prisma Todo ID. Prefixed with `todo-` internally to
 *   avoid collisions with SkillNode droppable IDs in the same DndContext.
 * @param props.text - The display text of the todo item.
 * @returns A draggable button element that can be dropped onto a SkillNodeCircle.
 *
 * @example
 * <DndContext>
 *   <TaskPoolCard id={42} text="Fix login bug" />
 * </DndContext>
 */
export interface TaskPoolCardProps {
  id: number
  text: string
}

export function TaskPoolCard({ id, text }: TaskPoolCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    // @dnd-kit/core maintains a single ID registry across the whole DndContext for both
    // draggables and droppables. Both Todo.id (here) and SkillNode.id (SkillNodeCircle) are
    // Prisma autoincrement ints, so without a prefix a Todo id=3 would collide with a
    // SkillNode id=3. SkillNodeCircle uses `node-${id}` — mirror that with `todo-${id}`.
    // Task 18 will parse these prefixes off active.id / over.id to extract Prisma IDs.
    useDraggable({ id: `todo-${id}` })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      // eslint-disable-next-line dslint/token-only -- skill-tree card dimensions not in design tokens
      className="min-w-[200px] max-w-[260px] rounded-lg border border-[var(--st-border-rune)] bg-[var(--st-surface)] p-3 text-left text-sm text-[var(--st-cream)] shadow-md transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--st-arcane)]"
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`Completed task: ${text}. Press space to pick up.`}
    >
      {text}
    </button>
  )
}

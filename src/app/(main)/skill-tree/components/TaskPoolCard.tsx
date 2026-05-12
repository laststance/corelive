'use client'

import { useDraggable } from '@dnd-kit/react'
import { memo } from 'react'

import type { TodoId, TodoText } from '../lib/domain-types'

/**
 * A draggable card representing a completed Todo in the pool drawer.
 * Uses `useDraggable` for DnD and renders as a button for a11y.
 *
 * @param props.id - The Prisma Todo ID. Prefixed with `todo-` internally to
 *   avoid collisions with SkillNode droppable IDs in the same DragDropProvider.
 * @param props.text - The display text of the todo item.
 * @returns A draggable button element that can be dropped onto a SkillNodeCircle.
 *
 * @example
 * <DragDropProvider>
 *   <TaskPoolCard id={42} text="Fix login bug" />
 * </DragDropProvider>
 */
export interface TaskPoolCardProps {
  id: TodoId
  text: TodoText
}

export const TaskPoolCard = memo(function TaskPoolCard({
  id,
  text,
}: TaskPoolCardProps) {
  // dnd-kit maintains one ID registry across draggables and droppables.
  // Prefix Todo ids so they cannot collide with SkillNode ids.
  const { ref, isDragging } = useDraggable({ id: `todo-${id}` })

  const style = {
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      // eslint-disable-next-line dslint/token-only -- skill-tree card dimensions not in design tokens
      className="min-w-[200px] max-w-[260px] rounded-lg border border-[var(--st-border-rune)] bg-[var(--st-surface)] p-3 text-left text-sm text-[var(--st-cream)] shadow-md transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--st-arcane)]"
      style={style}
      aria-label={`Completed task: ${text}. Press space to pick up.`}
    >
      {text}
    </button>
  )
})

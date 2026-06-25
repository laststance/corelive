'use client'

import { useSortable } from '@dnd-kit/react/sortable'
import React from 'react'

import { RETROACTIVE_POPULATE_FADE_CLASS } from './retroactivePopulateFade'
import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

interface SortableTodoItemProps {
  todo: Todo
  index: number
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  /** D8: play the 居残りモード retroactive-populate fade-in on this row. */
  isRetroactivelyPopulated?: boolean
  /**
   * #113: true while a completion toggle is in flight — forwarded to TodoItem so
   * its "Tuck into Completed" button stays disabled until the check commits
   * (tucking too early would hard-delete the task instead of archiving it).
   */
  isTogglePending?: boolean
}

/**
 * Wrapper component that makes TodoItem draggable using dnd-kit.
 * Provides drag handle functionality for reordering todos.
 * @param todo - Todo item to render and register as sortable.
 * @param index - Current index within the pending todo list.
 * @param onToggleComplete - Callback fired when completion changes.
 * @param onDelete - Callback fired when the item is deleted.
 * @param onUpdateNotes - Optional callback fired when notes change.
 * @param isRetroactivelyPopulated - D8: fade this row in (the 居残りモード toggle
 *   just surfaced it). Omitted/false for rows already on screen, so an in-place
 *   check stays quiet (D7).
 * @param isTogglePending - #113: a completion toggle is in flight; forwarded to
 *   TodoItem to disable its "Tuck into Completed" button until the check commits.
 * @returns A sortable wrapper around the TodoItem row.
 * @example
 * <SortableTodoItem todo={todo} index={0} onToggleComplete={toggle} onDelete={remove} />
 */
export const SortableTodoItem = function SortableTodoItem({
  todo,
  index,
  onToggleComplete,
  onDelete,
  onUpdateNotes,
  isRetroactivelyPopulated,
  isTogglePending,
}: SortableTodoItemProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: todo.id, index })

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div
      ref={ref}
      style={style}
      className={
        isRetroactivelyPopulated ? RETROACTIVE_POPULATE_FADE_CLASS : undefined
      }
    >
      <TodoItem
        todo={todo}
        onToggleComplete={onToggleComplete}
        onDelete={onDelete}
        onUpdateNotes={onUpdateNotes}
        dragHandleRef={handleRef}
        isDragging={isDragging}
        isTogglePending={isTogglePending}
      />
    </div>
  )
}

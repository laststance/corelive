'use client'

import { useSortable } from '@dnd-kit/react/sortable'
import React from 'react'

import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

interface SortableTodoItemProps {
  todo: Todo
  index: number
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
}

/**
 * Wrapper component that makes TodoItem draggable using dnd-kit.
 * Provides drag handle functionality for reordering todos.
 * @param todo - Todo item to render and register as sortable.
 * @param index - Current index within the pending todo list.
 * @param onToggleComplete - Callback fired when completion changes.
 * @param onDelete - Callback fired when the item is deleted.
 * @param onUpdateNotes - Optional callback fired when notes change.
 * @returns A sortable wrapper around the TodoItem row.
 * @example
 * <SortableTodoItem todo={todo} index={0} onToggleComplete={toggle} onDelete={remove} />
 */
export const SortableTodoItem = React.memo(function SortableTodoItem({
  todo,
  index,
  onToggleComplete,
  onDelete,
  onUpdateNotes,
}: SortableTodoItemProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: todo.id, index })

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={ref} style={style}>
      <TodoItem
        todo={todo}
        onToggleComplete={onToggleComplete}
        onDelete={onDelete}
        onUpdateNotes={onUpdateNotes}
        dragHandleRef={handleRef}
        isDragging={isDragging}
      />
    </div>
  )
})

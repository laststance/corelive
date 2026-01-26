'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import React from 'react'

import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

interface SortableTodoItemProps {
  todo: Todo
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
}

/**
 * Wrapper component that makes TodoItem draggable using dnd-kit.
 * Provides drag handle functionality for reordering todos.
 */
export function SortableTodoItem({
  todo,
  onToggleComplete,
  onDelete,
  onUpdateNotes,
}: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TodoItem
        todo={todo}
        onToggleComplete={onToggleComplete}
        onDelete={onDelete}
        onUpdateNotes={onUpdateNotes}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  )
}

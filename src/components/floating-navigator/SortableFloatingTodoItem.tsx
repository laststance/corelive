'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import React from 'react'

import type { FloatingTodo } from './FloatingNavigator'

/**
 * Props passed to children for drag handle functionality.
 */
interface DragHandleProps {
  [key: string]: unknown
}

interface SortableFloatingTodoItemProps {
  todo: FloatingTodo
  children: (props: {
    dragHandleProps: DragHandleProps
    isDragging: boolean
  }) => React.ReactNode
}

/**
 * Wrapper component that makes floating navigator todo items draggable using dnd-kit.
 * Uses render props pattern to pass drag handle props to children.
 * @param todo - The todo item to make sortable.
 * @param children - Render function receiving dragHandleProps and isDragging state.
 * @returns A draggable wrapper div with transform/transition styles.
 * @example
 * <SortableFloatingTodoItem todo={todo}>
 *   {({ dragHandleProps, isDragging }) => (
 *     <TodoRow dragHandleProps={dragHandleProps} isDragging={isDragging} />
 *   )}
 * </SortableFloatingTodoItem>
 */
export function SortableFloatingTodoItem({
  todo,
  children,
}: SortableFloatingTodoItemProps) {
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
      {children({
        dragHandleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </div>
  )
}

'use client'

import { useSortable } from '@dnd-kit/react/sortable'
import React from 'react'

import type { FloatingTodo } from './FloatingNavigator'

/**
 * Ref passed to children for drag handle functionality.
 */
type DragHandleRef = React.Ref<HTMLButtonElement>

interface SortableFloatingTodoItemProps {
  todo: FloatingTodo
  index: number
  children: (props: {
    dragHandleRef: DragHandleRef
    isDragging: boolean
  }) => React.ReactNode
}

/**
 * Wrapper component that makes floating navigator todo items draggable using dnd-kit.
 * Uses render props pattern to pass drag handle refs to children.
 * @param todo - The todo item to make sortable.
 * @param index - Current index within the pending floating todo list.
 * @param children - Render function receiving dragHandleRef and isDragging state.
 * @returns A draggable wrapper div with drag-state opacity and z-index styles.
 * @example
 * <SortableFloatingTodoItem todo={todo} index={0}>
 *   {({ dragHandleRef, isDragging }) => (
 *     <TodoRow dragHandleRef={dragHandleRef} isDragging={isDragging} />
 *   )}
 * </SortableFloatingTodoItem>
 */
export const SortableFloatingTodoItem = function SortableFloatingTodoItem({
  todo,
  index,
  children,
}: SortableFloatingTodoItemProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: todo.id, index })

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={ref} style={style}>
      {children({
        dragHandleRef: handleRef,
        isDragging,
      })}
    </div>
  )
}

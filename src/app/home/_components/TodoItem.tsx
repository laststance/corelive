import {
  Trash2,
  StickyNote,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react'
import React, { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { getColorDotClass } from '@/lib/category-colors'

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
  notes?: string | null
  categoryId?: number | null
  categoryName?: string | null
  categoryColor?: string | null
}

/**
 * Props passed from SortableTodoItem for drag handle functionality.
 */
interface DragHandleProps {
  [key: string]: unknown
}

interface TodoItemProps {
  todo: Todo
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  /** Props from useSortable for drag handle */
  dragHandleProps?: DragHandleProps
  /** Whether item is currently being dragged */
  isDragging?: boolean
}

export function TodoItem({
  todo,
  onToggleComplete,
  onDelete,
  onUpdateNotes,
  dragHandleProps,
  isDragging,
}: TodoItemProps) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [notes, setNotes] = useState(todo.notes ?? '')

  const handleNotesChange = (value: string) => {
    setNotes(value)
    if (onUpdateNotes) {
      onUpdateNotes(todo.id, value)
    }
  }

  return (
    <div
      className={`rounded-lg border bg-card transition-shadow hover:shadow-sm ${
        isDragging ? 'ring-primary/20 shadow-lg ring-2' : ''
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        {dragHandleProps && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...dragHandleProps}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() => onToggleComplete(todo.id)}
          id={`todo-${todo.id}`}
          aria-label={todo.text}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`block ${
              todo.completed
                ? 'text-muted-foreground line-through'
                : 'text-foreground'
            }`}
          >
            {todo.text}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{todo.createdAt.toLocaleDateString('en-US')}</span>
            {todo.categoryName && (
              <span className="flex items-center gap-1">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${getColorDotClass(todo.categoryColor)}`}
                />
                {todo.categoryName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={todo.completed ? 'secondary' : 'default'}>
            {todo.completed ? 'Completed' : 'Pending'}
          </Badge>
          {onUpdateNotes && (
            <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${notes ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <StickyNote className="h-4 w-4" />
                  {isNotesOpen ? (
                    <ChevronDown className="ml-1 h-3 w-3" />
                  ) : (
                    <ChevronRight className="ml-1 h-3 w-3" />
                  )}
                  <span className="sr-only">Toggle notes</span>
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(todo.id)}
            className="hover:bg-destructive/10 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>
      {onUpdateNotes && (
        <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
          <CollapsibleContent className="bg-muted/30 border-t">
            <div className="p-4">
              <Textarea
                placeholder="Add notes..."
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                className="min-h-20 resize-none"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

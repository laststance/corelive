import { Trash2, StickyNote, ChevronDown, ChevronRight } from 'lucide-react'
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

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
  notes?: string
}

interface TodoItemProps {
  todo: Todo
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
}

export function TodoItem({
  todo,
  onToggleComplete,
  onDelete,
  onUpdateNotes,
}: TodoItemProps) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [notes, setNotes] = useState(todo.notes || '')

  const handleNotesChange = (value: string) => {
    setNotes(value)
    if (onUpdateNotes) {
      onUpdateNotes(todo.id, value)
    }
  }

  return (
    <div className="bg-card rounded-lg border transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() => onToggleComplete(todo.id)}
          id={`todo-${todo.id}`}
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`todo-${todo.id}`}
            className={`block cursor-pointer ${
              todo.completed
                ? 'text-muted-foreground line-through'
                : 'text-foreground'
            }`}
          >
            {todo.text}
          </label>
          <p className="text-muted-foreground mt-1 text-xs">
            {todo.createdAt.toLocaleDateString('en-US')}
          </p>
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
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
                className="min-h-[80px] resize-none"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

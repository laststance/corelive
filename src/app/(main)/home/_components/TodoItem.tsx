import {
  Archive,
  Trash2,
  StickyNote,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react'
import React, { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { useCompletionFeedback } from '@/hooks/useCompletionFeedback'
import { getColorDotClass } from '@/lib/category-colors'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectRetainCompletedInList } from '@/lib/redux/slices/preferencesSlice'

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
 * Ref passed from SortableTodoItem for drag handle functionality.
 */
type DragHandleRef = React.Ref<HTMLButtonElement>

interface TodoItemProps {
  todo: Todo
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  /** Ref from useSortable for drag handle */
  dragHandleRef?: DragHandleRef
  /** Whether item is currently being dragged */
  isDragging?: boolean
  /**
   * #113 data-loss gate: true while ANY completion toggle for this list is still
   * in flight. "Tuck into Completed" reuses the delete→archive path, but the
   * server only archives a row that is ALREADY completed in the DB; tuck a row
   * whose check hasn't committed yet and it is HARD-DELETED instead (the win is
   * lost, no heatmap credit). So the button stays disabled until the toggle lands.
   */
  isTogglePending?: boolean
}

export const TodoItem = function TodoItem({
  todo,
  onToggleComplete,
  onDelete,
  onUpdateNotes,
  dragHandleRef,
  isDragging,
  isTogglePending = false,
}: TodoItemProps) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [notes, setNotes] = useState(todo.notes ?? '')
  const handleNotesOpenChange = (open: boolean) => {
    setIsNotesOpen(open)
  }

  const { checkboxMotionClassName, fire } = useCompletionFeedback()

  // D14: in 居残りモード the per-row trash is hidden on completed-retained rows
  // (tidy via Clear, which archives + keeps the heatmap); pending rows keep it.
  // In the non-retain Completed section the trash stays (routed through the
  // Undo-toast delete). So hide only when this row is completed AND retain is on.
  const isRetaining = useAppSelector(selectRetainCompletedInList)
  const showDeleteButton = !todo.completed || !isRetaining
  // #113: the new "Tuck into Completed" button takes the D14 slot the trash
  // vacates — the exact inverse condition, so the two are mutually exclusive.
  const showMoveToCompletedButton = todo.completed && isRetaining

  // Same-row double-fire guard: the optimistic delete unmounts this row almost
  // immediately, but this local flag also disables the button between the click
  // and that unmount (the archive helper's documented non-idempotent race).
  const [isMovingToCompleted, setIsMovingToCompleted] = useState(false)

  const handleToggleComplete = () => {
    // Fire the opt-in sound only on a real completion (false→true); the CSS
    // checkbox fill plays on the state change itself. Un-completing is quiet.
    if (!todo.completed) {
      fire()
    }
    onToggleComplete(todo.id)
  }

  const handleDelete = () => {
    onDelete(todo.id)
  }

  // #113: tuck this one finished row into Completed. Reuses onDelete — deleting a
  // completed todo archives it into the Completed journal (heatmap-safe) rather
  // than hard-deleting, so "move to Completed" IS the completed-row delete path.
  const handleMoveToCompleted = () => {
    setIsMovingToCompleted(true)
    onDelete(todo.id)
  }

  const handleNotesChange = (value: string) => {
    setNotes(value)
    if (onUpdateNotes) {
      onUpdateNotes(todo.id, value)
    }
  }

  const handleNotesTextareaChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    handleNotesChange(event.target.value)
  }

  return (
    <div
      className={`rounded-lg border bg-card transition-shadow hover:shadow-sm ${
        isDragging ? 'ring-primary/20 shadow-lg ring-2' : ''
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        {dragHandleRef && (
          <button
            ref={dragHandleRef}
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        {/* Expand the 16px checkbox to a ≥24px hit target (WCAG 2.5.8 AA) with a
             transparent ::before, without resizing the global Checkbox (D12). */}
        <Checkbox
          checked={todo.completed}
          onCheckedChange={handleToggleComplete}
          id={`todo-${todo.id}`}
          aria-label={todo.text}
          className={`${checkboxMotionClassName} tap-target-24`}
        />

        <div className="min-w-0 flex-1">
          <div
            className={`block break-words ${
              todo.completed
                ? 'text-muted-foreground line-through'
                : 'text-foreground'
            }`}
          >
            {todo.text}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span data-testid="todo-created-at">
              {todo.createdAt.toLocaleDateString('en-US')}
            </span>
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
          {onUpdateNotes && (
            <Collapsible
              open={isNotesOpen}
              onOpenChange={handleNotesOpenChange}
            >
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
          {showMoveToCompletedButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMoveToCompleted}
              // Disabled while moving (the double-fire guard) OR while the
              // completion toggle is still in flight — tucking before the check
              // commits would hard-delete the win instead of archiving it (#113).
              disabled={isMovingToCompleted || isTogglePending}
              className="text-muted-foreground hover:text-foreground"
              // Distinct accessible name: must NOT contain "Move to Completed"
              // (ImportUndoBanner owns that, substring-matched in e2e) nor start
              // with "completed task" (skill-tree e2e). Quiet-companion voice.
              aria-label={`Tuck "${todo.text}" into Completed`}
              title="Tuck into Completed"
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {showDeleteButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="hover:bg-destructive/10 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>
      </div>
      {onUpdateNotes && (
        <Collapsible open={isNotesOpen} onOpenChange={handleNotesOpenChange}>
          <CollapsibleContent className="bg-muted/30 border-t">
            <div className="p-4">
              <Textarea
                placeholder="Add notes..."
                value={notes}
                onChange={handleNotesTextareaChange}
                className="min-h-20 resize-none"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

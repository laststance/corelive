'use client'

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { XpBadge } from './XpBadge'

/** A single todo that has been assigned to a skill node. */
export interface AssignedTodo {
  /** The unique identifier of the todo. */
  id: number
  /** The display text of the todo. */
  text: string
}

/** Props for the NodePopover component. */
export interface NodePopoverProps {
  /** Whether the popover is currently visible. */
  open: boolean
  /**
   * Called when the popover wants to change its open state
   * (e.g. click-outside closes it).
   */
  onOpenChange: (open: boolean) => void
  /** The skill node to display: id, name, and current accumulated XP. */
  node: { id: number; name: string; xp: number }
  /** Todos currently assigned to this node. */
  assignedTodos: AssignedTodo[]
  /**
   * Called with the todo's id when the user clicks the × button next to a row.
   * The parent is responsible for removing the assignment optimistically.
   */
  onUnassign: (todoId: number) => void
  /** The trigger element the popover is anchored to (rendered via PopoverTrigger asChild). */
  children: ReactNode
}

/**
 * Popover anchored to a skill node, listing its assigned completed Todos.
 * Each row has a × button to unassign the todo (returns it to the pool).
 *
 * @param props - Component props.
 * @param props.open - Whether the popover is currently visible.
 * @param props.onOpenChange - Called when the popover wants to change its open state (e.g. click-outside).
 * @param props.node - The node to display: id, name, and current XP.
 * @param props.assignedTodos - Todos currently assigned to this node.
 * @param props.onUnassign - Called with the todoId when a user clicks the × next to a row.
 * @param props.children - The trigger element the popover is anchored to.
 * @returns A Radix Popover that, when open, shows node name, XpBadge, and the assigned todo list.
 *
 * @example
 * const [open, setOpen] = useState(false)
 *
 * <NodePopover
 *   open={open}
 *   onOpenChange={setOpen}
 *   node={{ id: 1, name: 'APIs', xp: 40 }}
 *   assignedTodos={[{ id: 10, text: 'Fix auth bug' }]}
 *   onUnassign={(id) => handleUnassign(id)}
 * >
 *   <button>Open node</button>
 * </NodePopover>
 */
export function NodePopover({
  open,
  onOpenChange,
  node,
  assignedTodos,
  onUnassign,
  children,
}: NodePopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 border-[var(--st-border-rune)] bg-[var(--st-bg-mid)] text-[var(--st-cream)]"
        align="center"
      >
        <div className="mb-3">
          <div className="text-sm font-medium text-[var(--st-gold)]">
            {node.name}
          </div>
          <div className="mt-1">
            <XpBadge xp={node.xp} />
          </div>
        </div>
        <div
          className="max-h-60 space-y-1 overflow-y-auto"
          role="list"
          aria-label="Assigned tasks"
        >
          {assignedTodos.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--st-muted)]">
              No tasks assigned yet
            </div>
          ) : (
            assignedTodos.map((todo) => (
              <div
                key={todo.id}
                role="listitem"
                className="flex items-center justify-between gap-2 rounded-md bg-[var(--st-surface)] px-2 py-1.5"
              >
                <span className="truncate text-xs">{todo.text}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  // Hover bg uses --st-bg-mid instead of --st-border-rune so
                  // the cream text on hover stays readable in parchment mode.
                  // New parchment border-rune (#4a3520) and cream (#3a2818)
                  // are both dark earth tones — their contrast is only 1.18:1
                  // which would make the X icon invisible on hover. bg-mid
                  // gives 9.97:1 in parchment and 8.54:1 in dark mode.
                  className="h-6 w-6 text-[var(--st-muted)] hover:bg-[var(--st-bg-mid)] hover:text-[var(--st-cream)]"
                  aria-label={`Unassign ${todo.text}`}
                  onClick={() => onUnassign(todo.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

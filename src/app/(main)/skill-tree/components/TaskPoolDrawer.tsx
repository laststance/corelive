'use client'

import { ChevronUp, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { TaskPoolCard } from './TaskPoolCard'

/**
 * Minimal Todo shape used by the drawer. Kept loose so stories can use mocks.
 */
export interface PoolTodo {
  id: number
  text: string
}

export interface TaskPoolDrawerProps {
  todos: PoolTodo[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bottom sheet containing horizontally-scrollable completed Todos.
 * When closed, shows a floating pill at the bottom of the screen.
 * When empty, shows an empty state.
 *
 * @param props.todos - Array of unassigned completed todos to display in the pool.
 * @param props.open - Whether the drawer sheet is currently open.
 * @param props.onOpenChange - Callback invoked when the open state should change.
 * @returns A Sheet component with a trigger pill and horizontally-scrollable task cards.
 *
 * @example
 * const [open, setOpen] = useState(false)
 *
 * <DndContext>
 *   <TaskPoolDrawer
 *     todos={[{ id: 1, text: 'Fix login bug' }]}
 *     open={open}
 *     onOpenChange={setOpen}
 *   />
 * </DndContext>
 */
export function TaskPoolDrawer({
  todos,
  open,
  onOpenChange,
}: TaskPoolDrawerProps) {
  const count = todos.length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {count > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <SheetTrigger asChild>
            <Button
              variant="default"
              className="hover:bg-[var(--st-surface)]/80 gap-2 rounded-full bg-[var(--st-surface)] px-5 py-6 text-[var(--st-cream)] shadow-lg"
            >
              <Package className="h-5 w-5" />
              <span className="font-medium">
                {count} unassigned task{count !== 1 ? 's' : ''}
              </span>
              <ChevronUp className="h-5 w-5" />
            </Button>
          </SheetTrigger>
        </div>
      )}
      <SheetContent
        side="bottom"
        className="border-t border-[var(--st-border-rune)] bg-[var(--st-bg-mid)] text-[var(--st-cream)]"
      >
        <SheetHeader>
          <SheetTitle className="text-[var(--st-gold)]">
            Unassigned completed tasks
          </SheetTitle>
        </SheetHeader>
        <div
          className="mt-4 flex gap-3 overflow-x-auto pb-4"
          role="list"
          aria-label="Completed task pool"
        >
          {count === 0 ? (
            <div className="w-full py-8 text-center text-[var(--st-muted)]">
              All tasks allocated — nice work
            </div>
          ) : (
            todos.map((todo) => (
              <div key={todo.id} role="listitem">
                <TaskPoolCard id={todo.id} text={todo.text} />
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

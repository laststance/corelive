'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import React, { useState, useRef, lazy, Suspense, useCallback } from 'react'

import { useFloatingNavigatorMenuActions } from '@/components/floating-navigator/useFloatingNavigatorMenuActions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isFloatingNavigatorEnvironment } from '@/electron/utils/electron-client'
import { COLOR_DOT_CLASSES } from '@/lib/category-colors'
import { log } from '@/lib/logger'
import { isEnterKeyPress } from '@/lib/utils'
import type { CategoryWithCount } from '@/server/schemas/category'

import { SortableFloatingTodoItem } from './SortableFloatingTodoItem'

// Lazy load icons to reduce initial bundle size
const Plus = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Plus })),
)
const Check = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Check })),
)
const X = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.X })),
)
const Edit2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Edit2 })),
)
const Trash2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Trash2 })),
)
const Minimize2 = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Minimize2 })),
)
const Pin = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Pin })),
)
const PinOff = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.PinOff })),
)
const ExternalLink = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.ExternalLink })),
)
const GripVertical = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.GripVertical })),
)

// Icon fallback component for loading state
const IconFallback = () => (
  <div className="h-3 w-3 animate-pulse rounded bg-muted" />
)

export interface FloatingTodo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
}

interface FloatingNavigatorProps {
  todos: FloatingTodo[]
  onTaskToggle: (id: string) => void
  onTaskCreate: (title: string) => void
  onTaskEdit: (id: string, title: string) => void
  onTaskDelete: (id: string) => void
  onTaskReorder?: (activeId: string, overId: string) => void
  /** Categories for the filter dropdown */
  categories?: CategoryWithCount[]
  /** Currently selected category ID (null = All) */
  selectedCategoryId?: number | null
  /** Callback when category filter changes */
  onCategoryChange?: (id: number | null) => void
}

export function FloatingNavigator({
  todos,
  onTaskToggle,
  onTaskCreate,
  onTaskEdit,
  onTaskDelete,
  onTaskReorder,
  categories = [],
  selectedCategoryId = null,
  onCategoryChange,
}: FloatingNavigatorProps) {
  const [newTaskText, setNewTaskText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)

  // Separate todos by completion status
  const pendingTodos = todos.filter((todo) => !todo.completed)
  const completedTodos = todos.filter((todo) => todo.completed)

  const startEditing = useCallback((todo: FloatingTodo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
    // Focus and select input after DOM update
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus()
        editInputRef.current.select()
      }
    }, 0)
  }, [])

  useFloatingNavigatorMenuActions({
    inputRef,
  })

  // Configure dnd-kit sensors for pointer and keyboard interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  /**
   * Handles drag end event to reorder todos.
   * Calls parent's onTaskReorder callback with active and over IDs.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    if (onTaskReorder) {
      onTaskReorder(active.id as string, over.id as string)
    }
  }

  const handleCreateTask = () => {
    if (newTaskText.trim()) {
      onTaskCreate(newTaskText.trim())
      setNewTaskText('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (isEnterKeyPress(e)) {
      handleCreateTask()
    }
  }

  const saveEdit = () => {
    if (editingId && editText.trim()) {
      onTaskEdit(editingId, editText.trim())
    }
    setEditingId(null)
    setEditText('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (isEnterKeyPress(e)) {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  // Window control functions
  const handleMinimize = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        await window.floatingNavigatorAPI!.window.minimize()
      } catch (error) {
        log.error('Failed to minimize window:', error)
      }
    }
  }

  const handleClose = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        await window.floatingNavigatorAPI!.window.close()
      } catch (error) {
        log.error('Failed to close window:', error)
      }
    }
  }

  const handleToggleAlwaysOnTop = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        const newState =
          await window.floatingNavigatorAPI!.window.toggleAlwaysOnTop()
        setIsAlwaysOnTop(newState)
      } catch (error) {
        log.error('Failed to toggle always on top:', error)
      }
    }
  }

  const handleFocusMainWindow = async () => {
    if (isFloatingNavigatorEnvironment()) {
      try {
        await window.floatingNavigatorAPI!.window.focusMainWindow()
      } catch (error) {
        log.error('Failed to focus main window:', error)
      }
    }
  }

  // Handle task toggle
  const handleTaskToggle = (id: string) => {
    const task = todos.find((t) => t.id === id)
    if (task) {
      onTaskToggle(id)
    }
  }

  // Handle task deletion
  const handleTaskDelete = (id: string) => {
    const task = todos.find((t) => t.id === id)
    if (task) {
      onTaskDelete(id)
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
      role="application"
      aria-label="Floating Task Navigator"
    >
      {/* Header with window controls */}
      <header
        className="bg-muted/50 drag-handle flex cursor-move items-center justify-between border-b px-3 py-2"
        role="banner"
      >
        <div className="pointer-events-none flex-1">
          <h1 className="text-sm font-medium text-foreground">Quick Tasks</h1>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {pendingTodos.length} pending task
            {pendingTodos.length !== 1 ? 's' : ''}
            {completedTodos.length > 0 &&
              `, ${completedTodos.length} completed`}
          </p>
        </div>

        {/* Category filter dropdown */}
        {categories.length > 0 && onCategoryChange && (
          <div className="pointer-events-auto mr-1">
            <Select
              value={selectedCategoryId?.toString() ?? 'all'}
              onValueChange={(value) =>
                onCategoryChange(value === 'all' ? null : Number(value))
              }
            >
              <SelectTrigger className="h-6 w-24 border-0 bg-transparent px-2 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${COLOR_DOT_CLASSES[cat.color] ?? 'bg-muted-foreground'}`}
                      />
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isFloatingNavigatorEnvironment() && (
          <div
            className="pointer-events-auto flex items-center gap-1"
            role="toolbar"
            aria-label="Window controls"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={handleFocusMainWindow}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open main window"
              title="Open main window"
            >
              <Suspense fallback={<IconFallback />}>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleAlwaysOnTop}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={
                isAlwaysOnTop ? 'Disable always on top' : 'Enable always on top'
              }
              aria-pressed={isAlwaysOnTop}
              title={
                isAlwaysOnTop ? 'Disable always on top' : 'Enable always on top'
              }
            >
              <Suspense fallback={<IconFallback />}>
                {isAlwaysOnTop ? (
                  <PinOff className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Pin className="h-3 w-3" aria-hidden="true" />
                )}
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleMinimize}
              className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Minimize window"
              title="Minimize"
            >
              <Suspense fallback={<IconFallback />}>
                <Minimize2 className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClose}
              className="h-6 w-6 p-0 text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Close window"
              title="Close"
            >
              <Suspense fallback={<IconFallback />}>
                <X className="h-3 w-3" aria-hidden="true" />
              </Suspense>
            </Button>
          </div>
        )}
      </header>

      {/* Add new task */}
      <section className="border-b bg-background p-3" aria-label="Add new task">
        <div className="flex gap-2">
          <Input
            id="task-input"
            ref={inputRef}
            placeholder="Add task... (Use View menu for actions)"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={handleKeyPress}
            className="h-8 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="New task title"
            aria-describedby="task-input-help"
          />
          <div id="task-input-help" className="sr-only">
            Type a task title and press Enter or click the add button to create
            a new task
          </div>
          <Button
            size="sm"
            onClick={handleCreateTask}
            disabled={!newTaskText.trim()}
            className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`Add task${newTaskText.trim() ? `: ${newTaskText.trim()}` : ''}`}
            title="Add task (Enter)"
          >
            <Suspense fallback={<IconFallback />}>
              <Plus className="h-3 w-3" aria-hidden="true" />
            </Suspense>
          </Button>
        </div>
      </section>

      {/* Task list */}
      <main
        ref={taskListRef}
        className="floating-navigator-scroll flex-1 overflow-y-auto"
        role="main"
        aria-label="Task list"
      >
        {/* Pending tasks with drag-and-drop reordering */}
        {pendingTodos.length > 0 && (
          <section className="p-2" aria-label="Pending tasks">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={pendingTodos.map((todo) => todo.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className="space-y-1"
                  role="list"
                  aria-label={`${pendingTodos.length} pending task${pendingTodos.length !== 1 ? 's' : ''}`}
                >
                  {pendingTodos.map((todo) => (
                    <SortableFloatingTodoItem key={todo.id} todo={todo}>
                      {({ dragHandleProps, isDragging }) => (
                        <div
                          className={`hover:bg-muted/50 group flex items-center gap-2 rounded p-2 ${isDragging ? 'ring-primary/20 shadow-lg ring-2' : ''}`}
                          role="listitem"
                          aria-label={`Task: ${todo.text}, ${todo.completed ? 'completed' : 'pending'}`}
                          aria-describedby={`task-${todo.id}-actions`}
                        >
                          {/* Drag handle */}
                          <button
                            type="button"
                            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                            aria-label="Drag to reorder"
                            {...dragHandleProps}
                          >
                            <Suspense fallback={<IconFallback />}>
                              <GripVertical
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                            </Suspense>
                          </button>

                          <Checkbox
                            checked={todo.completed}
                            onCheckedChange={() => handleTaskToggle(todo.id)}
                            className="h-4 w-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label={`Mark task "${todo.text}" as ${todo.completed ? 'incomplete' : 'complete'}`}
                          />

                          {editingId === todo.id ? (
                            <div
                              className="flex flex-1 gap-1"
                              role="group"
                              aria-label="Edit task"
                            >
                              <Input
                                ref={editInputRef}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={handleEditKeyPress}
                                className="h-6 flex-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label="Edit task title"
                                aria-describedby={`edit-help-${todo.id}`}
                              />
                              <div
                                id={`edit-help-${todo.id}`}
                                className="sr-only"
                              >
                                Press Enter to save, Escape to cancel
                              </div>
                              <Button
                                size="sm"
                                onClick={saveEdit}
                                className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label="Save changes"
                                title="Save (Enter)"
                              >
                                <Suspense fallback={<IconFallback />}>
                                  <Check
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                </Suspense>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEdit}
                                className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label="Cancel editing"
                                title="Cancel (Escape)"
                              >
                                <Suspense fallback={<IconFallback />}>
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </Suspense>
                              </Button>
                            </div>
                          ) : (
                            <>
                              <button
                                className="flex-1 cursor-pointer overflow-scroll rounded px-1 text-left text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                onClick={() => startEditing(todo)}
                                title={`${todo.text} - Click to edit`}
                                aria-label={`Edit task: ${todo.text}`}
                              >
                                {todo.text}
                              </button>
                              <div
                                id={`task-${todo.id}-actions`}
                                className="flex gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100"
                                role="group"
                                aria-label="Task actions"
                              >
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(todo)}
                                  className="h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  aria-label={`Edit task: ${todo.text}`}
                                  title="Edit task (Enter)"
                                >
                                  <Suspense fallback={<IconFallback />}>
                                    <Edit2
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                  </Suspense>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleTaskDelete(todo.id)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  aria-label={`Delete task: ${todo.text}`}
                                  title="Delete task (Delete)"
                                >
                                  <Suspense fallback={<IconFallback />}>
                                    <Trash2
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                  </Suspense>
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </SortableFloatingTodoItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </section>
        )}

        {/* Completed tasks */}
        {completedTodos.length > 0 && (
          <section className="border-t" aria-label="Completed tasks">
            <div className="bg-muted/30 px-3 py-2">
              <h2 className="text-xs font-medium text-muted-foreground">
                Completed ({completedTodos.length})
              </h2>
            </div>
            <div
              className="space-y-1 p-2"
              role="list"
              aria-label={`${completedTodos.length} completed task${completedTodos.length !== 1 ? 's' : ''}`}
            >
              {completedTodos.slice(0, 3).map((todo) => (
                <div
                  key={todo.id}
                  className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2 opacity-60"
                  role="listitem"
                  aria-label={`Completed task: ${todo.text}`}
                >
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() => handleTaskToggle(todo.id)}
                    className="h-4 w-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Mark completed task "${todo.text}" as incomplete`}
                  />
                  <span
                    className="flex-1 truncate text-xs line-through"
                    title={todo.text}
                    aria-label={`Completed: ${todo.text}`}
                  >
                    {todo.text}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleTaskDelete(todo.id)}
                    className="h-6 w-6 p-0 text-destructive opacity-0 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:opacity-100"
                    aria-label={`Delete completed task: ${todo.text}`}
                    title="Delete task"
                  >
                    <Suspense fallback={<IconFallback />}>
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Suspense>
                  </Button>
                </div>
              ))}
              {completedTodos.length > 3 && (
                <div
                  className="py-1 text-center text-xs text-muted-foreground"
                  role="status"
                  aria-label={`${completedTodos.length - 3} additional completed tasks not shown`}
                >
                  +{completedTodos.length - 3} more completed
                </div>
              )}
            </div>
          </section>
        )}

        {/* Empty state */}
        {todos.length === 0 && (
          <div className="p-6 text-center" role="status">
            <p className="text-xs text-muted-foreground">
              No tasks yet. Add one above!
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Use View menu to access all functions
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

'use client'

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'

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

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

// Icon fallback component for loading state
const IconFallback = () => (
  <div className="bg-muted h-3 w-3 animate-pulse rounded" />
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
}

export function FloatingNavigator({
  todos,
  onTaskToggle,
  onTaskCreate,
  onTaskEdit,
  onTaskDelete,
}: FloatingNavigatorProps) {
  const [newTaskText, setNewTaskText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true)
  const [focusedTaskIndex, setFocusedTaskIndex] = useState<number>(-1)
  const [announceText, setAnnounceText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const skipLinkRef = useRef<HTMLAnchorElement>(null)

  // Check if we're in floating navigator environment
  const isFloatingNavigator =
    typeof window !== 'undefined' && window.floatingNavigatorAPI

  // Separate todos by completion status
  const pendingTodos = todos.filter((todo) => !todo.completed)
  const completedTodos = todos.filter((todo) => todo.completed)

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const handleCreateTask = () => {
    if (newTaskText.trim()) {
      onTaskCreate(newTaskText.trim())
      setNewTaskText('')
      announceToScreenReader(`Task "${newTaskText.trim()}" created`)
    }
  }

  // Screen reader announcements
  const announceToScreenReader = (message: string) => {
    setAnnounceText(message)
    // Clear after a short delay to allow screen readers to announce
    setTimeout(() => setAnnounceText(''), 1000)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateTask()
    }
  }

  // Enhanced keyboard navigation
  const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
    const allTodos = [...pendingTodos, ...completedTodos]

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (focusedTaskIndex < allTodos.length - 1) {
          setFocusedTaskIndex(focusedTaskIndex + 1)
          announceToScreenReader(
            `Task ${focusedTaskIndex + 2} of ${allTodos.length}: ${allTodos[focusedTaskIndex + 1]?.text}`,
          )
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (focusedTaskIndex > 0) {
          setFocusedTaskIndex(focusedTaskIndex - 1)
          announceToScreenReader(
            `Task ${focusedTaskIndex} of ${allTodos.length}: ${allTodos[focusedTaskIndex - 1]?.text}`,
          )
        } else if (focusedTaskIndex === 0) {
          // Move focus back to input
          setFocusedTaskIndex(-1)
          inputRef.current?.focus()
          announceToScreenReader('Focused on new task input')
        }
        break
      case ' ':
      case 'Enter':
        if (focusedTaskIndex >= 0 && focusedTaskIndex < allTodos.length) {
          e.preventDefault()
          const task = allTodos[focusedTaskIndex]
          if (task) {
            if (e.key === ' ') {
              // Toggle completion with spacebar
              onTaskToggle(task.id)
              announceToScreenReader(
                `Task "${task.text}" ${task.completed ? 'uncompleted' : 'completed'}`,
              )
            } else if (e.key === 'Enter') {
              // Start editing with Enter
              startEditing(task)
            }
          }
        }
        break
      case 'Delete':
      case 'Backspace':
        if (focusedTaskIndex >= 0 && focusedTaskIndex < allTodos.length) {
          e.preventDefault()
          const task = allTodos[focusedTaskIndex]
          if (task) {
            onTaskDelete(task.id)
            announceToScreenReader(`Task "${task.text}" deleted`)
            // Adjust focus after deletion
            if (focusedTaskIndex >= allTodos.length - 1) {
              setFocusedTaskIndex(Math.max(0, allTodos.length - 2))
            }
          }
        }
        break
      case 'Escape':
        // Clear focus and return to input
        setFocusedTaskIndex(-1)
        inputRef.current?.focus()
        announceToScreenReader('Returned to new task input')
        break
    }
  }

  const startEditing = (todo: FloatingTodo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
    announceToScreenReader(`Editing task: ${todo.text}`)
  }

  const saveEdit = () => {
    if (editingId && editText.trim()) {
      const originalText = todos.find((t) => t.id === editingId)?.text
      onTaskEdit(editingId, editText.trim())
      announceToScreenReader(
        `Task updated from "${originalText}" to "${editText.trim()}"`,
      )
    }
    setEditingId(null)
    setEditText('')
  }

  const cancelEdit = () => {
    announceToScreenReader('Edit cancelled')
    setEditingId(null)
    setEditText('')
  }

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  // Window control functions
  const handleMinimize = async () => {
    if (isFloatingNavigator) {
      try {
        await window.floatingNavigatorAPI!.window.minimize()
      } catch (error) {
        console.error('Failed to minimize window:', error)
      }
    }
  }

  const handleClose = async () => {
    if (isFloatingNavigator) {
      try {
        await window.floatingNavigatorAPI!.window.close()
      } catch (error) {
        console.error('Failed to close window:', error)
      }
    }
  }

  const handleToggleAlwaysOnTop = async () => {
    if (isFloatingNavigator) {
      try {
        const newState =
          await window.floatingNavigatorAPI!.window.toggleAlwaysOnTop()
        setIsAlwaysOnTop(newState)
      } catch (error) {
        console.error('Failed to toggle always on top:', error)
      }
    }
  }

  const handleFocusMainWindow = async () => {
    if (isFloatingNavigator) {
      try {
        await window.floatingNavigatorAPI!.window.focusMainWindow()
      } catch (error) {
        console.error('Failed to focus main window:', error)
      }
    }
  }

  // Keyboard shortcuts and accessibility
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N for new task
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        inputRef.current?.focus()
        announceToScreenReader('New task input focused')
      }
      // Ctrl/Cmd + / for help
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        announceToScreenReader(
          'Keyboard shortcuts: Ctrl+N for new task, Arrow keys to navigate, Space to toggle completion, Enter to edit, Delete to remove, Escape to return to input',
        )
      }
    }

    window.addEventListener('keydown', handleGlobalKeyPress)
    return () => window.removeEventListener('keydown', handleGlobalKeyPress)
  }, [])

  // Handle task toggle with announcements
  const handleTaskToggleWithAnnouncement = (id: string) => {
    const task = todos.find((t) => t.id === id)
    if (task) {
      onTaskToggle(id)
      announceToScreenReader(
        `Task "${task.text}" ${task.completed ? 'uncompleted' : 'completed'}`,
      )
    }
  }

  // Handle task deletion with announcements
  const handleTaskDeleteWithAnnouncement = (id: string) => {
    const task = todos.find((t) => t.id === id)
    if (task) {
      onTaskDelete(id)
      announceToScreenReader(`Task "${task.text}" deleted`)
    }
  }

  return (
    <div
      className="bg-background flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-lg"
      role="application"
      aria-label="Floating Task Navigator"
      onKeyDown={handleGlobalKeyDown}
      tabIndex={-1}
    >
      {/* Skip link for keyboard navigation */}
      <a
        ref={skipLinkRef}
        href="#task-input"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-2 focus:py-1"
        onFocus={() => announceToScreenReader('Skip to task input')}
      >
        Skip to task input
      </a>

      {/* Screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {announceText}
      </div>

      {/* Header with window controls */}
      <header
        className="bg-muted/50 drag-handle flex cursor-move items-center justify-between border-b px-3 py-2"
        role="banner"
      >
        <div className="pointer-events-none flex-1">
          <h1 className="text-foreground text-sm font-medium">Quick Tasks</h1>
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {pendingTodos.length} pending task
            {pendingTodos.length !== 1 ? 's' : ''}
            {completedTodos.length > 0 &&
              `, ${completedTodos.length} completed`}
          </p>
        </div>

        {isFloatingNavigator && (
          <div
            className="pointer-events-auto flex items-center gap-1"
            role="toolbar"
            aria-label="Window controls"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={handleFocusMainWindow}
              className="focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
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
              className="focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
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
              className="focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
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
              className="text-destructive hover:text-destructive focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
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
      <section className="bg-background border-b p-3" aria-label="Add new task">
        <div className="flex gap-2">
          <Input
            id="task-input"
            ref={inputRef}
            placeholder="Add task... (Press Ctrl+/ for keyboard shortcuts)"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={handleKeyPress}
            className="focus-visible:ring-ring h-8 text-sm focus-visible:ring-2 focus-visible:ring-offset-2"
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
            className="focus-visible:ring-ring h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
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
        {/* Pending tasks */}
        {pendingTodos.length > 0 && (
          <section className="p-2" aria-label="Pending tasks">
            <div
              className="space-y-1"
              role="list"
              aria-label={`${pendingTodos.length} pending task${pendingTodos.length !== 1 ? 's' : ''}`}
            >
              {pendingTodos.map((todo, index) => (
                <div
                  key={todo.id}
                  className={`hover:bg-muted/50 group flex items-center gap-2 rounded p-2 ${
                    focusedTaskIndex === index
                      ? 'ring-ring bg-muted/50 ring-2 ring-offset-2'
                      : ''
                  }`}
                  role="listitem"
                  tabIndex={focusedTaskIndex === index ? 0 : -1}
                  aria-label={`Task: ${todo.text}, ${todo.completed ? 'completed' : 'pending'}`}
                  aria-describedby={`task-${todo.id}-actions`}
                >
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() =>
                      handleTaskToggleWithAnnouncement(todo.id)
                    }
                    className="focus-visible:ring-ring h-4 w-4 focus-visible:ring-2 focus-visible:ring-offset-2"
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
                        className="focus-visible:ring-ring h-6 flex-1 text-xs focus-visible:ring-2 focus-visible:ring-offset-2"
                        aria-label="Edit task title"
                        aria-describedby={`edit-help-${todo.id}`}
                      />
                      <div id={`edit-help-${todo.id}`} className="sr-only">
                        Press Enter to save, Escape to cancel
                      </div>
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        className="focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
                        aria-label="Save changes"
                        title="Save (Enter)"
                      >
                        <Suspense fallback={<IconFallback />}>
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </Suspense>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        className="focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
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
                        className="focus-visible:ring-ring flex-1 cursor-pointer truncate rounded px-1 text-left text-xs focus-visible:ring-2 focus-visible:ring-offset-2"
                        onClick={() => startEditing(todo)}
                        title={`${todo.text} - Click to edit`}
                        aria-label={`Edit task: ${todo.text}`}
                      >
                        {todo.text}
                      </button>
                      <div
                        id={`task-${todo.id}-actions`}
                        className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                        role="group"
                        aria-label="Task actions"
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(todo)}
                          className="focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
                          aria-label={`Edit task: ${todo.text}`}
                          title="Edit task (Enter)"
                        >
                          <Suspense fallback={<IconFallback />}>
                            <Edit2 className="h-3 w-3" aria-hidden="true" />
                          </Suspense>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleTaskDeleteWithAnnouncement(todo.id)
                          }
                          className="text-destructive hover:text-destructive focus-visible:ring-ring h-6 w-6 p-0 focus-visible:ring-2 focus-visible:ring-offset-2"
                          aria-label={`Delete task: ${todo.text}`}
                          title="Delete task (Delete)"
                        >
                          <Suspense fallback={<IconFallback />}>
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Suspense>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed tasks */}
        {completedTodos.length > 0 && (
          <section className="border-t" aria-label="Completed tasks">
            <div className="bg-muted/30 px-3 py-2">
              <h2 className="text-muted-foreground text-xs font-medium">
                Completed ({completedTodos.length})
              </h2>
            </div>
            <div
              className="space-y-1 p-2"
              role="list"
              aria-label={`${completedTodos.length} completed task${completedTodos.length !== 1 ? 's' : ''}`}
            >
              {completedTodos.slice(0, 3).map((todo, index) => (
                <div
                  key={todo.id}
                  className={`hover:bg-muted/50 group flex items-center gap-2 rounded p-2 opacity-60 ${
                    focusedTaskIndex === pendingTodos.length + index
                      ? 'ring-ring bg-muted/50 ring-2 ring-offset-2'
                      : ''
                  }`}
                  role="listitem"
                  tabIndex={
                    focusedTaskIndex === pendingTodos.length + index ? 0 : -1
                  }
                  aria-label={`Completed task: ${todo.text}`}
                >
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() =>
                      handleTaskToggleWithAnnouncement(todo.id)
                    }
                    className="focus-visible:ring-ring h-4 w-4 focus-visible:ring-2 focus-visible:ring-offset-2"
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
                    onClick={() => handleTaskDeleteWithAnnouncement(todo.id)}
                    className="text-destructive hover:text-destructive focus-visible:ring-ring h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2"
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
                  className="text-muted-foreground py-1 text-center text-xs"
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
            <p className="text-muted-foreground text-xs">
              No tasks yet. Add one above!
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              Press Ctrl+/ for keyboard shortcuts
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

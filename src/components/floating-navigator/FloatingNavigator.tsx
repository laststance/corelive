'use client'

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'

// Lazy load icons to reduce initial bundle size
const Plus = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Plus })),
)
const Check = lazy(async () =>
  import('lucide-react').then((mod) => ({ default: mod.Check })),
)
const X = lazy(async () => import('lucide-react').then((mod) => ({ default: mod.X })))
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
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Check if we're in floating navigator environment
  const isFloatingNavigator =
    typeof window !== 'undefined' && window.floatingNavigatorAPI

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
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateTask()
    }
  }

  const startEditing = (todo: FloatingTodo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N for new task
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyPress)
    return () => window.removeEventListener('keydown', handleGlobalKeyPress)
  }, [])

  const pendingTodos = todos.filter((todo) => !todo.completed)
  const completedTodos = todos.filter((todo) => todo.completed)

  return (
    <div className="bg-background flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-lg">
      {/* Header with window controls */}
      <div className="bg-muted/50 drag-handle flex cursor-move items-center justify-between border-b px-3 py-2">
        <div className="pointer-events-none flex-1">
          <h2 className="text-foreground text-sm font-medium">Quick Tasks</h2>
          <p className="text-muted-foreground text-xs">
            {pendingTodos.length} pending
          </p>
        </div>

        {isFloatingNavigator && (
          <div className="pointer-events-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleFocusMainWindow}
              className="h-6 w-6 p-0"
              title="Open main window"
            >
              <Suspense fallback={<IconFallback />}>
                <ExternalLink className="h-3 w-3" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleAlwaysOnTop}
              className="h-6 w-6 p-0"
              title={
                isAlwaysOnTop ? 'Disable always on top' : 'Enable always on top'
              }
            >
              <Suspense fallback={<IconFallback />}>
                {isAlwaysOnTop ? (
                  <PinOff className="h-3 w-3" />
                ) : (
                  <Pin className="h-3 w-3" />
                )}
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleMinimize}
              className="h-6 w-6 p-0"
              title="Minimize"
            >
              <Suspense fallback={<IconFallback />}>
                <Minimize2 className="h-3 w-3" />
              </Suspense>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClose}
              className="text-destructive hover:text-destructive h-6 w-6 p-0"
              title="Close"
            >
              <Suspense fallback={<IconFallback />}>
                <X className="h-3 w-3" />
              </Suspense>
            </Button>
          </div>
        )}
      </div>

      {/* Add new task */}
      <div className="bg-background border-b p-3">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Add task..."
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={handleKeyPress}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            onClick={handleCreateTask}
            disabled={!newTaskText.trim()}
            className="h-8 w-8 p-0"
            aria-label="Add task"
          >
            <Suspense fallback={<IconFallback />}>
              <Plus className="h-3 w-3" />
            </Suspense>
          </Button>
        </div>
      </div>

      {/* Task list */}
      <div className="floating-navigator-scroll flex-1 overflow-y-auto">
        {/* Pending tasks */}
        {pendingTodos.length > 0 && (
          <div className="p-2">
            <div className="space-y-1">
              {pendingTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2"
                >
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() => onTaskToggle(todo.id)}
                    className="h-4 w-4"
                  />

                  {editingId === todo.id ? (
                    <div className="flex flex-1 gap-1">
                      <Input
                        ref={editInputRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="h-6 flex-1 text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        className="h-6 w-6 p-0"
                      >
                        <Suspense fallback={<IconFallback />}>
                          <Check className="h-3 w-3" />
                        </Suspense>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        className="h-6 w-6 p-0"
                      >
                        <Suspense fallback={<IconFallback />}>
                          <X className="h-3 w-3" />
                        </Suspense>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="flex-1 cursor-pointer truncate text-xs"
                        onClick={() => startEditing(todo)}
                        title={todo.text}
                      >
                        {todo.text}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(todo)}
                          className="h-6 w-6 p-0"
                        >
                          <Suspense fallback={<IconFallback />}>
                            <Edit2 className="h-3 w-3" />
                          </Suspense>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onTaskDelete(todo.id)}
                          className="text-destructive hover:text-destructive h-6 w-6 p-0"
                        >
                          <Suspense fallback={<IconFallback />}>
                            <Trash2 className="h-3 w-3" />
                          </Suspense>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed tasks */}
        {completedTodos.length > 0 && (
          <div className="border-t">
            <div className="bg-muted/30 px-3 py-2">
              <p className="text-muted-foreground text-xs font-medium">
                Completed ({completedTodos.length})
              </p>
            </div>
            <div className="space-y-1 p-2">
              {completedTodos.slice(0, 3).map((todo) => (
                <div
                  key={todo.id}
                  className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2 opacity-60"
                >
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() => onTaskToggle(todo.id)}
                    className="h-4 w-4"
                  />
                  <span
                    className="flex-1 truncate text-xs line-through"
                    title={todo.text}
                  >
                    {todo.text}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onTaskDelete(todo.id)}
                    className="text-destructive hover:text-destructive h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                  >
                    <Suspense fallback={<IconFallback />}>
                      <Trash2 className="h-3 w-3" />
                    </Suspense>
                  </Button>
                </div>
              ))}
              {completedTodos.length > 3 && (
                <p className="text-muted-foreground py-1 text-center text-xs">
                  +{completedTodos.length - 3} more completed
                </p>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {todos.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-muted-foreground text-xs">
              No tasks yet. Add one above!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

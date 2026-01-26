'use client'

import { arrayMove } from '@dnd-kit/sortable'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useEffect, useState } from 'react'

import { useMounted } from '@/hooks/use-mounted'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'

import { FloatingNavigator, type FloatingTodo } from './FloatingNavigator'

const TODO_QUERY_LIMIT = 100
const TODO_QUERY_OFFSET = 0
const DECIMAL_RADIX = 10

// Types are declared in electron/types/electron-api.d.ts

/**
 * FloatingNavigatorContainer - Container component for Floating Navigator.
 *
 * In WebView architecture:
 * - Data operations use oRPC (same as web app via https://corelive.app/api/orpc)
 * - Window controls use Electron IPC (close, minimize, always-on-top)
 *
 * This component provides the same functionality as the web app's todo list,
 * but in a compact floating window format with Electron-specific controls.
 * @returns
 * - Floating navigator UI for the Electron desktop app
 * @example
 * <FloatingNavigatorContainer />
 */
export function FloatingNavigatorContainer() {
  const queryClient = useQueryClient()

  // Mutations with optimistic updates
  const {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    reorderMutation,
  } = useTodoMutations()

  // Local state for optimistic reordering
  const [localPendingTodos, setLocalPendingTodos] = useState<FloatingTodo[]>([])

  // SSR-safe mount detection using useSyncExternalStore
  const isMounted = useMounted()

  // Check if we're in Electron floating navigator environment (for window controls)
  const isFloatingNavigator =
    isMounted && typeof window !== 'undefined' && window.floatingNavigatorAPI

  // Fetch todos using oRPC (same as web app)
  const { data, isLoading, error } = useQuery(
    orpc.todo.list.queryOptions({
      input: {
        completed: false,
        limit: TODO_QUERY_LIMIT,
        offset: TODO_QUERY_OFFSET,
      },
    }),
  )

  /**
   * Toggles completion state for a floating navigator task.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * handleTaskToggle('42')
   */
  const handleTaskToggle = (id: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      toggleMutation.mutate({ id: todoId })
    }
  }

  /**
   * Creates a new task from the floating navigator input.
   * @param title - Task title to create.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * handleTaskCreate('Write report')
   */
  const handleTaskCreate = (title: string) => {
    createMutation.mutate({ text: title })
  }

  /**
   * Updates a task title from the floating navigator.
   * @param id - Todo identifier as a string.
   * @param title - New task title.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * handleTaskEdit('42', 'Updated title')
   */
  const handleTaskEdit = (id: string, title: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      updateMutation.mutate({ id: todoId, data: { text: title } })
    }
  }

  /**
   * Deletes a task from the floating navigator.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * handleTaskDelete('42')
   */
  const handleTaskDelete = (id: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      deleteMutation.mutate({ id: todoId })
    }
  }

  /**
   * Handles drag-and-drop reordering of tasks.
   * Optimistically updates local state and syncs with server.
   * @param activeId - The ID of the dragged task.
   * @param overId - The ID of the task being dragged over.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * handleTaskReorder('1', '3')
   */
  const handleTaskReorder = (activeId: string, overId: string) => {
    const oldIndex = localPendingTodos.findIndex((t) => t.id === activeId)
    const newIndex = localPendingTodos.findIndex((t) => t.id === overId)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Optimistically update local state
    const reordered = arrayMove(localPendingTodos, oldIndex, newIndex)
    setLocalPendingTodos(reordered)

    // Build reorder items with new order values
    const items = reordered.map((t, i) => ({
      id: parseInt(t.id, DECIMAL_RADIX),
      order: i,
    }))

    // Call reorder mutation
    reorderMutation.mutate({ items })
  }

  // Transform todos to FloatingTodo format
  const todosFromQuery: FloatingTodo[] = (data?.todos ?? []).map((todo) => ({
    id: todo.id.toString(),
    text: todo.text,
    completed: todo.completed,
    createdAt: new Date(todo.createdAt),
  }))

  // Sync local state with query data when it changes
  useEffect(() => {
    setLocalPendingTodos(todosFromQuery.filter((t) => !t.completed))
  }, [data])

  // Use local state for pending todos to enable optimistic reordering
  const pendingTodos = localPendingTodos
  const completedTodos = todosFromQuery.filter((t) => t.completed)

  // Combine for passing to FloatingNavigator
  const todos = [...pendingTodos, ...completedTodos]

  useEffect(() => {
    return subscribeToTodoSync(() => {
      queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    })
  }, [queryClient])

  // Show message if not in Electron floating navigator
  if (!isFloatingNavigator) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Floating navigator only available in desktop app
        </p>
      </div>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      </div>
    )
  }

  // Show error state
  if (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to load tasks'

    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background p-4">
        <p className="mb-2 text-sm text-destructive">{errorMessage}</p>
        <button
          onClick={async () =>
            queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
          }
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <FloatingNavigator
      todos={todos}
      onTaskToggle={handleTaskToggle}
      onTaskCreate={handleTaskCreate}
      onTaskEdit={handleTaskEdit}
      onTaskDelete={handleTaskDelete}
      onTaskReorder={handleTaskReorder}
    />
  )
}

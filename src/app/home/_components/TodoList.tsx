'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import React, { useEffect } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'

import { AddTodoForm } from './AddTodoForm'
import { CompletedTodos } from './CompletedTodos'
import type { Todo } from './TodoItem'
import { TodoItem } from './TodoItem'

const TODO_QUERY_LIMIT = 100
const TODO_QUERY_OFFSET = 0
const DECIMAL_RADIX = 10

/**
 * Renders the primary todo list view with pending and completed tasks.
 * @returns
 * - The todo list UI for the home screen
 * @example
 * <TodoList />
 */
export function TodoList() {
  const queryClient = useQueryClient()

  // Mutations with optimistic updates
  const {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
  } = useTodoMutations()

  // Fetch pending todos
  const { data: pendingData, isLoading: pendingLoading } = useQuery(
    orpc.todo.list.queryOptions({
      input: {
        completed: false,
        limit: TODO_QUERY_LIMIT,
        offset: TODO_QUERY_OFFSET,
      },
    }),
  )

  /**
   * Adds a new todo item using the create mutation.
   * @param text - Todo title to create.
   * @param notes - Optional notes to attach to the todo.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * addTodo('Buy milk')
   */
  const addTodo = (text: string, notes?: string) => {
    createMutation.mutate({ text, notes })
  }

  /**
   * Toggles completion status for the given todo.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * toggleComplete('42')
   */
  const toggleComplete = (id: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      toggleMutation.mutate({ id: todoId })
    }
  }

  /**
   * Deletes the specified todo item.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * deleteTodo('42')
   */
  const deleteTodo = (id: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      deleteMutation.mutate({ id: todoId })
    }
  }

  /**
   * Updates the notes for a specific todo item.
   * @param id - Todo identifier as a string.
   * @param notes - New notes content.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * updateNotes('42', 'Call supplier')
   */
  const updateNotes = (id: string, notes: string) => {
    const todoId = parseInt(id, DECIMAL_RADIX)
    if (!isNaN(todoId)) {
      updateMutation.mutate({ id: todoId, data: { notes } })
    }
  }

  /**
   * Clears all completed todos via the bulk delete mutation.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * deleteCompleted()
   */
  const deleteCompleted = () => {
    clearCompletedMutation.mutate({})
  }

  // Transform data into Todo component format
  /**
   * Converts raw API todo data into UI-ready Todo objects.
   * @param todos - Raw todo payloads from the API.
   * @returns
   * - A normalized list of Todo objects
   * - An empty list when the input is not an array
   * @example
   * mapTodos([{ id: 1, text: 'A', completed: false, createdAt: Date.now() }])
   * // => [{ id: '1', text: 'A', completed: false, createdAt: Date }]
   */
  const mapTodos = (todos: unknown): Todo[] => {
    if (!Array.isArray(todos)) {
      return []
    }

    return todos.map((todo) => ({
      id: todo.id.toString(),
      text: todo.text,
      completed: todo.completed,
      createdAt: new Date(todo.createdAt),
      notes: todo.notes,
    }))
  }

  const pendingTodos = mapTodos(pendingData?.todos)

  useEffect(() => {
    return subscribeToTodoSync(() => {
      queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    })
  }, [queryClient])

  // Listen for Electron IPC events to sync todos when they're created/updated/deleted from other windows
  useEffect(() => {
    // Only set up listeners in Electron environment
    if (typeof window === 'undefined' || !window.electronAPI?.on) {
      return
    }

    // Handler to invalidate React Query cache when todos change
    const handleTodoChange = () => {
      queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    }

    // Set up event listeners for todo operations
    const cleanupCreated = window.electronAPI.on(
      'todo-created',
      handleTodoChange,
    )
    const cleanupUpdated = window.electronAPI.on(
      'todo-updated',
      handleTodoChange,
    )
    const cleanupDeleted = window.electronAPI.on(
      'todo-deleted',
      handleTodoChange,
    )

    // Return cleanup function to remove listeners
    return () => {
      if (typeof cleanupCreated === 'function') cleanupCreated()
      if (typeof cleanupUpdated === 'function') cleanupUpdated()
      if (typeof cleanupDeleted === 'function') cleanupDeleted()
    }
  }, [queryClient])

  if (pendingLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left Column - Pending Tasks */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Todo List</span>
              <Badge variant="outline" className="flex items-center gap-1">
                <Circle className="h-3 w-3" />
                {pendingTodos.length} pending
              </Badge>
            </CardTitle>
            <CardDescription>Manage your tasks efficiently</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AddTodoForm onAddTodo={addTodo} />
          </CardContent>
        </Card>

        {pendingTodos.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Circle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                No pending tasks. Add a new task to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggleComplete={toggleComplete}
                onDelete={deleteTodo}
                onUpdateNotes={updateNotes}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right Column - Completed Tasks */}
      <div className="h-full">
        <CompletedTodos
          onDelete={deleteTodo}
          onClearCompleted={deleteCompleted}
        />
      </div>
    </div>
  )
}

'use client'

import type { InfiniteData } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { orpc } from '@/lib/orpc/client-query'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'

/**
 * Todo item structure from server.
 */
interface Todo {
  id: number
  text: string
  completed: boolean
  notes: string | null
  userId: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Response structure for todo list queries.
 */
interface TodoResponse {
  todos: Todo[]
  total: number
  hasMore: boolean
  nextOffset?: number
}

/** Query input for pending todos list. */
const PENDING_INPUT = { completed: false, limit: 100, offset: 0 } as const

/** Query input for completed todos list (infinite query). */
const COMPLETED_INPUT = { completed: true, limit: 10, offset: 0 } as const

/**
 * Custom hook providing TODO mutations with optimistic updates.
 *
 * Implements the TanStack Query optimistic update pattern:
 * 1. onMutate: Cancel queries → Snapshot → Apply optimistic update
 * 2. onError: Rollback using snapshot
 * 3. onSettled: Always invalidate to sync with server
 *
 * @returns Object containing all todo mutations with optimistic updates
 * @returns createMutation - Add new todo with instant UI feedback
 * @returns toggleMutation - Toggle completion with instant list transfer
 * @returns deleteMutation - Remove todo with instant disappearance
 * @returns updateMutation - Update todo with instant in-place change
 * @returns clearCompletedMutation - Clear all completed with instant removal
 *
 * @example
 * const { createMutation, toggleMutation } = useTodoMutations()
 * createMutation.mutate({ text: 'New task' })
 * toggleMutation.mutate({ id: 42 })
 */
export function useTodoMutations() {
  const queryClient = useQueryClient()

  // Query keys for cache operations
  const baseKey = orpc.todo.key()
  const pendingKey = orpc.todo.list.key({ input: PENDING_INPUT })
  const completedInfiniteKey = orpc.todo.list.key({ input: COMPLETED_INPUT })

  // ============================================
  // CREATE MUTATION - Optimistic add to pending
  // ============================================
  const createMutation = useMutation({
    ...orpc.todo.create.mutationOptions({}),
    onMutate: async (newTodo) => {
      // 1. Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: baseKey })

      // 2. Snapshot previous value
      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)

      // 3. Optimistically add temp item
      const optimisticTodo: Todo = {
        id: -Date.now(), // Negative temp ID to avoid collision
        text: newTodo.text,
        notes: newTodo.notes ?? null,
        completed: false,
        userId: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
        if (!old) return old
        return {
          ...old,
          todos: [optimisticTodo, ...old.todos],
          total: old.total + 1,
        }
      })

      // 4. Return context for rollback
      return { previousPending }
    },
    onError: (_err, _newTodo, context) => {
      // Rollback on error
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
    },
    onSettled: () => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: baseKey })
      broadcastTodoSync()
    },
  })

  // ============================================
  // TOGGLE MUTATION - Move between lists
  // ============================================
  const toggleMutation = useMutation({
    ...orpc.todo.toggle.mutationOptions({}),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: baseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      const previousCompleted =
        queryClient.getQueryData<InfiniteData<TodoResponse>>(
          completedInfiniteKey,
        )

      // Find todo in pending list
      const todoInPending = previousPending?.todos.find((t) => t.id === id)

      if (todoInPending) {
        // Moving: pending → completed
        queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
          if (!old) return old
          return {
            ...old,
            todos: old.todos.filter((t) => t.id !== id),
            total: old.total - 1,
          }
        })

        // Add to first page of completed (infinite query)
        queryClient.setQueryData<InfiniteData<TodoResponse>>(
          completedInfiniteKey,
          (old) => {
            if (!old || !old.pages[0]) return old
            const toggledTodo = {
              ...todoInPending,
              completed: true,
              updatedAt: new Date(),
            }
            return {
              ...old,
              pages: [
                {
                  ...old.pages[0],
                  todos: [toggledTodo, ...old.pages[0].todos],
                  total: old.pages[0].total + 1,
                },
                ...old.pages.slice(1),
              ],
            }
          },
        )
      } else {
        // Moving: completed → pending (find in infinite query)
        let todoInCompleted: Todo | undefined
        previousCompleted?.pages.forEach((page) => {
          const found = page.todos.find((t) => t.id === id)
          if (found) todoInCompleted = found
        })

        if (todoInCompleted) {
          // Remove from completed
          queryClient.setQueryData<InfiniteData<TodoResponse>>(
            completedInfiniteKey,
            (old) => {
              if (!old) return old
              return {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  todos: page.todos.filter((t) => t.id !== id),
                  total: page.total - 1,
                })),
              }
            },
          )

          // Add to pending
          queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
            if (!old) return old
            const toggledTodo = {
              ...todoInCompleted!,
              completed: false,
              updatedAt: new Date(),
            }
            return {
              ...old,
              todos: [toggledTodo, ...old.todos],
              total: old.total + 1,
            }
          })
        }
      }

      return { previousPending, previousCompleted }
    },
    onError: (_err, _input, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
      if (context?.previousCompleted) {
        queryClient.setQueryData(
          completedInfiniteKey,
          context.previousCompleted,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baseKey })
      broadcastTodoSync()
    },
  })

  // ============================================
  // DELETE MUTATION - Remove from list
  // ============================================
  const deleteMutation = useMutation({
    ...orpc.todo.delete.mutationOptions({}),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: baseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      const previousCompleted =
        queryClient.getQueryData<InfiniteData<TodoResponse>>(
          completedInfiniteKey,
        )

      // Try removing from pending
      const isInPending = previousPending?.todos.some((t) => t.id === id)
      if (isInPending) {
        queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
          if (!old) return old
          return {
            ...old,
            todos: old.todos.filter((t) => t.id !== id),
            total: old.total - 1,
          }
        })
      } else {
        // Remove from completed (infinite query)
        queryClient.setQueryData<InfiniteData<TodoResponse>>(
          completedInfiniteKey,
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                todos: page.todos.filter((t) => t.id !== id),
                total: page.total - 1,
              })),
            }
          },
        )
      }

      return { previousPending, previousCompleted }
    },
    onError: (_err, _input, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
      if (context?.previousCompleted) {
        queryClient.setQueryData(
          completedInfiniteKey,
          context.previousCompleted,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baseKey })
      broadcastTodoSync()
    },
  })

  // ============================================
  // UPDATE MUTATION - Update in-place
  // ============================================
  const updateMutation = useMutation({
    ...orpc.todo.update.mutationOptions({}),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: baseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      const previousCompleted =
        queryClient.getQueryData<InfiniteData<TodoResponse>>(
          completedInfiniteKey,
        )

      // Update in pending list
      queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
        if (!old) return old
        return {
          ...old,
          todos: old.todos.map((t) =>
            t.id === id ? { ...t, ...data, updatedAt: new Date() } : t,
          ),
        }
      })

      // Update in completed list (infinite query)
      queryClient.setQueryData<InfiniteData<TodoResponse>>(
        completedInfiniteKey,
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              todos: page.todos.map((t) =>
                t.id === id ? { ...t, ...data, updatedAt: new Date() } : t,
              ),
            })),
          }
        },
      )

      return { previousPending, previousCompleted }
    },
    onError: (_err, _input, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
      if (context?.previousCompleted) {
        queryClient.setQueryData(
          completedInfiniteKey,
          context.previousCompleted,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baseKey })
      broadcastTodoSync()
    },
  })

  // ============================================
  // CLEAR COMPLETED MUTATION - Bulk delete
  // ============================================
  const clearCompletedMutation = useMutation({
    ...orpc.todo.clearCompleted.mutationOptions({}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: baseKey })

      const previousCompleted =
        queryClient.getQueryData<InfiniteData<TodoResponse>>(
          completedInfiniteKey,
        )

      // Clear all pages
      queryClient.setQueryData<InfiniteData<TodoResponse>>(
        completedInfiniteKey,
        () => ({
          pages: [{ todos: [], total: 0, hasMore: false }],
          pageParams: [0],
        }),
      )

      return { previousCompleted }
    },
    onError: (_err, _input, context) => {
      if (context?.previousCompleted) {
        queryClient.setQueryData(
          completedInfiniteKey,
          context.previousCompleted,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baseKey })
      broadcastTodoSync()
    },
  })

  return {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
  }
}

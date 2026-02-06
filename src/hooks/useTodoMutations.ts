'use client'

import type { InfiniteData } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { broadcastCategorySync } from '@/lib/category-sync-channel'
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
  // - pendingKey: exact match for useQuery in TodoList
  // - completedBaseKey: partial match for useInfiniteQuery in CompletedTodos
  //   (infiniteOptions with function input generates unpredictable keys,
  //    so we use partial matching for completed list operations)
  const pendingKey = orpc.todo.list.queryOptions({
    input: PENDING_INPUT,
  }).queryKey
  const completedBaseKey = orpc.todo.list.key({ input: { completed: true } })
  // ============================================
  // CREATE MUTATION - Optimistic add to pending
  // ============================================
  const createMutation = useMutation({
    ...orpc.todo.create.mutationOptions({}),
    onMutate: async (newTodo) => {
      // 1. Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: pendingKey })

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
      queryClient.invalidateQueries({ queryKey: pendingKey })
      // Refresh category counts (todo was added to a category)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      broadcastTodoSync()
      broadcastCategorySync()
    },
  })

  // ============================================
  // TOGGLE MUTATION - Move between lists
  // ============================================
  const toggleMutation = useMutation({
    ...orpc.todo.toggle.mutationOptions({}),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: pendingKey })
      await queryClient.cancelQueries({ queryKey: completedBaseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      // Get all completed queries (partial match) for snapshot
      const previousCompletedQueries = queryClient.getQueriesData<
        InfiniteData<TodoResponse>
      >({ queryKey: completedBaseKey })

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

        // Add to first page of all completed queries (partial match)
        const toggledTodo = {
          ...todoInPending,
          completed: true,
          updatedAt: new Date(),
        }
        queryClient.setQueriesData<InfiniteData<TodoResponse>>(
          { queryKey: completedBaseKey },
          (old) => {
            if (!old || !old.pages[0]) return old
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
        // Moving: completed → pending (find in any completed query)
        let todoInCompleted: Todo | undefined
        for (const [, data] of previousCompletedQueries) {
          if (!data) continue
          for (const page of data.pages) {
            const found = page.todos.find((t) => t.id === id)
            if (found) {
              todoInCompleted = found
              break
            }
          }
          if (todoInCompleted) break
        }

        if (todoInCompleted) {
          // Remove from all completed queries
          queryClient.setQueriesData<InfiniteData<TodoResponse>>(
            { queryKey: completedBaseKey },
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
            const toggledTodoToPending = {
              ...todoInCompleted!,
              completed: false,
              updatedAt: new Date(),
            }
            return {
              ...old,
              todos: [toggledTodoToPending, ...old.todos],
              total: old.total + 1,
            }
          })
        }
      }

      return { previousPending, previousCompletedQueries }
    },
    onError: (_err, _input, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
      // Restore all completed queries from snapshot
      if (context?.previousCompletedQueries) {
        for (const [queryKey, data] of context.previousCompletedQueries) {
          if (data) {
            queryClient.setQueryData(queryKey, data)
          }
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey })
      queryClient.invalidateQueries({ queryKey: completedBaseKey })
      // Refresh category counts (todo moved between pending/completed)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      broadcastTodoSync()
      broadcastCategorySync()
    },
  })

  // ============================================
  // DELETE MUTATION - Remove from list
  // ============================================
  const deleteMutation = useMutation({
    ...orpc.todo.delete.mutationOptions({}),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: pendingKey })
      await queryClient.cancelQueries({ queryKey: completedBaseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      const previousCompletedQueries = queryClient.getQueriesData<
        InfiniteData<TodoResponse>
      >({ queryKey: completedBaseKey })

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
        // Remove from all completed queries (partial match)
        queryClient.setQueriesData<InfiniteData<TodoResponse>>(
          { queryKey: completedBaseKey },
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

      return { previousPending, previousCompletedQueries }
    },
    onError: (_err, _input, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
      if (context?.previousCompletedQueries) {
        for (const [queryKey, data] of context.previousCompletedQueries) {
          if (data) {
            queryClient.setQueryData(queryKey, data)
          }
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey })
      queryClient.invalidateQueries({ queryKey: completedBaseKey })
      // Refresh category counts (todo was deleted from a category)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      broadcastTodoSync()
      broadcastCategorySync()
    },
  })

  // ============================================
  // UPDATE MUTATION - Update in-place
  // ============================================
  const updateMutation = useMutation({
    ...orpc.todo.update.mutationOptions({}),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: pendingKey })
      await queryClient.cancelQueries({ queryKey: completedBaseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      const previousCompletedQueries = queryClient.getQueriesData<
        InfiniteData<TodoResponse>
      >({ queryKey: completedBaseKey })

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

      // Update in all completed queries (partial match)
      queryClient.setQueriesData<InfiniteData<TodoResponse>>(
        { queryKey: completedBaseKey },
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

      return { previousPending, previousCompletedQueries }
    },
    onError: (_err, _input, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
      if (context?.previousCompletedQueries) {
        for (const [queryKey, data] of context.previousCompletedQueries) {
          if (data) {
            queryClient.setQueryData(queryKey, data)
          }
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey })
      queryClient.invalidateQueries({ queryKey: completedBaseKey })
      broadcastTodoSync()
    },
  })

  // ============================================
  // CLEAR COMPLETED MUTATION - Bulk delete
  // ============================================
  const clearCompletedMutation = useMutation({
    ...orpc.todo.clearCompleted.mutationOptions({}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: pendingKey })
      await queryClient.cancelQueries({ queryKey: completedBaseKey })

      const previousCompletedQueries = queryClient.getQueriesData<
        InfiniteData<TodoResponse>
      >({ queryKey: completedBaseKey })

      // Clear all completed queries (partial match)
      queryClient.setQueriesData<InfiniteData<TodoResponse>>(
        { queryKey: completedBaseKey },
        () => ({
          pages: [{ todos: [], total: 0, hasMore: false }],
          pageParams: [0],
        }),
      )

      return { previousCompletedQueries }
    },
    onError: (_err, _input, context) => {
      if (context?.previousCompletedQueries) {
        for (const [queryKey, data] of context.previousCompletedQueries) {
          if (data) {
            queryClient.setQueryData(queryKey, data)
          }
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey })
      queryClient.invalidateQueries({ queryKey: completedBaseKey })
      // Refresh category counts (completed todos were cleared)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      broadcastTodoSync()
      broadcastCategorySync()
    },
  })

  // ============================================
  // REORDER MUTATION - Drag-and-drop reordering
  // ============================================
  const reorderMutation = useMutation({
    ...orpc.todo.reorder.mutationOptions({}),
    onMutate: async ({ items }) => {
      // 1. Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: pendingKey })

      // 2. Snapshot previous value
      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)

      // 3. Optimistically update order in cache
      // Note: The local state in TodoList handles the visual reorder,
      // but we also update the query cache for consistency
      if (previousPending) {
        const todoMap = new Map(previousPending.todos.map((t) => [t.id, t]))
        const orderedTodos = items
          .map((item) => todoMap.get(item.id))
          .filter((t): t is Todo => t !== undefined)

        // Add any todos that weren't in the reorder items
        const reorderedIds = new Set(items.map((i) => i.id))
        const remainingTodos = previousPending.todos.filter(
          (t) => !reorderedIds.has(t.id),
        )

        queryClient.setQueryData<TodoResponse>(pendingKey, {
          ...previousPending,
          todos: [...orderedTodos, ...remainingTodos],
        })
      }

      // 4. Return context for rollback
      return { previousPending }
    },
    onError: (_err, _input, context) => {
      // Rollback on error
      if (context?.previousPending) {
        queryClient.setQueryData(pendingKey, context.previousPending)
      }
    },
    onSettled: () => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: pendingKey })
      broadcastTodoSync()
    },
  })

  return {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
    reorderMutation,
  }
}

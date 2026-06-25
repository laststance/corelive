'use client'

import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import { broadcastCategorySync } from '@/lib/category-sync-channel'
import { clearedAffirmation } from '@/lib/clearedAffirmation'
import { orpc } from '@/lib/orpc/client-query'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'
import type { CategoryWithCount } from '@/server/schemas/category'
import type {
  CompletedJournalResponse,
  DayDetailTask,
} from '@/server/schemas/completed'

/**
 * Todo item structure from server.
 */
interface Todo {
  id: number
  text: string
  completed: boolean
  notes: string | null
  categoryId: number
  userId: number
  createdAt: Date
  updatedAt: Date
  // Mirrors TodoSchema.completedAt — null while the todo is still pending.
  completedAt: Date | null
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

/**
 * Resolves a category's display fields from the cached `category.list` so an
 * optimistic journal entry can render its color dot before the server round-trip.
 * Exists because the cached Todo carries only `categoryId`, not name/color.
 * Best-effort: returns null when the category isn't cached yet (the dot renders
 * neutral until the onSettled refetch fills the real category in).
 *
 * @param queryClient - The active react-query client whose cache is read.
 * @param categoryId - The completed todo's category id to resolve.
 * @returns The `{ id, name, color }` triple, or null when not cached.
 * @example
 * resolveCategoryFromCache(queryClient, 3) // => { id: 3, name: 'Health', color: 'green' }
 * resolveCategoryFromCache(queryClient, 99) // => null (not in cache)
 */
function resolveCategoryFromCache(
  queryClient: QueryClient,
  categoryId: number,
): DayDetailTask['category'] {
  // Partial-match every cached category.list query (input varies by caller).
  const categoryQueries = queryClient.getQueriesData<{
    categories: CategoryWithCount[]
  }>({ queryKey: orpc.category.list.key() })
  for (const [, data] of categoryQueries) {
    const found = data?.categories.find((c) => c.id === categoryId)
    if (found) return { id: found.id, name: found.name, color: found.color }
  }
  return null
}

/**
 * Custom hook providing TODO mutations with optimistic updates.
 *
 * Implements the TanStack Query optimistic update pattern:
 * 1. onMutate: Cancel queries → Snapshot → Apply optimistic update
 * 2. onError: Rollback using snapshot
 * 3. onSettled: Always invalidate to sync with server
 *
 * @param categoryId - Currently selected category ID for correct cache key matching.
 *   Must match the categoryId used in the todo list query so optimistic updates
 *   target the right cache entry.
 * @param isRetaining - 居残りモード on/off. When on, the active list drops the
 *   completed:false filter (holds ALL todos), so the cache key omits `completed`
 *   and toggle flips a row IN PLACE instead of moving it to the Completed list.
 *   Passed in (not read from Redux) so consumers without a ReduxProvider — and
 *   the hook's own unit tests — stay decoupled from the store.
 * @returns Object containing all todo mutations with optimistic updates
 *
 * @example
 * const { createMutation, toggleMutation } = useTodoMutations(selectedCategoryId)
 * createMutation.mutate({ text: 'New task', categoryId: 5 })
 * toggleMutation.mutate({ id: 42 })
 */
export function useTodoMutations(
  categoryId: number | null,
  isRetaining = false,
) {
  const queryClient = useQueryClient()

  // Query keys for cache operations
  // - pendingKey: exact match for useQuery in TodoList (includes categoryId filter).
  //   In retain mode (居残りモード) it drops the completed:false filter so the
  //   active list holds ALL todos; the key MUST match TodoList's query input
  //   exactly (same omission) or optimistic updates miss the cache.
  // - completedBaseKey: partial match for useInfiniteQuery in CompletedTodos
  //   (infiniteOptions with function input generates unpredictable keys,
  //    so we use partial matching for completed list operations)
  const pendingKey = orpc.todo.list.queryOptions({
    input: {
      ...(isRetaining ? {} : { completed: false }),
      limit: 100,
      offset: 0,
      ...(categoryId !== null && { categoryId }),
    },
  }).queryKey
  const completedBaseKey = orpc.todo.list.key({ input: { completed: true } })
  // journalBaseKey: partial match for the permanent completion journal
  // (useInfiniteQuery in CompletedTodos). The toggle writes optimistically here
  // too so a Main-window completion lands in the Completed Tasks list instantly —
  // CompletedTodos reads completed.journal, NOT the completed todo.list above.
  const journalBaseKey = orpc.completed.journal.key()
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
        categoryId: newTodo.categoryId,
        completed: false,
        userId: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null, // Newly created todos are pending.
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

      // Retain mode (居残りモード): the active list holds ALL todos, so a toggle
      // flips the row IN PLACE — it keeps its `order` position with the checked
      // + strikethrough look instead of moving to the Completed section.
      if (isRetaining) {
        const previousActive =
          queryClient.getQueryData<TodoResponse>(pendingKey)
        queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
          if (!old) return old
          return {
            ...old,
            todos: old.todos.map((todoRow) => {
              if (todoRow.id !== id) return todoRow
              // Keep completedAt consistent with the flip so no cache consumer
              // ever sees the impossible completed:true/completedAt:null pair.
              const nextCompleted = !todoRow.completed
              return {
                ...todoRow,
                completed: nextCompleted,
                completedAt: nextCompleted ? new Date() : null,
                updatedAt: new Date(),
              }
            }),
          }
        })
        return {
          previousActive,
          previousPending: undefined,
          previousCompletedQueries: undefined,
          previousJournalQueries: undefined,
        }
      }

      await queryClient.cancelQueries({ queryKey: completedBaseKey })
      await queryClient.cancelQueries({ queryKey: journalBaseKey })

      const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)
      // Get all completed queries (partial match) for snapshot
      const previousCompletedQueries = queryClient.getQueriesData<
        InfiniteData<TodoResponse>
      >({ queryKey: completedBaseKey })
      // Snapshot the journal queries too so onError rolls back the optimistic
      // win insert/remove below.
      const previousJournalQueries = queryClient.getQueriesData<
        InfiniteData<CompletedJournalResponse>
      >({ queryKey: journalBaseKey })

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
          // Stamp completedAt alongside the flip — a completed todo with a null
          // completedAt is an impossible state any timestamp consumer can misread.
          completedAt: new Date(),
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

        // Mirror the win into the permanent journal so it appears in the
        // Completed Tasks list instantly (Main renders completed.journal, not the
        // completed todo.list above). source:'todo' + the real id so the
        // onSettled refetch reconciles to the same row instead of duplicating it.
        const optimisticJournalEntry: DayDetailTask = {
          source: 'todo',
          id,
          title: todoInPending.text,
          completedAt: new Date(),
          category: resolveCategoryFromCache(
            queryClient,
            todoInPending.categoryId,
          ),
        }
        queryClient.setQueriesData<InfiniteData<CompletedJournalResponse>>(
          { queryKey: journalBaseKey },
          (old) => {
            if (!old || !old.pages[0]) return old
            return {
              ...old,
              pages: [
                {
                  ...old.pages[0],
                  entries: [optimisticJournalEntry, ...old.pages[0].entries],
                  total: old.pages[0].total + 1,
                },
                ...old.pages.slice(1),
              ],
            }
          },
        )
      } else {
        // Un-completing removes the win from the permanent journal. This runs
        // regardless of whether the completed todo.list cache is populated in
        // this window — the Main window renders ONLY the journal, so we cannot
        // rely on todoInCompleted below. Presence-guarded so a miss is a no-op.
        queryClient.setQueriesData<InfiniteData<CompletedJournalResponse>>(
          { queryKey: journalBaseKey },
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => {
                const hadEntry = page.entries.some(
                  (entry) => entry.source === 'todo' && entry.id === id,
                )
                if (!hadEntry) return page
                return {
                  ...page,
                  entries: page.entries.filter(
                    (entry) => !(entry.source === 'todo' && entry.id === id),
                  ),
                  total: page.total - 1,
                }
              }),
            }
          },
        )

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
              // Clear completedAt on un-complete so the row doesn't carry a
              // stale completion timestamp while marked incomplete.
              completedAt: null,
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

      return {
        previousActive: undefined,
        previousPending,
        previousCompletedQueries,
        previousJournalQueries,
      }
    },
    onError: (_err, _input, context) => {
      // Retain mode rollback: restore the single active-list snapshot.
      if (isRetaining) {
        if (context?.previousActive) {
          queryClient.setQueryData(pendingKey, context.previousActive)
        }
        return
      }
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
      // Restore the journal queries from snapshot (rolls back the win insert/remove).
      if (context?.previousJournalQueries) {
        for (const [queryKey, data] of context.previousJournalQueries) {
          if (data) {
            queryClient.setQueryData(queryKey, data)
          }
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey })
      queryClient.invalidateQueries({ queryKey: completedBaseKey })
      queryClient.invalidateQueries({ queryKey: journalBaseKey })
      // Refresh category counts (todo moved between pending/completed)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      // Toggling completed↔incomplete changes what's in the skill tree
      // unassigned pool, and un-completing a todo now clears its
      // NodeAssignment (see todo.ts toggleTodo). Without these, Tab A's
      // skill tree view stays stale after a mutation in Tab B.
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getMyTree.key(),
      })
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getUnassignedPool.key(),
      })
      // Heatmap aggregates the same Todo rows that toggle flips. Without
      // these invalidations the heatmap cell color and the DayDetailDialog
      // task list drift out of sync after a toggle until the user reloads.
      queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.dayDetail.key(),
      })
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
      // Deleting a completed todo archives it into Completed (archived:false)
      // before removing the Todo row, so the journal entry migrates from
      // todo-source to completed-source — refetch to reflect the swap.
      queryClient.invalidateQueries({ queryKey: journalBaseKey })
      // Refresh category counts (todo was deleted from a category)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      // Deleting a todo removes it from the skill tree pool and orphans
      // any NodeAssignment (todoId → NULL; snapshot text persists). Both
      // skill tree queries need to refetch so the UI stays coherent.
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getMyTree.key(),
      })
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getUnassignedPool.key(),
      })
      // Deleting a completed todo shrinks the heatmap cell for that day
      // and removes the row from any open DayDetailDialog list.
      queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.dayDetail.key(),
      })
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
      // A completed todo's edited text/category must refresh its journal row.
      queryClient.invalidateQueries({ queryKey: journalBaseKey })
      // Refresh category counts (todo may have changed category)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      // Updating the text of a completed todo changes its label in the
      // skill tree unassigned pool. (Assigned rows use the frozen snapshot
      // and don't update — that's by design.)
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getUnassignedPool.key(),
      })
      broadcastTodoSync()
      broadcastCategorySync()
    },
  })

  // ============================================
  // CLEAR COMPLETED MUTATION - Bulk delete
  // ============================================
  const clearCompletedMutation = useMutation({
    ...orpc.todo.clearCompleted.mutationOptions({}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: pendingKey })

      // Retain mode (居残りモード): completed todos live in the active list
      // (pendingKey), not the suppressed Completed section, so clear removes the
      // completed rows from there optimistically (the server archives them).
      if (isRetaining) {
        const previousActive =
          queryClient.getQueryData<TodoResponse>(pendingKey)
        queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
          if (!old) return old
          const remaining = old.todos.filter((todoRow) => !todoRow.completed)
          return { ...old, todos: remaining, total: remaining.length }
        })
        return { previousActive, previousCompletedQueries: undefined }
      }

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

      return { previousActive: undefined, previousCompletedQueries }
    },
    onSuccess: ({ deletedCount }) => {
      // Quiet end-of-session affirmation (D9 / DESIGN.md "Voice & Microcopy").
      // The cleared completions are ARCHIVED, not lost (the heatmap keeps the
      // day), so this celebrates the work as it is tidied away — silent at 0.
      const affirmation = clearedAffirmation(deletedCount)
      if (affirmation) toast(affirmation)
    },
    onError: (_err, _input, context) => {
      // Retain mode rollback: restore the active-list snapshot.
      if (isRetaining) {
        if (context?.previousActive) {
          queryClient.setQueryData(pendingKey, context.previousActive)
        }
        return
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
      // Clear archives each completion into Completed (archived:false) before
      // removing the Todo, so the journal keeps the wins as completed-source
      // rows (permanent journal, D3) — refetch to reflect the migration.
      queryClient.invalidateQueries({ queryKey: journalBaseKey })
      // Refresh category counts (completed todos were cleared)
      queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
      // clearCompleted wipes every completed todo, which empties the pool
      // and orphans every NodeAssignment row (todoId → NULL). XP persists
      // via the todoText snapshot, but both skill tree queries must
      // refetch so the view reflects the new state.
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getMyTree.key(),
      })
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getUnassignedPool.key(),
      })
      // Wiping all completed todos resets every heatmap cell and empties
      // any open DayDetailDialog list.
      queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.dayDetail.key(),
      })
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

  // #113 data-loss gate, read at the MutationCache level (NOT the observer level).
  // "Tuck into Completed" reuses the delete→archive path, which only archives a row
  // the SERVER already sees as completed; tuck a row whose toggle hasn't committed
  // and it is HARD-DELETED instead — the win is lost, no heatmap credit. A single
  // mutation's `isPending` tracks only the LATEST mutate() call, so a rapid
  // double-check whose commits land out of order could read false while an earlier
  // toggle is still in flight. The cache holds every in-flight toggle independently,
  // so this stays true while ANY toggle is pending — a true superset of isPending.
  const pendingToggleMutations = useMutationState({
    filters: {
      mutationKey: orpc.todo.toggle.key({ type: 'mutation' }),
      status: 'pending',
    },
  })
  const isAnyTogglePending = pendingToggleMutations.length > 0

  return {
    createMutation,
    toggleMutation,
    isAnyTogglePending,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
    reorderMutation,
  }
}

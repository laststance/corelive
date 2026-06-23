'use client'

import { useUser } from '@clerk/nextjs'
import { arrayMove } from '@dnd-kit/helpers'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import React, { useState } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import {
  useAutoSelectDefaultCategory,
  useSelectedCategory,
} from '@/hooks/useSelectedCategory'
import { useSoundFeedback } from '@/hooks/useSoundFeedback'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { subscribeToCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectRetainCompletedInList } from '@/lib/redux/slices/preferencesSlice'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'
import type {
  CategoryColor,
  CategoryWithCount,
} from '@/server/schemas/category'

import { FloatingNavigator, type FloatingTodo } from './FloatingNavigator'
import { SignedOutFloatingCard } from './SignedOutFloatingCard'

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
export const FloatingNavigatorContainer =
  function FloatingNavigatorContainer() {
    const queryClient = useQueryClient()
    const isClerkQueryReady = useClerkQueryReady()
    // Clerk auth gate: drives the signed-out front door vs the live navigator.
    const { isLoaded: isAuthLoaded, isSignedIn } = useUser()

    // Category filter state (shared with main app via localStorage)
    const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
    // 居残りモード (app-wide pref, D11): keep completed todos visible instead of
    // letting them vanish on check. Drives the retain-aware query + mutations.
    const isRetaining = useAppSelector(selectRetainCompletedInList)

    // Mutations with optimistic updates (pass categoryId for correct cache key)
    const {
      createMutation,
      toggleMutation,
      deleteMutation,
      updateMutation,
      reorderMutation,
    } = useTodoMutations(selectedCategoryId, isRetaining)

    // Earned-beat cue for the floating window's task-create gesture (opt-in,
    // default OFF; no-op unless enabled). The complete cue is wired in
    // FloatingNavigator via useCompletionFeedback. Per-window engine → D3 keeps at
    // most one cue in-flight in this window independently of the main window.
    const fireCreate = useSoundFeedback('task-create')

    // Category CRUD mutations with optimistic updates
    const {
      createMutation: categoryCreateMutation,
      updateMutation: categoryUpdateMutation,
      deleteMutation: categoryDeleteMutation,
    } = useCategoryMutations()

    // Local state for optimistic reordering
    const [localPendingTodos, setLocalPendingTodos] = useState<FloatingTodo[]>(
      [],
    )

    // SSR-safe mount detection using useSyncExternalStore
    const isMounted = useMounted()

    // Check if we're in Electron floating navigator environment (for window controls)
    const isFloatingNavigator =
      isMounted && typeof window !== 'undefined' && window.floatingNavigatorAPI

    // Fetch categories for the dropdown
    const { data: categoryData } = useQuery({
      ...orpc.category.list.queryOptions({}),
      enabled: isClerkQueryReady,
    })
    const categories: CategoryWithCount[] = categoryData?.categories ?? []

    // Auto-select the default (General) category when none is selected
    useAutoSelectDefaultCategory(
      selectedCategoryId,
      setSelectedCategoryId,
      categories,
    )

    // Fetch todos filtered by selected category
    const { data, isLoading, error } = useQuery({
      ...orpc.todo.list.queryOptions({
        input: {
          // 居残りモード drops completed:false so completed todos stay in the
          // result (shown in the Completed section) instead of vanishing on
          // check; mirrors the retain-aware pendingKey in useTodoMutations.
          ...(isRetaining ? {} : { completed: false }),
          limit: TODO_QUERY_LIMIT,
          offset: TODO_QUERY_OFFSET,
          ...(selectedCategoryId !== null && {
            categoryId: selectedCategoryId,
          }),
        },
      }),
      enabled: isClerkQueryReady,
      // Keep the previous list painted through the 居残りモード toggle / category
      // refetch so the floating navigator never blank-flashes (L1). No D8 fade
      // machinery lives here, so this is purely the flicker-free smoothing half.
      placeholderData: keepPreviousData,
    })

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
      if (selectedCategoryId === null) return
      createMutation.mutate({
        text: title,
        categoryId: selectedCategoryId,
      })
      // Earned-beat cue on the add gesture (no-op unless the moment is enabled);
      // fired inside the user gesture so the engine can resume audio.
      fireCreate()
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

    /**
     * Creates a new category from the floating navigator.
     * @param name - Category display name (1-30 chars)
     * @param color - One of the predefined color options
     * @example
     * handleCategoryCreate('Work', 'blue')
     */
    const handleCategoryCreate = (name: string, color: CategoryColor) => {
      categoryCreateMutation.mutate({ name, color })
    }

    /**
     * Updates a category name or color from the floating navigator.
     * @param id - Category ID to update
     * @param data - Partial update with name and/or color
     * @example
     * handleCategoryUpdate(1, { name: 'Personal', color: 'green' })
     */
    const handleCategoryUpdate = (
      id: number,
      data: { name?: string; color?: CategoryColor },
    ) => {
      categoryUpdateMutation.mutate({ id, data })
    }

    /**
     * Deletes a category and resets selection if it was the active filter.
     * The server reassigns orphaned todos to the default (General) category.
     * @param id - Category ID to delete
     * @example
     * handleCategoryDelete(3)
     */
    const handleCategoryDelete = (id: number) => {
      categoryDeleteMutation.mutate({ id })
      // If the deleted category was the active filter, clear selection
      // so useAutoSelectDefaultCategory picks the General category
      if (id === selectedCategoryId) {
        setSelectedCategoryId(null)
      }
    }

    // Transform todos to FloatingTodo format
    const todosFromQuery: FloatingTodo[] = (data?.todos ?? []).map((todo) => ({
      id: todo.id.toString(),
      text: todo.text,
      completed: todo.completed,
      createdAt: new Date(todo.createdAt),
    }))

    // Sync local state with query data when it changes
    useCycleEffect(() => {
      setLocalPendingTodos(todosFromQuery.filter((t) => !t.completed))
    }, [todosFromQuery])

    // Use local state for pending todos to enable optimistic reordering
    const pendingTodos = localPendingTodos
    const completedTodos = todosFromQuery.filter((t) => t.completed)

    // Combine for passing to FloatingNavigator
    const todos = [...pendingTodos, ...completedTodos]

    useCycleEffect(() => {
      // Cross-window sync: BrainDump + Home todo completions also write to the
      // Completed table, so the heatmap + day-detail caches must invalidate
      // alongside the todo list. Mirrors TodoList.tsx — without these two keys,
      // the floating navigator would silently miss completion deltas after a
      // refresh (Codex review HIGH).
      return subscribeToTodoSync(() => {
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
        queryClient.invalidateQueries({
          queryKey: orpc.completed.heatmap.key(),
        })
        queryClient.invalidateQueries({
          queryKey: orpc.completed.dayDetail.key(),
        })
      })
    }, [queryClient])

    // Cross-window category sync
    useCycleEffect(() => {
      return subscribeToCategorySync(() => {
        queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
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

    // Auth gate: hold a calm loading state until Clerk resolves, then show the
    // signed-out front door (this window is the sign-in surface now that the
    // main window is gone) or fall through to the live navigator. A native OAuth
    // sign-in re-renders this in place — no reload.
    if (!isAuthLoaded) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      )
    }
    if (!isSignedIn) {
      return <SignedOutFloatingCard />
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
            type="button"
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
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onCategoryChange={setSelectedCategoryId}
        onCategoryCreate={handleCategoryCreate}
        onCategoryUpdate={handleCategoryUpdate}
        onCategoryDelete={handleCategoryDelete}
        isCategoryCreatePending={categoryCreateMutation.isPending}
        isCategoryUpdatePending={categoryUpdateMutation.isPending}
        isCategoryDeletePending={categoryDeleteMutation.isPending}
      />
    )
  }

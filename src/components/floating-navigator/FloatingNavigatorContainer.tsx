'use client'

import { arrayMove } from '@dnd-kit/helpers'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useMemo, useState } from 'react'

import { useMounted } from '@/hooks/use-mounted'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useComponentEffect } from '@/hooks/useComponentEffect'
import {
  useAutoSelectDefaultCategory,
  useSelectedCategory,
} from '@/hooks/useSelectedCategory'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { subscribeToCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'
import type {
  CategoryColor,
  CategoryWithCount,
} from '@/server/schemas/category'

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
export const FloatingNavigatorContainer = React.memo(
  function FloatingNavigatorContainer() {
    const queryClient = useQueryClient()
    const isClerkQueryReady = useClerkQueryReady()

    // Category filter state (shared with main app via localStorage)
    const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()

    // Mutations with optimistic updates (pass categoryId for correct cache key)
    const {
      createMutation,
      toggleMutation,
      deleteMutation,
      updateMutation,
      reorderMutation,
    } = useTodoMutations(selectedCategoryId)

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
          completed: false,
          limit: TODO_QUERY_LIMIT,
          offset: TODO_QUERY_OFFSET,
          ...(selectedCategoryId !== null && {
            categoryId: selectedCategoryId,
          }),
        },
      }),
      enabled: isClerkQueryReady,
    })

    /**
     * Toggles completion state for a floating navigator task.
     * @param id - Todo identifier as a string.
     * @returns
     * - No return value; the mutation updates server state.
     * @example
     * handleTaskToggle('42')
     */
    const handleTaskToggle = useCallback(
      (id: string) => {
        const todoId = parseInt(id, DECIMAL_RADIX)
        if (!isNaN(todoId)) {
          toggleMutation.mutate({ id: todoId })
        }
      },
      [toggleMutation],
    )

    /**
     * Creates a new task from the floating navigator input.
     * @param title - Task title to create.
     * @returns
     * - No return value; the mutation updates server state.
     * @example
     * handleTaskCreate('Write report')
     */
    const handleTaskCreate = useCallback(
      (title: string) => {
        if (selectedCategoryId === null) return
        createMutation.mutate({
          text: title,
          categoryId: selectedCategoryId,
        })
      },
      [createMutation, selectedCategoryId],
    )

    /**
     * Updates a task title from the floating navigator.
     * @param id - Todo identifier as a string.
     * @param title - New task title.
     * @returns
     * - No return value; the mutation updates server state.
     * @example
     * handleTaskEdit('42', 'Updated title')
     */
    const handleTaskEdit = useCallback(
      (id: string, title: string) => {
        const todoId = parseInt(id, DECIMAL_RADIX)
        if (!isNaN(todoId)) {
          updateMutation.mutate({ id: todoId, data: { text: title } })
        }
      },
      [updateMutation],
    )

    /**
     * Deletes a task from the floating navigator.
     * @param id - Todo identifier as a string.
     * @returns
     * - No return value; the mutation updates server state.
     * @example
     * handleTaskDelete('42')
     */
    const handleTaskDelete = useCallback(
      (id: string) => {
        const todoId = parseInt(id, DECIMAL_RADIX)
        if (!isNaN(todoId)) {
          deleteMutation.mutate({ id: todoId })
        }
      },
      [deleteMutation],
    )

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
    const handleTaskReorder = useCallback(
      (activeId: string, overId: string) => {
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
      },
      [localPendingTodos, reorderMutation],
    )

    /**
     * Creates a new category from the floating navigator.
     * @param name - Category display name (1-30 chars)
     * @param color - One of the predefined color options
     * @example
     * handleCategoryCreate('Work', 'blue')
     */
    const handleCategoryCreate = useCallback(
      (name: string, color: CategoryColor) => {
        categoryCreateMutation.mutate({ name, color })
      },
      [categoryCreateMutation],
    )

    /**
     * Updates a category name or color from the floating navigator.
     * @param id - Category ID to update
     * @param data - Partial update with name and/or color
     * @example
     * handleCategoryUpdate(1, { name: 'Personal', color: 'green' })
     */
    const handleCategoryUpdate = useCallback(
      (id: number, data: { name?: string; color?: CategoryColor }) => {
        categoryUpdateMutation.mutate({ id, data })
      },
      [categoryUpdateMutation],
    )

    /**
     * Deletes a category and resets selection if it was the active filter.
     * The server reassigns orphaned todos to the default (General) category.
     * @param id - Category ID to delete
     * @example
     * handleCategoryDelete(3)
     */
    const handleCategoryDelete = useCallback(
      (id: number) => {
        categoryDeleteMutation.mutate({ id })
        // If the deleted category was the active filter, clear selection
        // so useAutoSelectDefaultCategory picks the General category
        if (id === selectedCategoryId) {
          setSelectedCategoryId(null)
        }
      },
      [categoryDeleteMutation, selectedCategoryId, setSelectedCategoryId],
    )

    // Transform todos to FloatingTodo format
    const todosFromQuery: FloatingTodo[] = useMemo(
      () =>
        (data?.todos ?? []).map((todo) => ({
          id: todo.id.toString(),
          text: todo.text,
          completed: todo.completed,
          createdAt: new Date(todo.createdAt),
        })),
      [data],
    )

    // Sync local state with query data when it changes
    useComponentEffect(() => {
      setLocalPendingTodos(todosFromQuery.filter((t) => !t.completed))
    }, [todosFromQuery])

    // Use local state for pending todos to enable optimistic reordering
    const pendingTodos = localPendingTodos
    const completedTodos = useMemo(
      () => todosFromQuery.filter((t) => t.completed),
      [todosFromQuery],
    )

    // Combine for passing to FloatingNavigator
    const todos = useMemo(
      () => [...pendingTodos, ...completedTodos],
      [completedTodos, pendingTodos],
    )

    useComponentEffect(() => {
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
    useComponentEffect(() => {
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
  },
)

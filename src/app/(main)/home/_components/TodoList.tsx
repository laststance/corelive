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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { useStreakNotifications } from '@/hooks/useStreakNotifications'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { orpc } from '@/lib/orpc/client-query'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'
import type { CategoryWithCount } from '@/server/schemas/category'

import { AddTodoForm } from './AddTodoForm'
import { CategoryFilterChips } from './CategoryFilterChips'
import { CompletedTodos } from './CompletedTodos'
import { ContributionGraph } from './ContributionGraph'
import { SortableTodoItem } from './SortableTodoItem'
import { SundayDigestCard } from './SundayDigestCard'
import type { Todo } from './TodoItem'
import { WeeklySummaryCard } from './WeeklySummaryCard'
import { YearInReviewModal } from './YearInReviewModal'

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
  // Track if persister is still restoring cached data - prevents hydration mismatch
  const isRestoring = useIsRestoring()
  const isClerkQueryReady = useClerkQueryReady()

  // Category filter state (persisted to localStorage)
  const [selectedCategoryId] = useSelectedCategory()

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

  // Mutations with optimistic updates (pass categoryId for correct cache key)
  const {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
    reorderMutation,
  } = useTodoMutations(selectedCategoryId)

  // Local state for optimistic reordering
  const [localPendingTodos, setLocalPendingTodos] = useState<Todo[]>([])

  // Fetch categories for name/color lookup
  const { data: categoryData } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })
  const categoryMap = useMemo(
    () =>
      new Map<number, CategoryWithCount>(
        (categoryData?.categories ?? []).map((c) => [c.id, c]),
      ),
    [categoryData],
  )

  // Fetch pending todos (filtered by selected category)
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    ...orpc.todo.list.queryOptions({
      input: {
        completed: false,
        limit: TODO_QUERY_LIMIT,
        offset: TODO_QUERY_OFFSET,
        ...(selectedCategoryId !== null && { categoryId: selectedCategoryId }),
      },
    }),
    enabled: isClerkQueryReady,
  })

  // Heatmap data shared with WeeklySummaryCard + SundayDigestCard + the
  // streak-notification hook (React Query dedupes the underlying request
  // with ContributionGraph's own useHeatmapData() call, so the extra
  // consumers do not add network round-trips).
  const { dataByDate: heatmapByDate, isLoading: heatmapLoading } =
    useHeatmapData()

  // Streak milestone notifications (Electron-only; no-ops in the web build).
  // The hook is fire-and-forget — localStorage dedupes per-tier so a single
  // crossing of 7/30/100/365 days fires the macOS banner exactly once.
  // `isRestoring` is passed so the effect waits for the TanStack persister
  // before reading data — a stale cached snapshot must not fire a wrong
  // tier and latch the localStorage max permanently.
  useStreakNotifications({
    dataByDate: heatmapByDate,
    isLoading: heatmapLoading,
    isRestoring,
  })

  /**
   * Adds a new todo item using the create mutation.
   * Always assigns the currently selected category (auto-selected to General on load).
   * @param text - Todo title to create.
   * @param notes - Optional notes to attach to the todo.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * addTodo('Buy milk')
   */
  const addTodo = (text: string, notes?: string) => {
    if (selectedCategoryId === null) return
    createMutation.mutate({
      text,
      notes,
      categoryId: selectedCategoryId,
    })
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

    return todos.map((todo) => {
      const category = todo.categoryId ? categoryMap.get(todo.categoryId) : null
      return {
        id: todo.id.toString(),
        text: todo.text,
        completed: todo.completed,
        createdAt: new Date(todo.createdAt),
        notes: todo.notes,
        categoryId: todo.categoryId,
        categoryName: category?.name ?? null,
        categoryColor: category?.color ?? null,
      }
    })
  }

  const pendingTodosFromQuery = mapTodos(pendingData?.todos)

  // Sync local state with query data when it changes
  useEffect(() => {
    setLocalPendingTodos(pendingTodosFromQuery)
  }, [pendingData])

  // Use local state for rendering to enable optimistic reordering
  const pendingTodos = localPendingTodos

  /**
   * Handles drag end event to reorder todos.
   * Updates local state optimistically and syncs with server.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = pendingTodos.findIndex((todo) => todo.id === active.id)
    const newIndex = pendingTodos.findIndex((todo) => todo.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Optimistically update local state
    const reorderedTodos = arrayMove(pendingTodos, oldIndex, newIndex)
    setLocalPendingTodos(reorderedTodos)

    // Build reorder items with new order values
    const items = reorderedTodos.map((todo, index) => ({
      id: parseInt(todo.id, DECIMAL_RADIX),
      order: index,
    }))

    // Call reorder mutation
    reorderMutation.mutate({ items })
  }

  useEffect(() => {
    // Cross-window sync: BrainDump / Floating Navigator completions broadcast
    // via the BroadcastChannel and also write to the Completed table, so the
    // Home heatmap + day-detail caches need invalidation alongside the todo
    // list. Without these two extra keys, completing a task in BrainDump
    // leaves the main heatmap stale until reload (Codex review HIGH).
    return subscribeToTodoSync(() => {
      queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.dayDetail.key(),
      })
    })
  }, [queryClient])

  // Show loading during initial query OR while persister restores cached data
  // This ensures server-rendered HTML matches client hydration (prevents hydration error)
  if (!isClerkQueryReady || pendingLoading || isRestoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Pending Tasks Column */}
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
            <AddTodoForm
              onAddTodo={addTodo}
              disabled={selectedCategoryId === null}
            />
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pendingTodos.map((todo) => todo.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {pendingTodos.map((todo) => (
                  <SortableTodoItem
                    key={todo.id}
                    todo={todo}
                    onToggleComplete={toggleComplete}
                    onDelete={deleteTodo}
                    onUpdateNotes={updateNotes}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Completed Tasks Column */}
      <div className="space-y-6">
        {/* Suspense required because ContributionGraph + YearInReviewModal read URL params via Next.js 16's useSearchParams — fallback matches its own isLoading skeleton so the prerender phase is shape-identical. */}
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Activity
                </CardTitle>
                <CardDescription>Loading activity data...</CardDescription>
              </CardHeader>
            </Card>
          }
        >
          <ContributionGraph />
          <YearInReviewModal
            dataByDate={heatmapByDate}
            isLoading={heatmapLoading}
            isRestoring={isRestoring}
          />
        </Suspense>
        <WeeklySummaryCard
          dataByDate={heatmapByDate}
          isLoading={heatmapLoading}
        />
        <CategoryFilterChips
          dataByDate={heatmapByDate}
          isLoading={heatmapLoading}
        />
        <SundayDigestCard
          dataByDate={heatmapByDate}
          isLoading={heatmapLoading}
        />
        <CompletedTodos
          onDelete={deleteTodo}
          onClearCompleted={deleteCompleted}
          onToggleComplete={toggleComplete}
        />
      </div>
    </div>
  )
}

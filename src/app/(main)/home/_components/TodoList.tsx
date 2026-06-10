'use client'
import { arrayMove } from '@dnd-kit/helpers'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import { memo, Suspense, useCallback, useMemo, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { useStreakNotifications } from '@/hooks/useStreakNotifications'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { todoSortableSensors } from '@/lib/dnd-kit-sensors'
import { orpc } from '@/lib/orpc/client-query'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectRetainCompletedInList } from '@/lib/redux/slices/preferencesSlice'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'
import type { CategoryWithCount } from '@/server/schemas/category'

import { AddTodoForm } from './AddTodoForm'
import { CategoryFilterChips } from './CategoryFilterChips'
import { CompletedTodos } from './CompletedTodos'
import { ContributionGraph } from './ContributionGraph'
import { SortableTodoItem } from './SortableTodoItem'
import { SundayDigestCard } from './SundayDigestCard'
import { TodoImportEntry } from './TodoImportEntry'
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
export const TodoList = memo(function TodoList() {
  const queryClient = useQueryClient()
  // Track if persister is still restoring cached data - prevents hydration mismatch
  const isRestoring = useIsRestoring()
  const isClerkQueryReady = useClerkQueryReady()

  // Category filter state (persisted to localStorage)
  const [selectedCategoryId] = useSelectedCategory()
  // 居残りモード (keep completed todos in the active list) — drives the
  // retain-aware query input + cache keys below.
  const isRetaining = useAppSelector(selectRetainCompletedInList)

  // Mutations with optimistic updates (pass categoryId for correct cache key)
  const {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
    reorderMutation,
    deleteCompletedWithUndo,
  } = useTodoMutations(selectedCategoryId, isRetaining)

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
        // 居残りモード drops the completed:false filter so the active list holds
        // ALL todos (pending + completed-since-clear); MUST mirror the
        // retain-aware pendingKey in useTodoMutations or optimistic updates miss.
        ...(isRetaining ? {} : { completed: false }),
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
  const addTodo = useCallback(
    (text: string, notes?: string) => {
      if (selectedCategoryId === null) return
      createMutation.mutate({
        text,
        notes,
        categoryId: selectedCategoryId,
      })
    },
    [createMutation, selectedCategoryId],
  )

  /**
   * Toggles completion status for the given todo.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * toggleComplete('42')
   */
  const toggleComplete = useCallback(
    (id: string) => {
      const todoId = parseInt(id, DECIMAL_RADIX)
      if (!isNaN(todoId)) {
        toggleMutation.mutate({ id: todoId })
      }
    },
    [toggleMutation],
  )

  /**
   * Deletes the specified todo item.
   * @param id - Todo identifier as a string.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * deleteTodo('42')
   */
  const deleteTodo = useCallback(
    (id: string) => {
      const todoId = parseInt(id, DECIMAL_RADIX)
      if (!isNaN(todoId)) {
        deleteMutation.mutate({ id: todoId })
      }
    },
    [deleteMutation],
  )

  /**
   * Deletes a COMPLETED todo with a 5s Undo toast (D3). The row is removed
   * optimistically; the server archive-then-delete commits only when the undo
   * window closes, so the heatmap day is preserved and Undo fully restores it.
   * @param id - Todo identifier as a string.
   * @example deleteCompletedTodo('42')
   */
  const deleteCompletedTodo = useCallback(
    (id: string) => {
      const todoId = parseInt(id, DECIMAL_RADIX)
      if (!isNaN(todoId)) {
        deleteCompletedWithUndo(todoId)
      }
    },
    [deleteCompletedWithUndo],
  )

  /**
   * Updates the notes for a specific todo item.
   * @param id - Todo identifier as a string.
   * @param notes - New notes content.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * updateNotes('42', 'Call supplier')
   */
  const updateNotes = useCallback(
    (id: string, notes: string) => {
      const todoId = parseInt(id, DECIMAL_RADIX)
      if (!isNaN(todoId)) {
        updateMutation.mutate({ id: todoId, data: { notes } })
      }
    },
    [updateMutation],
  )

  /**
   * Clears all completed todos via the bulk delete mutation.
   * @returns
   * - No return value; the mutation updates server state.
   * @example
   * deleteCompleted()
   */
  const deleteCompleted = useCallback(() => {
    clearCompletedMutation.mutate({})
  }, [clearCompletedMutation])

  // Retain-mode Clear confirmation: Clear is the ONLY way to remove
  // completed-retained rows (D14 hides the per-row trash) and it archives the
  // whole done-list in one click, so it confirms first — matching the safety of
  // CompletedTodos' clear and the per-item Undo toast (advisor).
  const [retainClearDialogOpen, setRetainClearDialogOpen] = useState(false)
  const handleRetainClearClick = useCallback(() => {
    setRetainClearDialogOpen(true)
  }, [])
  const handleRetainClearDialogOpenChange = useCallback((open: boolean) => {
    setRetainClearDialogOpen(open)
  }, [])
  const handleConfirmRetainClear = useCallback(() => {
    deleteCompleted()
    setRetainClearDialogOpen(false)
  }, [deleteCompleted])

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

  const pendingTodosFromQuery = useMemo(
    () => mapTodos(pendingData?.todos),
    [pendingData?.todos, categoryMap],
  )

  // Sync local state with query data when it changes
  useCycleEffect(() => {
    setLocalPendingTodos(pendingTodosFromQuery)
  }, [pendingTodosFromQuery])

  // Use local state for rendering to enable optimistic reordering
  const pendingTodos = localPendingTodos
  // In retain mode the active list holds completed todos too; split the counts
  // so the header reads honestly (pending count) and can surface a quiet
  // "N done" (D6). In non-retain mode completedInListCount is always 0.
  const completedInListCount = pendingTodos.filter(
    (todoRow) => todoRow.completed,
  ).length
  const pendingCount = pendingTodos.length - completedInListCount

  /**
   * Handles drag end event to reorder todos.
   * Updates local state optimistically and syncs with server.
   * @param event - Latest dnd-kit drag-end event from DragDropProvider.
   * @returns
   * - No return value; invalid drops exit early and valid drops reorder tasks.
   * @example
   * handleDragEnd(event)
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) {
        return
      }

      const { source } = event.operation

      if (!isSortable(source) || source.initialIndex === source.index) {
        return
      }

      const oldIndex = source.initialIndex
      const newIndex = source.index

      if (
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= pendingTodos.length ||
        newIndex >= pendingTodos.length
      ) {
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
    },
    [pendingTodos, reorderMutation],
  )

  useCycleEffect(() => {
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
                {pendingCount} pending
              </Badge>
            </CardTitle>
            <CardDescription>Manage your tasks efficiently</CardDescription>
            {/* 居残りモード — quiet "N done" count + Clear (archives completed,
                keeping them on the heatmap). Hidden entirely when nothing is
                done (D6); the count is ambient, not an assertive live region. */}
            {isRetaining && completedInListCount > 0 && (
              <div className="flex items-center justify-between pt-2">
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {completedInListCount} done
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRetainClearClick}
                  className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <AddTodoForm
              onAddTodo={addTodo}
              disabled={selectedCategoryId === null}
            />
            {/* Active-Todo-zone Import entry (D4) — next to the Add form. */}
            <div className="flex justify-end">
              <TodoImportEntry />
            </div>
          </CardContent>
        </Card>

        {pendingTodos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <Circle className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                No pending tasks. Add a new task to get started.
              </p>
              {/* Empty-state discoverability for bulk import. */}
              <TodoImportEntry variant="inline" />
            </CardContent>
          </Card>
        ) : (
          <DragDropProvider
            sensors={todoSortableSensors}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-3">
              {pendingTodos.map((todo, index) => (
                <SortableTodoItem
                  key={todo.id}
                  todo={todo}
                  index={index}
                  onToggleComplete={toggleComplete}
                  onDelete={deleteTodo}
                  onUpdateNotes={updateNotes}
                />
              ))}
            </div>
          </DragDropProvider>
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
        {/* In 居残りモード completed todos live in the active list above, so the
            separate Completed section is suppressed (no double display). */}
        {!isRetaining && (
          <CompletedTodos
            onDelete={deleteCompletedTodo}
            onClearCompleted={deleteCompleted}
            onToggleComplete={toggleComplete}
          />
        )}
      </div>

      {/* Retain-mode Clear confirmation — Clear is the only path to remove
          completed-retained rows (D14 hides the per-row trash) and it archives
          the whole done-list at once, so it confirms first (mirrors the
          CompletedTodos clear dialog). Archiving keeps every completion on the
          heatmap. */}
      <AlertDialog
        open={retainClearDialogOpen}
        onOpenChange={handleRetainClearDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear finished tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears {completedInListCount} finished task
              {completedInListCount !== 1 ? 's' : ''} from your list. They stay
              counted on your heatmap — clearing only tidies the list, it
              doesn&apos;t erase the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRetainClear}>
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})

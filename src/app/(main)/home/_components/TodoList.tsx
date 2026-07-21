'use client'
import { arrayMove } from '@dnd-kit/helpers'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import {
  keepPreviousData,
  useIsRestoring,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Circle } from 'lucide-react'
import { Suspense, useMemo, useRef, useState } from 'react'

import { Grid } from '@/components/grid'
import { ImportUndoBanner } from '@/components/import/ImportUndoBanner'
import { PasteImport } from '@/components/import/PasteImport'
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
import { useMounted } from '@/hooks/use-mounted'
import { useUpdateEffect } from '@/hooks/use-update-effect'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useHeatmapData } from '@/hooks/useHeatmapData'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { useSoundFeedback } from '@/hooks/useSoundFeedback'
import { useStreakNotifications } from '@/hooks/useStreakNotifications'
import { useTodoMutations } from '@/hooks/useTodoMutations'
import { useTodoPasteImport } from '@/hooks/useTodoPasteImport'
import { todoSortableSensors } from '@/lib/dnd-kit-sensors'
import { orpc } from '@/lib/orpc/client-query'
import {
  buildHomeTodoListInput,
  resolveHomeSelectedCategoryId,
} from '@/lib/query/homeBootstrapQueries'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectRetainCompletedInList } from '@/lib/redux/slices/settingsSlice'
import { subscribeToTodoSync } from '@/lib/todo-sync-channel'
import type { CategoryWithCount } from '@/server/schemas/category'

import { AddTodoForm } from './AddTodoForm'
import { COMPLETED_DROPZONE_ID, CompletedDropZone } from './CompletedDropZone'
import { CompletedTodos } from './CompletedTodos'
import { ContributionGraph } from './ContributionGraph'
import {
  EMPTY_TODO_ID_SET,
  RETROACTIVE_POPULATE_FADE_MS,
  selectNewlyPresentCompletedTodoIds,
} from './retroactivePopulateFade'
import { SortableTodoItem } from './SortableTodoItem'
import { SundayDigestCard } from './SundayDigestCard'
import type { Todo } from './TodoItem'
import { WeeklySummaryCard } from './WeeklySummaryCard'
import { YearInReviewModal } from './YearInReviewModal'

const DECIMAL_RADIX = 10

/**
 * Converts raw API todo payloads into UI-ready Todo objects, enriching each row
 * with its category name/color from the lookup map. Hoisted to module scope (and
 * taking `categoryMap` as an argument instead of a closure) so a `useMemo` caller
 * can key it on stable inputs WITHOUT this function becoming a memo dependency —
 * an in-component closure here would force exhaustive-deps to list it, bust the
 * memo every render, and re-open the /home re-render loop this extraction fixes.
 * @param todos - Raw todo payloads from the API (unknown until array-checked).
 * @param categoryMap - id → category lookup for name/color enrichment.
 * @returns
 * - A normalized list of Todo objects
 * - An empty list when the input is not an array
 * @example
 * mapTodos([{ id: 1, text: 'A', completed: false, createdAt: Date.now() }], new Map())
 * // => [{ id: '1', text: 'A', completed: false, createdAt: Date, ... }]
 */
function mapTodos(
  todos: unknown,
  categoryMap: Map<number, CategoryWithCount>,
): Todo[] {
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

/**
 * Renders the primary todo list view with pending and completed tasks.
 * @returns
 * - The todo list UI for the home screen
 * @example
 * <TodoList />
 */
export const TodoList = function TodoList() {
  const queryClient = useQueryClient()
  // Track if persister is still restoring cached data - prevents hydration mismatch
  const isRestoring = useIsRestoring()
  const isClerkQueryReady = useClerkQueryReady()
  // Keeps SSR HTML and the hydration pass on the Loading gate below — the full
  // tree renders locale-dependent dates (journal day grouping) that a UTC
  // server pass would mismatch against the browser's zone.
  const isMounted = useMounted()

  // Category filter state (persisted to localStorage)
  const [selectedCategoryId] = useSelectedCategory()
  // 居残りモード (keep completed todos in the active list) — drives the
  // retain-aware query input + cache keys below.
  const isRetaining = useAppSelector(selectRetainCompletedInList)

  // Fetch categories first so a fresh browser and the SSR bootstrap resolve
  // the same default-category Todo query key before Clerk enables requests.
  const { data: categoryData, isPending: isCategoryPending } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })
  const effectiveSelectedCategoryId =
    resolveHomeSelectedCategoryId(
      selectedCategoryId,
      categoryData?.categories ?? [],
    ) ?? null
  // A fresh browser must resolve its default category before the Todo request;
  // explicit selections and a settled category fallback can proceed directly.
  const isPendingTodoQueryReady =
    isClerkQueryReady && (selectedCategoryId !== null || !isCategoryPending)

  // Mutations with optimistic updates (pass categoryId for correct cache key)
  const {
    createMutation,
    toggleMutation,
    isAnyTogglePending,
    deleteMutation,
    updateMutation,
    clearCompletedMutation,
    reorderMutation,
  } = useTodoMutations(effectiveSelectedCategoryId, isRetaining)

  // Earned-beat sound cues (opt-in, default OFF) fired on the create + clear
  // gestures below. Each is a no-op unless its moment is enabled in Settings, so
  // the seams call them unconditionally. The `complete` cue lives in TodoItem via
  // useCompletionFeedback; D3 keeps at most one cue in-flight per window.
  const fireCreate = useSoundFeedback('task-create')
  const fireClear = useSoundFeedback('clear')

  // Local state for optimistic reordering
  const [localPendingTodos, setLocalPendingTodos] = useState<Todo[]>([])

  // Memoized on the query data so the map reference only changes when the
  // categories actually change. A fresh Map every render would bust the
  // `pendingTodosFromQuery` memo below (it depends on this), re-opening the
  // idle re-render loop on /home.
  const categoryMap = useMemo(
    () =>
      new Map<number, CategoryWithCount>(
        (categoryData?.categories ?? []).map((c) => [c.id, c]),
      ),
    [categoryData?.categories],
  )

  // Bulk paste-import controller (Issue #110): a multi-line paste into the Add
  // form opens a seeded confirm dialog; shared with the Floating Navigator.
  const pasteImport = useTodoPasteImport()

  // Fetch pending todos (filtered by selected category)
  const {
    data: pendingData,
    isLoading: pendingLoading,
    // True while the kept-previous list is on screen during a refetch (the
    // 居残りモード toggle and category switches change the query input). The D8
    // fade keys off this to tell the STALE placeholder render apart from the
    // settled one — see the retroactive-populate effect below.
    isPlaceholderData: isPendingPlaceholderData,
  } = useQuery({
    ...orpc.todo.list.queryOptions({
      // Shared builder keeps SSR, this query, and optimistic mutations on the
      // same order-sensitive oRPC key.
      input: buildHomeTodoListInput(effectiveSelectedCategoryId, isRetaining),
    }),
    enabled: isPendingTodoQueryReady,
    // Keep the previous list painted while the toggle/category refetch is in
    // flight so the pending rows never blank-flash; the completed-since-clear
    // rows arrive with the settled result and fade IN over them (L1 + D8).
    placeholderData: keepPreviousData,
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
    if (effectiveSelectedCategoryId === null) return
    createMutation.mutate({
      text,
      notes,
      categoryId: effectiveSelectedCategoryId,
    })
    // Earned-beat cue on the add gesture (no-op unless the moment is enabled);
    // fired here, inside the user gesture, so the engine can resume audio.
    fireCreate()
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
    // Earned-beat cue on the clear gesture (no-op unless the moment is enabled).
    // Both clear paths route through here — the direct CompletedTodos "Clear" and
    // the retain-mode confirm dialog — so one fire() covers both.
    fireClear()
  }

  // Retain-mode Clear confirmation: Clear is the ONLY way to remove
  // completed-retained rows (D14 hides the per-row trash) and it archives the
  // whole done-list in one click, so it confirms first — matching the safety of
  // CompletedTodos' clear and the per-item Undo toast (advisor).
  const [retainClearDialogOpen, setRetainClearDialogOpen] = useState(false)
  const handleRetainClearClick = () => {
    setRetainClearDialogOpen(true)
  }
  const handleRetainClearDialogOpenChange = (open: boolean) => {
    setRetainClearDialogOpen(open)
  }
  const handleConfirmRetainClear = () => {
    deleteCompleted()
    setRetainClearDialogOpen(false)
  }

  // Derived list for rendering, memoized on the STABLE query inputs (TanStack
  // keeps `pendingData.todos` referentially stable via structural sharing) so
  // the reference changes only when the data actually changes. Mapping in render
  // with a fresh array (the prior code) made the sync effect below — and the D8
  // fade effect further down — see new deps every render → setState → re-render
  // → an idle re-render loop that starved App Router's low-priority navigation
  // transition, so Settings / Skill-tree never opened from /home. `mapTodos` is
  // module-scope so it is not a memo dependency. (Investigated 2026-06-24.)
  const pendingTodosFromQuery = useMemo(
    () => mapTodos(pendingData?.todos, categoryMap),
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

  // ── 居残りモード retroactive-populate fade (D8) ───────────────────────────
  // Flipping 居残りモード ON refetches the active list WITH completed-since-clear
  // rows; those should fade IN gently (DESIGN.md enter, motion-safe). An in-place
  // check must stay quiet (D7), so we fade only rows that are NEWLY present vs the
  // previous render — never a row that was already on screen and merely flipped to
  // completed. The completed rows land a few renders after the toggle (the toggle
  // changes the query input → refetch), so we ARM on the OFF→ON transition and
  // play the fade when they actually arrive. Enter-only by design: ON→OFF removes
  // the rows instantly. A symmetric fade-OUT (L6) is deferred — an in-place exit
  // needs the leaving rows to hold their INTERLEAVED positions while they fade, but
  // those rows are sortables registered by positional `index` (@dnd-kit/react 0.4,
  // see SortableTodoItem); keeping them mounted to fade desyncs that index from the
  // data array. A CSS ghost (pollutes counts/dnd/sync) and Radix Presence (keeps
  // useSortable mounted → same index drift) don't escape it. The enter fade carries
  // the affirmation; ON→OFF is a deliberate "hide" where instant removal reads right.
  const previousVisibleTodoIdsRef =
    useRef<ReadonlySet<string>>(EMPTY_TODO_ID_SET)
  const [retroactivePopulateFadeIds, setRetroactivePopulateFadeIds] =
    useState<ReadonlySet<string>>(EMPTY_TODO_ID_SET)
  // Armed ONLY by an OFF→ON toggle; ON→OFF clears it so a stale arm can't replay.
  const retroactivePopulateArmedRef = useRef(false)

  useUpdateEffect(() => {
    retroactivePopulateArmedRef.current = isRetaining
  }, [isRetaining])

  // After the toggle's refetch settles, fade the rows it surfaced — once. The
  // newly-present diff excludes in-place checks even within the armed window, so
  // checking a task right after toggling ON (with nothing else done) stays quiet.
  //
  // Diffed against pendingTodosFromQuery (the raw query snapshot), NOT pendingTodos
  // (= localPendingTodos, which lags it by one render through the optimistic-reorder
  // buffer). With keepPreviousData the settle and the isPlaceholderData=false signal
  // land on the SAME query snapshot, so keying off the query list keeps the diff and
  // the placeholder gate in lockstep — diffing the lagged list would let the stale
  // placeholder render disarm before the completed rows arrive and swallow the fade.
  useCycleEffect(() => {
    if (retroactivePopulateArmedRef.current) {
      const newlyPresentCompletedIds = selectNewlyPresentCompletedTodoIds(
        pendingTodosFromQuery,
        previousVisibleTodoIdsRef.current,
      )
      if (newlyPresentCompletedIds.length > 0) {
        retroactivePopulateArmedRef.current = false
        setRetroactivePopulateFadeIds(new Set(newlyPresentCompletedIds))
      } else if (
        pendingTodosFromQuery.length > 0 &&
        !isPendingPlaceholderData
      ) {
        // Settled (fresh, not the kept-previous placeholder) with rows but none
        // surfaced — consume the arm so a later unrelated diff (an imported/synced
        // completed row) can't replay the fade. The !isPendingPlaceholderData gate
        // is load-bearing under keepPreviousData: the placeholder render shows the
        // PRE-toggle list (no completed rows yet), so disarming there would consume
        // the arm one render before the real completed rows land.
        retroactivePopulateArmedRef.current = false
      }
    }
    previousVisibleTodoIdsRef.current = new Set(
      pendingTodosFromQuery.map((todoRow) => todoRow.id),
    )
  }, [pendingTodosFromQuery, isPendingPlaceholderData])

  // Strip the fade class once the enter animation has played, so a later
  // re-render/remount (reorder, cross-window sync) can't replay it.
  useUpdateEffect(() => {
    if (retroactivePopulateFadeIds.size === 0) return
    const fadeCleanupTimer = setTimeout(
      () => setRetroactivePopulateFadeIds(EMPTY_TODO_ID_SET),
      RETROACTIVE_POPULATE_FADE_MS,
    )
    return () => clearTimeout(fadeCleanupTimer)
  }, [retroactivePopulateFadeIds])

  /**
   * Resolves a dnd-kit drag-end into one of two outcomes — tuck a finished task
   * into Completed (drop on the #113 CompletedDropZone) or reorder the active
   * list — committing optimistically then syncing the server. Fired by
   * DragDropProvider's onDragEnd.
   * @param event - Latest dnd-kit drag-end event from DragDropProvider.
   * @returns
   * - No return value.
   * - Drop on the Completed zone: archives the row when it is completed AND its
   *   completion has committed; a pending row — or one whose toggle is still in
   *   flight — is a no-op (deleteTodo would hard-delete it — data loss).
   * - Otherwise: reorders the active list, or exits early on a canceled/invalid drop.
   * @example
   * handleDragEnd(event)
   */
  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) {
      return
    }

    const { source, target } = event.operation

    // #113: a row dropped on the Completed drop zone is tucked into the journal
    // (reuse the delete→archive path) instead of reordered. GUARD is load-
    // bearing: only a *completed* row may go here — deleteTodo hard-deletes a
    // pending row (data loss), and in retain mode pending + completed rows share
    // this one sortable list, so dropping a pending row here must be a no-op.
    // The `!isAnyTogglePending` half is the same data-loss gate: a row checked
    // moments ago is optimistically `completed` here, but until the toggle
    // commits the server still sees it pending and would hard-delete it. This
    // reads the MutationCache (any toggle in flight), not one observer's latest.
    if (target?.id === COMPLETED_DROPZONE_ID) {
      const droppedTodo = pendingTodos.find(
        (todo) => todo.id === String(source?.id),
      )
      if (droppedTodo?.completed && !isAnyTogglePending) {
        deleteTodo(droppedTodo.id)
      }
      return
    }

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
  }

  useCycleEffect(() => {
    // Cross-window sync: BrainDump / Floating Navigator completions broadcast
    // via the BroadcastChannel and also write to the Completed table, so the
    // Home heatmap + day-detail + journal caches need invalidation alongside the
    // todo list. The journal key is what surfaces a cross-window completion in
    // the Completed Tasks list (only the main window renders it, and a window
    // never receives its own broadcast). Without these keys, completing a task
    // in BrainDump leaves the main heatmap + journal stale until reload.
    return subscribeToTodoSync(() => {
      queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
      queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.dayDetail.key(),
      })
      queryClient.invalidateQueries({
        queryKey: orpc.completed.journal.key(),
      })
    })
  }, [queryClient])

  // Show loading until mounted (so server HTML and the hydration pass always
  // match), then during initial query / Clerk hydration / persister restore.
  // Clerk readiness stays a display gate on purpose: every visible control can
  // mutate, so content must never appear before mutations can authenticate.
  // The Issue #153 win happens at reveal time instead — the SSR-bootstrap
  // hydrated cache makes pendingLoading false with zero /api/orpc requests.
  if (!isMounted || !isClerkQueryReady || pendingLoading || isRestoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <Grid className="h-full grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Activity Heatmap — promoted to span both columns so it gets the full
           content-width DESIGN.md mandates for the centerpiece. At full width the
           trailing-year grid fits the card, removing the horizontal scroll the
           old half-width placement forced on desktop (sub-770px still scrolls via
           ContributionGraph's own overflow-x-auto — unavoidable at the 12px floor). */}
      <div className="lg:col-span-2">
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
      </div>

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
              onBulkPaste={pasteImport.openWithPaste}
              disabled={effectiveSelectedCategoryId === null}
            />

            {/* Bulk paste-import (Issue #110): the Add form's multi-line paste
                opens this controlled dialog — there's no visible Import button.
                The banner gives the post-import 60s Undo + Move-to-Completed. */}
            <PasteImport
              key={pasteImport.seedNonce}
              zone="todo"
              initialText={pasteImport.seedText}
              categories={categoryData?.categories ?? []}
              open={pasteImport.isOpen}
              onOpenChange={pasteImport.setOpen}
              onImported={pasteImport.handleImported}
            />
            <ImportUndoBanner
              lastImport={pasteImport.lastImport}
              onDismiss={pasteImport.dismissBanner}
              onChanged={pasteImport.invalidate}
            />
          </CardContent>
        </Card>

        {pendingTodos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <Circle className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                No pending tasks. Add a new task to get started.
              </p>
              {/* Quiet discoverability for bulk paste — a hint, not a button (Issue #110). */}
              <p className="text-sm text-muted-foreground">
                Paste a list to add several at once.
              </p>
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
                  isTogglePending={isAnyTogglePending}
                  isRetroactivelyPopulated={retroactivePopulateFadeIds.has(
                    todo.id,
                  )}
                />
              ))}
            </div>
            {/* #113: in 居残りモード, once there's a finished row to file, show a
                drop target so a single strikethrough row can be dragged out of
                the list into Completed (the per-row Archive button is the
                keyboard path). Lives inside the provider to share its context. */}
            {isRetaining && completedInListCount > 0 && (
              <CompletedDropZone isTogglePending={isAnyTogglePending} />
            )}
          </DragDropProvider>
        )}
      </div>

      {/* Completed Tasks Column */}
      <div className="space-y-6">
        <WeeklySummaryCard
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
            categories={categoryData?.categories ?? []}
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
    </Grid>
  )
}

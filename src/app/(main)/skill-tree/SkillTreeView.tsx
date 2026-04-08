'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { orpc } from '@/lib/orpc/client-query'

import { ConstellationCanvas } from './components/ConstellationCanvas'
import { DragOverlayCard } from './components/DragOverlayCard'
import { NodePopover } from './components/NodePopover'
import { TaskPoolDrawer } from './components/TaskPoolDrawer'
import {
  applyAssignment,
  buildInitialState,
  type OptimisticState,
} from './lib/optimistic'
import './styles.css'

/**
 * The main client-side view for the Skill Tree page.
 * Renders the constellation canvas with DnD-enabled task assignment,
 * an optimistic state layer for instant UI feedback, and a task pool drawer.
 * All data is fetched internally via oRPC — no props required.
 *
 * @returns A full-height flex layout containing the constellation canvas,
 *   the node popover (for unassigning tasks), and the task pool drawer.
 *   Renders an error message when data fetching fails, or a loading indicator
 *   while data is in flight.
 *
 * @example
 * ```tsx
 * // Used directly from the RSC page shell:
 * export default async function SkillTreePage() {
 *   const { userId } = await auth()
 *   if (!userId) redirect('/login')
 *   return <SkillTreeView />
 * }
 * ```
 */
export function SkillTreeView() {
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeDragId, setActiveDragId] = useState<number | null>(null)
  const [activePopoverNodeId, setActivePopoverNodeId] = useState<number | null>(
    null,
  )
  const [, startTransition] = useTransition()

  const {
    data: tree,
    isLoading: treeLoading,
    isError: treeError,
  } = useQuery(orpc.skillTree.getMyTree.queryOptions())
  const {
    data: pool,
    isLoading: poolLoading,
    isError: poolError,
  } = useQuery(orpc.skillTree.getUnassignedPool.queryOptions())

  const baseState: OptimisticState = useMemo(() => {
    if (!tree || !pool) {
      return { assignmentsByNode: {}, unassignedTodoIds: [] }
    }
    return buildInitialState(
      tree.nodes.map((n) => ({ id: n.id, assignments: n.assignments })),
      pool.map((t) => t.id),
    )
  }, [tree, pool])

  const [optimisticState, applyOptimistic] = useOptimistic(
    baseState,
    applyAssignment,
  )

  // Lookup for rendering task text anywhere — pool card, popover list, drag
  // overlay. Must include BOTH the pool (newly-completed, not yet assigned)
  // AND the tree assignments (already assigned, may not be in the pool at
  // all). Without the tree half, unassigning a server-loaded assignment would
  // surface a card with "Task #${id}" placeholder until the next full refetch.
  // The tree side uses the `todoText` snapshot column which is populated at
  // assign time and survives the source todo being deleted.
  const todoTextById = useMemo(() => {
    const map = new Map<number, string>()
    pool?.forEach((t) => map.set(t.id, t.text))
    tree?.nodes.forEach((node) => {
      node.assignments.forEach((a) => {
        if (a.todoId !== null) {
          map.set(a.todoId, a.todoText)
        }
      })
    })
    return map
  }, [pool, tree])

  // Invalidation lives in `onSettled` (not `onSuccess`) so failed mutations
  // also reconcile optimistic state. On error: refetch → baseState updates →
  // useOptimistic rebases away the bad optimistic value. Without this, the
  // UI would stay wrong until the user manually refreshes.
  const assignMutation = useMutation({
    ...orpc.skillTree.assignTask.mutationOptions({}),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getMyTree.key(),
      })
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getUnassignedPool.key(),
      })
    },
    onError: () => {
      toast.error("Couldn't assign task — try again")
    },
  })

  const unassignMutation = useMutation({
    ...orpc.skillTree.unassignTask.mutationOptions({}),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getMyTree.key(),
      })
      queryClient.invalidateQueries({
        queryKey: orpc.skillTree.getUnassignedPool.key(),
      })
    },
    onError: () => {
      toast.error("Couldn't unassign task — try again")
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(event: DragStartEvent) {
    const todoId = parseTodoDragId(event.active.id)
    if (todoId !== null) {
      setActiveDragId(todoId)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return

    const todoId = parseTodoDragId(active.id)
    const nodeId = parseNodeDropId(over.id)
    if (todoId === null || nodeId === null) return

    // Async transition is required for useOptimistic to hold its optimistic
    // value across the network round-trip. A sync transition completes the
    // moment mutate() returns (fire-and-forget), causing React to revert the
    // optimistic state before the server responds — flashing the UI.
    startTransition(async () => {
      applyOptimistic({ type: 'assign', nodeId, todoId })
      // Errors are surfaced through the useMutation onError toast; the .catch
      // here just prevents an unhandled-rejection warning in the transition.
      await assignMutation.mutateAsync({ nodeId, todoId }).catch(() => {})
    })
  }

  function handleUnassign(nodeId: number, todoId: number) {
    startTransition(async () => {
      applyOptimistic({ type: 'unassign', nodeId, todoId })
      await unassignMutation.mutateAsync({ nodeId, todoId }).catch(() => {})
    })
  }

  if (treeError || poolError) {
    return (
      <div
        data-skill-tree="true"
        // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css
        className="st-canvas-bg flex h-full w-full items-center justify-center"
        role="alert"
      >
        <div className="text-[var(--st-muted)]">
          Failed to load skill tree. Please refresh the page.
        </div>
      </div>
    )
  }

  if (treeLoading || poolLoading || !tree || !pool) {
    return (
      <div
        data-skill-tree="true"
        // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css
        className="st-canvas-bg flex h-full w-full items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <div className="text-[var(--st-muted)]">Loading skill tree…</div>
      </div>
    )
  }

  // XP count = live optimistic assignments + frozen orphaned receipts.
  // Orphaned rows (todoId = null) are assignments whose source Todo has been
  // deleted via clearCompleted/deleteTodo. They're preserved as XP snapshots
  // but can't be dragged/unassigned, so they live outside the optimistic
  // state and are added back here.
  const canvasNodes = tree.nodes.map((n) => {
    const orphanedCount = n.assignments.filter((a) => a.todoId === null).length
    const activeCount = optimisticState.assignmentsByNode[n.id]?.length ?? 0
    return {
      id: n.id,
      name: n.name,
      x: n.x,
      y: n.y,
      xp: activeCount + orphanedCount,
    }
  })
  const canvasEdges = tree.edges.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
  }))
  // Build poolTodos from `unassignedTodoIds` (driven by optimistic state)
  // rather than filtering `pool`. After an optimistic unassign of a
  // server-loaded assignment, the todoId is in `unassignedTodoIds` but NOT
  // in `pool`; the filter-`pool` version would render nothing until refetch.
  // `todoTextById` is the unified pool-plus-tree-snapshot lookup so we
  // always have a label.
  const poolTodos = optimisticState.unassignedTodoIds.map((id) => ({
    id,
    text: todoTextById.get(id) ?? `Task #${id}`,
  }))

  const hasAnyCompletedTodos =
    optimisticState.unassignedTodoIds.length > 0 ||
    Object.values(optimisticState.assignmentsByNode).some((a) => a.length > 0)

  if (!hasAnyCompletedTodos) {
    return (
      <div data-skill-tree="true" className="flex h-full w-full flex-col">
        <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b border-[var(--st-border-rune)] bg-[var(--st-bg-deep)] px-4 text-[var(--st-cream)]">
          <SidebarTrigger className="no-drag -ml-1" />
          <h2 className="text-lg font-medium text-[var(--st-gold)]">
            Skill Tree
          </h2>
        </header>
        <div
          // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css
          className="st-canvas-bg flex flex-1 items-center justify-center"
        >
          <div className="max-w-md space-y-3 text-center text-[var(--st-cream)]">
            <div className="text-5xl" aria-hidden="true">
              ✨
            </div>
            <div className="text-lg font-medium text-[var(--st-gold)]">
              Your tree awaits
            </div>
            <div className="text-sm text-[var(--st-muted)]">
              Complete some tasks on the Home page to start earning XP.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const activeTodoText =
    activeDragId !== null
      ? (pool.find((t) => t.id === activeDragId)?.text ??
        `Task #${activeDragId}`)
      : ''

  const activePopoverNode = tree.nodes.find((n) => n.id === activePopoverNodeId)
  const assignedTodosForPopover = activePopoverNode
    ? (optimisticState.assignmentsByNode[activePopoverNode.id] ?? []).map(
        (a) => ({
          id: a.todoId,
          text: todoTextById.get(a.todoId) ?? `Task #${a.todoId}`,
        }),
      )
    : []

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div data-skill-tree="true" className="flex h-full w-full flex-col">
        <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b border-[var(--st-border-rune)] bg-[var(--st-bg-deep)] px-4 text-[var(--st-cream)]">
          <SidebarTrigger className="no-drag -ml-1" />
          <h2 className="text-lg font-medium text-[var(--st-gold)]">
            Skill Tree
          </h2>
        </header>
        <div className="relative flex-1 overflow-hidden">
          <ConstellationCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            onNodeClick={(nodeId) => setActivePopoverNodeId(nodeId)}
          />
          {activePopoverNode && (
            // Position-based anchor: Radix Popover needs an HTML trigger, but
            // SkillNodeCircle renders inside an SVG. Instead of using
            // foreignObject (fragile in dnd-kit), we render a transparent
            // anchor span at the node's normalized coordinates. The SVG uses
            // `viewBox="0 0 1000 1000"` with default preserveAspectRatio so
            // this is exact when the container is square; in wider viewports
            // the anchor sits slightly off due to letterboxing — acceptable
            // V1 tradeoff (manual a11y QA in Task 24 will confirm).
            <div
              className="pointer-events-auto absolute"
              style={{
                left: `${activePopoverNode.x * 100}%`,
                top: `${activePopoverNode.y * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <NodePopover
                open={activePopoverNodeId !== null}
                onOpenChange={(open) => {
                  if (!open) setActivePopoverNodeId(null)
                }}
                node={{
                  id: activePopoverNode.id,
                  name: activePopoverNode.name,
                  xp: assignedTodosForPopover.length,
                }}
                assignedTodos={assignedTodosForPopover}
                onUnassign={(todoId) =>
                  handleUnassign(activePopoverNode.id, todoId)
                }
              >
                {/* Invisible anchor element for Radix Popover positioning. */}
                <span className="block h-1 w-1" aria-hidden="true" />
              </NodePopover>
            </div>
          )}
          <TaskPoolDrawer
            todos={poolTodos}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
          />
        </div>
      </div>
      <DragOverlay>
        {activeDragId !== null ? (
          <DragOverlayCard text={activeTodoText} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/**
 * Parses a draggable DnD id of the form `todo-<number>` into its numeric todo id.
 * Rejects zero and negative ids because Prisma autoincrement ids are always
 * positive integers — guards against `Number('')` coercing `"todo-"` to `0`.
 * @param id - The raw `UniqueIdentifier` from `@dnd-kit/core`.
 * @returns
 * - The todo id as a positive integer when the id has the `todo-` prefix
 *   and the suffix is a positive integer.
 * - `null` when the prefix is missing or the suffix is empty, non-numeric,
 *   non-integer, zero, or negative.
 * @example
 * parseTodoDragId('todo-42')   // => 42
 * parseTodoDragId('todo-')     // => null
 * parseTodoDragId('todo-abc')  // => null
 * parseTodoDragId('todo-0')    // => null
 * parseTodoDragId('node-3')    // => null
 */
function parseTodoDragId(id: UniqueIdentifier): number | null {
  const s = String(id)
  if (!s.startsWith('todo-')) return null
  const n = Number(s.slice('todo-'.length))
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Parses a droppable DnD id of the form `node-<number>` into its numeric node id.
 * Rejects zero and negative ids because Prisma autoincrement ids are always
 * positive integers — guards against `Number('')` coercing `"node-"` to `0`.
 * @param id - The raw `UniqueIdentifier` from `@dnd-kit/core`.
 * @returns
 * - The node id as a positive integer when the id has the `node-` prefix
 *   and the suffix is a positive integer.
 * - `null` when the prefix is missing or the suffix is empty, non-numeric,
 *   non-integer, zero, or negative.
 * @example
 * parseNodeDropId('node-3')    // => 3
 * parseNodeDropId('node-')     // => null
 * parseNodeDropId('node-0')    // => null
 * parseNodeDropId('todo-42')   // => null
 */
function parseNodeDropId(id: UniqueIdentifier): number | null {
  const s = String(id)
  if (!s.startsWith('node-')) return null
  const n = Number(s.slice('node-'.length))
  return Number.isInteger(n) && n > 0 ? n : null
}

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

  const todoTextById = useMemo(() => {
    const map = new Map<number, string>()
    pool?.forEach((t) => map.set(t.id, t.text))
    // tree assignments only have todoId; text for already-assigned todos
    // is not available from the pool query. Falls back to "Task #${id}".
    // A future task may add a dedicated "get todo by id" fetch.
    return map
  }, [pool])

  const assignMutation = useMutation({
    ...orpc.skillTree.assignTask.mutationOptions({}),
    onSuccess: () => {
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
    onSuccess: () => {
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

    startTransition(() => {
      applyOptimistic({ type: 'assign', nodeId, todoId })
      assignMutation.mutate({ nodeId, todoId })
    })
  }

  function handleUnassign(nodeId: number, todoId: number) {
    startTransition(() => {
      applyOptimistic({ type: 'unassign', nodeId, todoId })
      unassignMutation.mutate({ nodeId, todoId })
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

  const canvasNodes = tree.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    x: n.x,
    y: n.y,
    xp: optimisticState.assignmentsByNode[n.id]?.length ?? 0,
  }))
  const canvasEdges = tree.edges.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
  }))
  const poolTodos = pool
    .filter((t) => optimisticState.unassignedTodoIds.includes(t.id))
    .map((t) => ({ id: t.id, text: t.text }))

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
              <span className="sr-only">Node popover trigger</span>
            </NodePopover>
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
 * @param id - The raw `UniqueIdentifier` from `@dnd-kit/core`.
 * @returns
 * - The todo id as a number when the id has the `todo-` prefix and a valid integer suffix.
 * - `null` when the id does not have the `todo-` prefix or the suffix is not a valid integer.
 * @example
 * parseTodoDragId('todo-42') // => 42
 * parseTodoDragId('node-3')  // => null
 */
function parseTodoDragId(id: UniqueIdentifier): number | null {
  const s = String(id)
  if (!s.startsWith('todo-')) return null
  const n = Number(s.slice('todo-'.length))
  return Number.isInteger(n) ? n : null
}

/**
 * Parses a droppable DnD id of the form `node-<number>` into its numeric node id.
 * @param id - The raw `UniqueIdentifier` from `@dnd-kit/core`.
 * @returns
 * - The node id as a number when the id has the `node-` prefix and a valid integer suffix.
 * - `null` when the id does not have the `node-` prefix or the suffix is not a valid integer.
 * @example
 * parseNodeDropId('node-3')  // => 3
 * parseNodeDropId('todo-42') // => null
 */
function parseNodeDropId(id: UniqueIdentifier): number | null {
  const s = String(id)
  if (!s.startsWith('node-')) return null
  const n = Number(s.slice('node-'.length))
  return Number.isInteger(n) ? n : null
}

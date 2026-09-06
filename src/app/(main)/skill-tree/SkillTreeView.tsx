'use client'

import {
  DragDropProvider,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { skillTreeSensors } from '@/lib/dnd-kit-sensors'
import { orpc } from '@/lib/orpc/client-query'

import { ConstellationCanvas } from './components/ConstellationCanvas'
import { DragOverlayCard } from './components/DragOverlayCard'
import { NodePopover } from './components/NodePopover'
import { TaskPoolDrawer } from './components/TaskPoolDrawer'
import { buildActiveNodeDetails } from './lib/buildActiveNodeDetails'
import { buildSkillTreeCanvasData } from './lib/buildSkillTreeCanvasData'
import type { SkillNodeId, TodoId } from './lib/domain-types'
import {
  applyAssignment,
  buildInitialState,
  type OptimisticState,
} from './lib/optimistic'
import { useSkillTreeQueries } from './useSkillTreeQueries'
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
export const SkillTreeView = function SkillTreeView() {
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeDragId, setActiveDragId] = useState<TodoId | null>(null)
  const [activePopoverNodeId, setActivePopoverNodeId] =
    useState<SkillNodeId | null>(null)
  const [, startTransition] = useTransition()

  const { tree, pool, isLoading, isError } = useSkillTreeQueries()

  const baseState = getInitialAssignmentState(
    tree?.nodes,
    pool?.map((todo) => todo.id),
  )

  const [optimisticState, applyOptimistic] = useOptimistic(
    baseState,
    applyAssignment,
  )

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

  /**
   * Starts the drag overlay when a completed todo card begins dragging.
   * @param event - Latest dnd-kit drag-start event from DragDropProvider.
   * @returns
   * - No return value; non-todo drags are ignored.
   * @example
   * handleDragStart(event)
   */
  const handleDragStart = (event: DragStartEvent) => {
    const todoId = parseTodoDragId(event.operation.source?.id)
    if (todoId !== null) {
      setActiveDragId(todoId)
    }
  }

  /**
   * Assigns a completed todo to the skill node that received the drop.
   * @param event - Latest dnd-kit drag-end event from DragDropProvider.
   * @returns
   * - No return value; canceled drags and invalid targets exit early.
   * @example
   * handleDragEnd(event)
   */
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    if (event.canceled) return

    const { source, target } = event.operation
    const todoId = parseTodoDragId(source?.id)
    const nodeId = parseNodeDropId(target?.id)
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

  const handleUnassign = (nodeId: SkillNodeId, todoId: TodoId) => {
    startTransition(async () => {
      applyOptimistic({ type: 'unassign', nodeId, todoId })
      await unassignMutation.mutateAsync({ nodeId, todoId }).catch(() => {})
    })
  }

  const handleNodeClick = (nodeId: SkillNodeId) => {
    setActivePopoverNodeId(nodeId)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (!open) setActivePopoverNodeId(null)
  }

  const handlePopoverUnassign = (todoId: TodoId) => {
    if (!activePopoverNodeId) return
    handleUnassign(activePopoverNodeId, todoId)
  }

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open)
  }

  const {
    todoTextById,
    canvasNodes,
    canvasEdges,
    poolTodos,
    hasAnyCompletedTodos,
    activeTodoText,
  } = buildSkillTreeCanvasData(tree, pool, optimisticState, activeDragId)

  const {
    activePopoverNode,
    assignedTodosForPopover,
    activePopoverNodeSummary,
  } = buildActiveNodeDetails(
    tree?.nodes ?? [],
    activePopoverNodeId,
    optimisticState,
    todoTextById,
  )

  if (isError) {
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

  if (isLoading) {
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

  return (
    <DragDropProvider
      sensors={skillTreeSensors}
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
            onNodeClick={handleNodeClick}
          />

          {activePopoverNode && activePopoverNodeSummary && (
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
                onOpenChange={handlePopoverOpenChange}
                node={activePopoverNodeSummary}
                assignedTodos={assignedTodosForPopover}
                onUnassign={handlePopoverUnassign}
              >
                {/* Invisible anchor element for Radix Popover positioning. */}
                <span className="block h-1 w-1" aria-hidden="true" />
              </NodePopover>
            </div>
          )}
          <TaskPoolDrawer
            todos={poolTodos}
            open={drawerOpen}
            onOpenChange={handleDrawerOpenChange}
          />
        </div>
      </div>
      <DragOverlay>
        {activeDragId !== null ? (
          <DragOverlayCard text={activeTodoText} />
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  )
}

/**
 * Parses a draggable DnD id of the form `todo-<number>` into its numeric todo id.
 * Rejects zero and negative ids because Prisma autoincrement ids are always
 * positive integers — guards against `Number('')` coercing `"todo-"` to `0`.
 * @param id - The raw id from the latest dnd-kit drag source.
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
function parseTodoDragId(
  id: string | number | null | undefined,
): TodoId | null {
  const s = String(id)
  if (!s.startsWith('todo-')) return null
  const n = Number(s.slice('todo-'.length))
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Parses a droppable DnD id of the form `node-<number>` into its numeric node id.
 * Rejects zero and negative ids because Prisma autoincrement ids are always
 * positive integers — guards against `Number('')` coercing `"node-"` to `0`.
 * @param id - The raw id from the latest dnd-kit drop target.
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
function parseNodeDropId(
  id: string | number | null | undefined,
): SkillNodeId | null {
  const s = String(id)
  if (!s.startsWith('node-')) return null
  const n = Number(s.slice('node-'.length))
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Keeps optimistic assignments empty until both queries needed by {@link SkillTreeView} are available.
 * @param nodes - Loaded tree nodes, or undefined while loading.
 * @param todoIds - Loaded unassigned task IDs, or undefined while loading.
 * @returns The original all-or-nothing initial assignment state.
 * @example getInitialAssignmentState(undefined, undefined)
 */
function getInitialAssignmentState(
  nodes: Parameters<typeof buildInitialState>[0] | undefined,
  todoIds: TodoId[] | undefined,
): OptimisticState {
  if (!nodes || !todoIds)
    return { assignmentsByNode: {}, unassignedTodoIds: [] }
  return buildInitialState(nodes, todoIds)
}

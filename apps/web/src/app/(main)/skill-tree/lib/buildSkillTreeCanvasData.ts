import type { SkillNode, NodeEdge } from '@/server/schemas/skillTree'

import type { TodoId, TodoText } from './domain-types'
import type { OptimisticState } from './optimistic'

interface SkillTreeSnapshot {
  nodes: SkillNode[]
  edges: NodeEdge[]
}
type TaskLabel = { id: TodoId; text: TodoText }

/** Combines server receipts and optimistic assignments into display data for {@link SkillTreeView}.
 * @param tree - Loaded tree and historical assignments.
 * @param pool - Loaded unassigned completed tasks.
 * @param optimisticState - Current assignment state during mutations.
 * @param activeDragId - Task currently shown in the drag overlay.
 * @returns Canvas geometry, task labels, counts, and empty-state visibility.
 * @example buildSkillTreeCanvasData(tree, pool, state, null)
 */
export function buildSkillTreeCanvasData(
  tree: SkillTreeSnapshot | undefined,
  pool: TaskLabel[] | undefined,
  optimisticState: OptimisticState,
  activeDragId: TodoId | null,
) {
  const todoTextById = buildTodoTextLookup(tree, pool)
  const canvasNodes =
    tree?.nodes.map((n) => {
      const orphanedCount = n.assignments.filter(
        (a) => a.todoId === null,
      ).length
      const activeCount = optimisticState.assignmentsByNode[n.id]?.length ?? 0
      return {
        id: n.id,
        name: n.name,
        x: n.x,
        y: n.y,
        xp: activeCount + orphanedCount,
      }
    }) ?? []

  const canvasEdges =
    tree?.edges.map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
    })) ?? []

  const poolTodos = optimisticState.unassignedTodoIds.map((id) => ({
    id,
    text: todoTextById.get(id) ?? `Task #${id}`,
  }))

  const hasAnyCompletedTodos =
    optimisticState.unassignedTodoIds.length > 0 ||
    Object.values(optimisticState.assignmentsByNode).some(
      (a) => a.length > 0,
    ) ||
    (tree?.nodes.some((n) => n.assignments.some((a) => a.todoId === null)) ??
      false)

  const activeTodoText =
    activeDragId !== null
      ? (todoTextById.get(activeDragId) ?? `Task #${activeDragId}`)
      : ''

  return {
    todoTextById,
    canvasNodes,
    canvasEdges,
    poolTodos,
    hasAnyCompletedTodos,
    activeTodoText,
  }
}

/** Retains labels from assigned receipts when a task leaves the pool during {@link buildSkillTreeCanvasData}.
 * @param tree - Tree containing saved task text snapshots.
 * @param pool - Unassigned tasks, if loaded.
 * @returns Labels for both current pool entries and existing assignments.
 * @example buildTodoTextLookup(tree, pool)
 */
function buildTodoTextLookup(
  tree: SkillTreeSnapshot | undefined,
  pool: TaskLabel[] | undefined,
): Map<TodoId, TodoText> {
  // Lookup for rendering task text anywhere — pool card, popover list, drag
  // overlay. Must include BOTH the pool (newly-completed, not yet assigned)
  // AND the tree assignments (already assigned, may not be in the pool at
  // all). Without the tree half, unassigning a server-loaded assignment would
  // surface a card with "Task #${id}" placeholder until the next full refetch.
  // The tree side uses the `todoText` snapshot column which is populated at
  // assign time and survives the source todo being deleted.
  const todoTextById = new Map<TodoId, TodoText>()
  pool?.forEach((t) => todoTextById.set(t.id, t.text))
  tree?.nodes.forEach((node) => {
    node.assignments.forEach((a) => {
      if (a.todoId !== null) {
        todoTextById.set(a.todoId, a.todoText)
      }
    })
  })

  return todoTextById
}

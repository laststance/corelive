import type { SkillNode } from '@/server/schemas/skillTree'

import type { SkillNodeId, TodoId, TodoText } from './domain-types'
import type { OptimisticState } from './optimistic'

/** Derives the selected node's popover from optimistic assignments for {@link SkillTreeView}.
 * @param nodes - Persisted node details and orphaned completion receipts.
 * @param activePopoverNodeId - Selected node, if any.
 * @param optimisticState - Latest optimistic assignments.
 * @param todoTextById - Labels from both the pool and persisted assignments.
 * @returns The selected node, visible tasks, and XP summary.
 * @example buildActiveNodeDetails(nodes, 1, state, labels)
 */
export function buildActiveNodeDetails(
  nodes: SkillNode[],
  activePopoverNodeId: SkillNodeId | null,
  optimisticState: OptimisticState,
  todoTextById: Map<TodoId, TodoText>,
) {
  const activePopoverNode = nodes.find((n) => n.id === activePopoverNodeId)

  const assignedTodosForPopover = activePopoverNode
    ? (optimisticState.assignmentsByNode[activePopoverNode.id] ?? []).map(
        (a) => ({
          id: a.todoId,
          text: todoTextById.get(a.todoId) ?? `Task #${a.todoId}`,
        }),
      )
    : []

  const activePopoverNodeXp = activePopoverNode
    ? assignedTodosForPopover.length +
      activePopoverNode.assignments.filter((a) => a.todoId === null).length
    : 0

  const activePopoverNodeSummary = activePopoverNode
    ? {
        id: activePopoverNode.id,
        name: activePopoverNode.name,
        xp: activePopoverNodeXp,
      }
    : null

  return {
    activePopoverNode,
    assignedTodosForPopover,
    activePopoverNodeSummary,
  }
}

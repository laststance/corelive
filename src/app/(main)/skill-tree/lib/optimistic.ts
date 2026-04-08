/**
 * A lightweight snapshot of assignment state used by the optimistic reducer.
 * Holds only the derived data the UI needs: per-node assignments and the
 * unassigned pool. Not persisted — rebuilt from server state on each query.
 */
export interface OptimisticState {
  assignmentsByNode: Record<number, { todoId: number }[]>
  unassignedTodoIds: number[]
}

export type OptimisticAction =
  | { type: 'assign'; nodeId: number; todoId: number }
  | { type: 'unassign'; nodeId: number; todoId: number }

/**
 * Pure reducer for optimistic drag-and-drop assignments.
 * Called from `useOptimistic`'s reducer argument.
 * @param state - The current optimistic snapshot.
 * @param action - The assign or unassign event.
 * @returns A new state object — never mutates the input.
 * @example
 * const next = applyAssignment(state, { type: 'assign', nodeId: 2, todoId: 100 })
 */
export function applyAssignment(
  state: OptimisticState,
  action: OptimisticAction,
): OptimisticState {
  if (action.type === 'assign') {
    const existing = state.assignmentsByNode[action.nodeId] ?? []
    // Idempotent: already assigned to this node → no change
    if (existing.some((a) => a.todoId === action.todoId)) {
      return state
    }
    return {
      assignmentsByNode: {
        ...state.assignmentsByNode,
        [action.nodeId]: [...existing, { todoId: action.todoId }],
      },
      unassignedTodoIds: state.unassignedTodoIds.filter(
        (id) => id !== action.todoId,
      ),
    }
  }

  // unassign
  const existing = state.assignmentsByNode[action.nodeId] ?? []
  if (!existing.some((a) => a.todoId === action.todoId)) {
    return state
  }
  return {
    assignmentsByNode: {
      ...state.assignmentsByNode,
      [action.nodeId]: existing.filter((a) => a.todoId !== action.todoId),
    },
    unassignedTodoIds: state.unassignedTodoIds.includes(action.todoId)
      ? state.unassignedTodoIds
      : [...state.unassignedTodoIds, action.todoId],
  }
}

/**
 * Builds an OptimisticState snapshot from a server-fetched SkillTree and pool.
 * @param nodes - Array of SkillNode objects with `assignments` included.
 * @param poolTodoIds - IDs of completed Todos not yet assigned.
 * @returns Initial state for `useOptimistic`.
 * @example
 * const state = buildInitialState(skillTree.nodes, poolTodoIds)
 */
export function buildInitialState(
  nodes: Array<{ id: number; assignments: Array<{ todoId: number }> }>,
  poolTodoIds: number[],
): OptimisticState {
  const assignmentsByNode: Record<number, { todoId: number }[]> = {}
  for (const node of nodes) {
    assignmentsByNode[node.id] = node.assignments.map((a) => ({
      todoId: a.todoId,
    }))
  }
  return { assignmentsByNode, unassignedTodoIds: poolTodoIds }
}

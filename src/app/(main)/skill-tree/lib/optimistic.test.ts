import { describe, expect, it } from 'vitest'

import { applyAssignment, type OptimisticState } from './optimistic'

const baseState: OptimisticState = {
  // node 1 has 2 assignments, node 2 is empty
  assignmentsByNode: {
    1: [{ todoId: 100 }, { todoId: 101 }],
    2: [],
  },
  unassignedTodoIds: [200, 201, 202],
}

describe('applyAssignment', () => {
  it('assigns a todo from the pool to a node', () => {
    const next = applyAssignment(baseState, {
      type: 'assign',
      nodeId: 2,
      todoId: 200,
    })
    expect(next.assignmentsByNode[2]).toEqual([{ todoId: 200 }])
    expect(next.unassignedTodoIds).toEqual([201, 202])
  })

  it('is a no-op if the todo is already assigned to that node', () => {
    const next = applyAssignment(baseState, {
      type: 'assign',
      nodeId: 1,
      todoId: 100,
    })
    expect(next.assignmentsByNode[1]).toEqual([
      { todoId: 100 },
      { todoId: 101 },
    ])
    expect(next.unassignedTodoIds).toEqual([200, 201, 202])
  })

  it('unassigns a todo, returning it to the pool', () => {
    const next = applyAssignment(baseState, {
      type: 'unassign',
      nodeId: 1,
      todoId: 100,
    })
    expect(next.assignmentsByNode[1]).toEqual([{ todoId: 101 }])
    expect(next.unassignedTodoIds).toContain(100)
  })

  it('unassign is a no-op if the assignment does not exist', () => {
    const next = applyAssignment(baseState, {
      type: 'unassign',
      nodeId: 1,
      todoId: 999,
    })
    expect(next).toEqual(baseState)
  })

  it('does not mutate the input state', () => {
    const snapshot = JSON.parse(JSON.stringify(baseState)) as OptimisticState
    applyAssignment(baseState, { type: 'assign', nodeId: 2, todoId: 200 })
    expect(baseState).toEqual(snapshot)
  })
})

import { expect, test } from 'vitest'

import type { SkillNode } from '@/server/schemas/skillTree'

import { buildActiveNodeDetails } from './buildActiveNodeDetails'
import { buildSkillTreeCanvasData } from './buildSkillTreeCanvasData'

test('unassigning a saved task preserves its text and historical XP before the pool refetches', () => {
  // Arrange
  const node: SkillNode = {
    id: 1,
    skillTreeId: 1,
    name: 'APIs',
    description: null,
    icon: null,
    x: 0.5,
    y: 0.25,
    assignments: [
      {
        id: 10,
        nodeId: 1,
        todoId: 20,
        todoText: 'Document the API',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: 11,
        nodeId: 1,
        todoId: null,
        todoText: 'A deleted original task',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    ],
  }

  // Act
  const display = buildSkillTreeCanvasData(
    { nodes: [node], edges: [] },
    [],
    { assignmentsByNode: { 1: [] }, unassignedTodoIds: [20] },
    20,
  )

  // Assert
  expect(display.poolTodos).toEqual([{ id: 20, text: 'Document the API' }])
  expect(display.activeTodoText).toBe('Document the API')
  expect(display.canvasNodes).toEqual([
    { id: 1, name: 'APIs', x: 0.5, y: 0.25, xp: 1 },
  ])
  expect(display.hasAnyCompletedTodos).toBe(true)
})

test('a selected node popover includes optimistic tasks and orphaned completion receipts in its count', () => {
  // Arrange
  const node: SkillNode = {
    id: 1,
    skillTreeId: 1,
    name: 'APIs',
    description: null,
    icon: null,
    x: 0.5,
    y: 0.25,
    assignments: [
      {
        id: 11,
        nodeId: 1,
        todoId: null,
        todoText: 'Saved receipt',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    ],
  }

  // Act
  const details = buildActiveNodeDetails(
    [node],
    1,
    { assignmentsByNode: { 1: [{ todoId: 20 }] }, unassignedTodoIds: [] },
    new Map([[20, 'Document the API']]),
  )

  // Assert
  expect(details.assignedTodosForPopover).toEqual([
    { id: 20, text: 'Document the API' },
  ])
  expect(details.activePopoverNodeSummary).toEqual({
    id: 1,
    name: 'APIs',
    xp: 2,
  })
})

test('an unloaded tree has no selected-node details or completed-task display', () => {
  // Arrange
  const state = { assignmentsByNode: {}, unassignedTodoIds: [] }

  // Act
  const display = buildSkillTreeCanvasData(undefined, undefined, state, null)
  const details = buildActiveNodeDetails([], null, state, new Map())

  // Assert
  expect(display.canvasNodes).toEqual([])
  expect(display.poolTodos).toEqual([])
  expect(display.hasAnyCompletedTodos).toBe(false)
  expect(details.assignedTodosForPopover).toEqual([])
  expect(details.activePopoverNodeSummary).toBeNull()
})

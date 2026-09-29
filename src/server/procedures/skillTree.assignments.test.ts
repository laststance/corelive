// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  nodeAssignmentTable,
  skillTreeTable,
  todoTable,
  userTable,
} from '@/db/schema'

import { describeIfDb } from './describeIfDb'
import {
  assignTask,
  getMyTree,
  getUnassignedPool,
  unassignTask,
} from './skillTree'

/**
 * Real-database coverage for the skill tree's XP flow. `getMyTree` filters each
 * node's assignments with a subquery (orphaned receipts stay; assignments whose todo
 * is no longer completed disappear), `assignTask` moves an assignment atomically, and
 * `getUnassignedPool` is a NOT EXISTS anti-join. All three were rewritten in the
 * Prisma → Drizzle swap and had no server-side test.
 */
vi.setConfig({ testTimeout: 30_000 })

const createdClerkIds = new Set<string>()

/**
 * Builds the direct-call options every authenticated procedure needs.
 * @param clerkId - Clerk user id placed in the Bearer header.
 * @returns oRPC call options carrying the auth header.
 * @example
 * await call(getMyTree, undefined, authContext('user_1'))
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

/**
 * Provisions an account with a skill tree and two completed todos.
 * @returns Clerk id, two node ids, two completed todo ids, and the user id.
 * @example
 * const { clerkId, nodeIds, todoIds } = await arrangeAccount()
 */
async function arrangeAccount() {
  const clerkId = `test_tree_${randomUUID()}`
  createdClerkIds.add(clerkId)
  const tree = await call(getMyTree, undefined, authContext(clerkId))
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
  const [category] = await db
    .select()
    .from(categoryTable)
    .where(eq(categoryTable.userId, user!.id))
  const todos = await db
    .insert(todoTable)
    .values(
      ['read the docs', 'ship the fix'].map((text) => ({
        text,
        completed: true,
        completedAt: new Date('2026-06-03T14:30:00.000Z'),
        userId: user!.id,
        categoryId: category!.id,
      })),
    )
    .returning()
  const [firstNode, secondNode] = tree.nodes
  return {
    clerkId,
    nodeIds: [firstNode!.id, secondNode!.id] as const,
    todoIds: todos.map((todo) => todo.id),
  }
}

/**
 * Reads the assignment todo ids currently attached to a node.
 * @param clerkId - Owner of the tree.
 * @param nodeId - Node whose assignments to list.
 * @returns The todo ids (null for orphaned receipts) in id order.
 * @example
 * await readNodeAssignments(clerkId, nodeId) // => [12, null]
 */
async function readNodeAssignments(clerkId: string, nodeId: number) {
  const tree = await call(getMyTree, undefined, authContext(clerkId))
  const node = tree.nodes.find((candidate) => candidate.id === nodeId)
  return node?.assignments.map((assignment) => assignment.todoId) ?? []
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    // SkillTree deletion cascades to nodes, edges and assignments.
    await db.delete(skillTreeTable).where(eq(skillTreeTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('skill tree assignments (real PostgreSQL)', () => {
  test('assigns a completed todo to a node and lists it under that node with the todo’s text', async () => {
    // Arrange
    const { clerkId, nodeIds, todoIds } = await arrangeAccount()

    // Act
    const assignment = await call(
      assignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )

    // Assert
    expect(assignment).toMatchObject({
      nodeId: nodeIds[0],
      todoId: todoIds[0],
      todoText: 'read the docs',
    })
    expect(await readNodeAssignments(clerkId, nodeIds[0])).toEqual([todoIds[0]])
  })

  test('moves the assignment to the second node instead of counting the todo twice', async () => {
    // Arrange
    const { clerkId, nodeIds, todoIds } = await arrangeAccount()
    await call(
      assignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )

    // Act
    await call(
      assignTask,
      { nodeId: nodeIds[1], todoId: todoIds[0]! },
      authContext(clerkId),
    )

    // Assert
    expect(await readNodeAssignments(clerkId, nodeIds[0])).toEqual([])
    expect(await readNodeAssignments(clerkId, nodeIds[1])).toEqual([todoIds[0]])
  })

  test('rejects assigning a todo that is not completed, so XP cannot be farmed by un-completing', async () => {
    // Arrange
    const { clerkId, nodeIds, todoIds } = await arrangeAccount()
    await db
      .update(todoTable)
      .set({ completed: false })
      .where(eq(todoTable.id, todoIds[0]!))

    // Act
    const attempt = call(
      assignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )

    // Assert
    await expect(attempt).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Completed todo not found',
    })
  })

  test('keeps an orphaned XP receipt visible but hides the assignment of a todo that is no longer completed', async () => {
    // Arrange — one live assignment, one orphaned receipt (its todo was deleted).
    const { clerkId, nodeIds, todoIds } = await arrangeAccount()
    await call(
      assignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )
    await db
      .insert(nodeAssignmentTable)
      .values({ nodeId: nodeIds[0], todoId: null, todoText: 'deleted task' })

    // Act — un-complete the assigned todo.
    await db
      .update(todoTable)
      .set({ completed: false })
      .where(eq(todoTable.id, todoIds[0]!))
    const visibleAssignments = await readNodeAssignments(clerkId, nodeIds[0])

    // Assert
    expect(visibleAssignments).toEqual([null])
  })

  test('returns the removed row on unassign and puts the todo back in the unassigned pool', async () => {
    // Arrange
    const { clerkId, nodeIds, todoIds } = await arrangeAccount()
    await call(
      assignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )
    const poolWhileAssigned = await call(
      getUnassignedPool,
      undefined,
      authContext(clerkId),
    )

    // Act
    const removed = await call(
      unassignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )
    const poolAfterUnassign = await call(
      getUnassignedPool,
      undefined,
      authContext(clerkId),
    )

    // Assert
    expect(removed).toMatchObject({ nodeId: nodeIds[0], todoId: todoIds[0] })
    expect(poolWhileAssigned.map((todo) => todo.id)).toEqual([todoIds[1]])
    expect(poolAfterUnassign.map((todo) => todo.id)).toEqual([
      todoIds[0],
      todoIds[1],
    ])
  })

  test('returns null instead of deleting when the assignment sits on a different node than the caller named', async () => {
    // Arrange
    const { clerkId, nodeIds, todoIds } = await arrangeAccount()
    await call(
      assignTask,
      { nodeId: nodeIds[0], todoId: todoIds[0]! },
      authContext(clerkId),
    )

    // Act
    const result = await call(
      unassignTask,
      { nodeId: nodeIds[1], todoId: todoIds[0]! },
      authContext(clerkId),
    )

    // Assert
    expect(result).toBeNull()
    expect(await readNodeAssignments(clerkId, nodeIds[0])).toEqual([todoIds[0]])
  })
})

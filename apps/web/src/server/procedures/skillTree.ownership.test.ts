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
 * Real-database coverage for the skill tree's first visit and its per-account
 * boundaries. The template import is now a multi-row insert plus a relational
 * re-read, and the owner check joins `SkillNode` to `SkillTree` by hand instead of
 * filtering through a relation. A broken join would let one account assign XP onto
 * another account's tree, and a broken import would render an empty constellation.
 */
vi.setConfig({ testTimeout: 30_000 })

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

// Every clerk id a test touches, so afterEach can delete the user and its rows.
const createdClerkIds = new Set<string>()

/**
 * Provisions an account with its skill tree and returns what a test needs to assign XP.
 * @returns Clerk id, user id, default category id and the first node's id.
 * @example
 * const { clerkId, userId, categoryId, nodeId } = await arrangeAccount()
 */
async function arrangeAccount() {
  const clerkId = `test_tree_owner_${randomUUID()}`
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
  return {
    clerkId,
    userId: user!.id,
    categoryId: category!.id,
    nodeId: tree.nodes[0]!.id,
  }
}

/**
 * Inserts one todo for an account.
 * @param owner - The account's user id and category id.
 * @param text - Todo text.
 * @param completed - Whether the todo counts as finished work.
 * @returns The inserted todo's id.
 * @example
 * const todoId = await insertTodo(owner, 'ship it', true)
 */
async function insertTodo(
  owner: { userId: number; categoryId: number },
  text: string,
  completed: boolean,
): Promise<number> {
  const [todo] = await db
    .insert(todoTable)
    .values({
      text,
      completed,
      completedAt: completed ? new Date('2026-06-03T14:30:00.000Z') : null,
      userId: owner.userId,
      categoryId: owner.categoryId,
    })
    .returning()
  return todo!.id
}

/**
 * Counts every assignment row that points at a todo.
 * @param todoId - Todo whose assignments to count.
 * @returns The number of assignment rows.
 * @example
 * await countAssignmentsOf(12) // => 0
 */
async function countAssignmentsOf(todoId: number): Promise<number> {
  const rows = await db
    .select()
    .from(nodeAssignmentTable)
    .where(eq(nodeAssignmentTable.todoId, todoId))
  return rows.length
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

describeIfDb(
  'skill tree first visit and account boundaries (real PostgreSQL)',
  () => {
    test('builds the full Backend Developer Core constellation on the first visit and shows the same one on the next visit', async () => {
      // Arrange
      const clerkId = `test_tree_owner_${randomUUID()}`
      createdClerkIds.add(clerkId)

      // Act
      const firstVisit = await call(getMyTree, undefined, authContext(clerkId))
      const secondVisit = await call(getMyTree, undefined, authContext(clerkId))

      // Assert — 28 nodes and 25 edges, in id order, every edge inside this tree.
      const nodeIds = firstVisit.nodes.map((node) => node.id)
      expect(firstVisit).toMatchObject({
        name: 'Backend Developer Core',
        templateKey: 'backend-developer-core',
      })
      expect(firstVisit.nodes).toHaveLength(28)
      expect(firstVisit.edges).toHaveLength(25)
      expect(nodeIds).toEqual([...nodeIds].sort((a, b) => a - b))
      expect(
        firstVisit.edges.every(
          (edge) =>
            edge.skillTreeId === firstVisit.id &&
            nodeIds.includes(edge.fromNodeId) &&
            nodeIds.includes(edge.toNodeId),
        ),
      ).toBe(true)
      expect(
        firstVisit.nodes.every((node) => node.assignments.length === 0),
      ).toBe(true)
      expect(secondVisit).toEqual(firstVisit)
      const storedTrees = await db
        .select()
        .from(skillTreeTable)
        .where(eq(skillTreeTable.id, firstVisit.id))
      expect(storedTrees).toHaveLength(1)
    })

    test('answers NOT_FOUND "Skill node not found" and grants no XP when an account assigns onto another account’s node', async () => {
      // Arrange
      const owner = await arrangeAccount()
      const intruder = await arrangeAccount()
      const intrudersTodoId = await insertTodo(intruder, 'my own win', true)

      // Act
      const attempt = call(
        assignTask,
        { nodeId: owner.nodeId, todoId: intrudersTodoId },
        authContext(intruder.clerkId),
      )

      // Assert
      await expect(attempt).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Skill node not found',
      })
      expect(await countAssignmentsOf(intrudersTodoId)).toBe(0)
    })

    test('answers NOT_FOUND "Completed todo not found" when an account assigns another account’s completed todo', async () => {
      // Arrange
      const owner = await arrangeAccount()
      const intruder = await arrangeAccount()
      const ownersTodoId = await insertTodo(owner, 'owner win', true)

      // Act
      const attempt = call(
        assignTask,
        { nodeId: intruder.nodeId, todoId: ownersTodoId },
        authContext(intruder.clerkId),
      )

      // Assert
      await expect(attempt).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Completed todo not found',
      })
      expect(await countAssignmentsOf(ownersTodoId)).toBe(0)
    })

    test('answers NOT_FOUND "Todo not found" and keeps the assignment when an account unassigns another account’s todo', async () => {
      // Arrange
      const owner = await arrangeAccount()
      const intruder = await arrangeAccount()
      const ownersTodoId = await insertTodo(owner, 'owner win', true)
      await call(
        assignTask,
        { nodeId: owner.nodeId, todoId: ownersTodoId },
        authContext(owner.clerkId),
      )

      // Act
      const attempt = call(
        unassignTask,
        { nodeId: intruder.nodeId, todoId: ownersTodoId },
        authContext(intruder.clerkId),
      )

      // Assert
      await expect(attempt).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      })
      expect(await countAssignmentsOf(ownersTodoId)).toBe(1)
    })

    test('lists only the caller’s completed, unassigned todos in the pool, most recently finished first', async () => {
      // Arrange
      const owner = await arrangeAccount()
      const stranger = await arrangeAccount()
      const olderWinId = await insertTodo(owner, 'older win', true)
      const newerWinId = await insertTodo(owner, 'newer win', true)
      await insertTodo(owner, 'still open', false)
      await insertTodo(stranger, 'stranger win', true)
      await db
        .update(todoTable)
        .set({ updatedAt: new Date('2026-06-01T08:00:00.000Z') })
        .where(eq(todoTable.id, olderWinId))
      await db
        .update(todoTable)
        .set({ updatedAt: new Date('2026-06-02T08:00:00.000Z') })
        .where(eq(todoTable.id, newerWinId))

      // Act
      const pool = await call(
        getUnassignedPool,
        undefined,
        authContext(owner.clerkId),
      )

      // Assert
      expect(pool).toEqual([
        { id: newerWinId, text: 'newer win' },
        { id: olderWinId, text: 'older win' },
      ])
    })
  },
)

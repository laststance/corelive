// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { count, eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  completedTable,
  electronSettingsTable,
  importBatchTable,
  nodeAssignmentTable,
  skillTreeTable,
  todoTable,
  userTable,
} from '@/db/schema'
import { settleBehindHeldTransaction } from '@/test/heldTransaction'

import { DEFAULT_CATEGORY_SEED } from '../schemas/category'

import { createCategory, listCategories, updateCategory } from './category'
import { importLocalCompleted } from './completed'
import { describeIfDb } from './describeIfDb'
import { getElectronSettings } from './electronSettings'
import { assignTask, getMyTree, unassignTask } from './skillTree'

/**
 * Real-database coverage for the places that turn a PostgreSQL constraint
 * violation into a friendly outcome. drizzle-orm wraps every driver error in
 * `DrizzleQueryError` (the SQLSTATE sits in `.cause`), so each catch site that
 * tests a code silently stops matching if the `.cause` walk in `isPgError`
 * breaks; the create races that use `ON CONFLICT DO NOTHING` instead are pinned
 * to the same outcomes. Every test triggers the REAL constraint and asserts the
 * outcome users see today.
 *
 * The races are made deterministic (not timing-dependent) by parking a second
 * transaction on the contested row, letting the procedure block behind it, then
 * committing so the procedure's statement fails (or does nothing) for real.
 */
vi.setConfig({ testTimeout: 30_000 })

/**
 * Builds the direct-call options every authenticated procedure needs.
 * @param clerkId - Clerk user id placed in the Bearer header.
 * @returns oRPC call options carrying the auth header.
 * @example
 * await call(listCategories, undefined, authContext('user_1'))
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

// Every clerk id a test touches, so afterEach can delete the user and all
// FK-dependent rows in a safe order.
const createdClerkIds = new Set<string>()

/**
 * Reserves a unique Clerk id for one test and registers it for teardown.
 * @returns A clerk id no other test uses.
 * @example
 * const clerkId = freshClerkId() // => 'test_catch_3f2c…'
 */
function freshClerkId(): string {
  const clerkId = `test_catch_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Reads the user row the auth middleware created for a Clerk id.
 * @param clerkId - Clerk identity to look up.
 * @returns The user row.
 * @throws when no row exists.
 * @example
 * const { id } = await readUser('test_catch_1')
 */
async function readUser(clerkId: string) {
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
  if (!user) throw new Error(`No user row for ${clerkId}`)
  return user
}

/**
 * Counts one user's categories.
 * @param userId - Owner whose categories to count.
 * @returns The number of category rows.
 * @example
 * await countCategories(1) // => 1
 */
async function countCategories(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(categoryTable)
    .where(eq(categoryTable.userId, userId))
  return row?.value ?? 0
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    // FK-safe teardown: children before the user. SkillTree deletion cascades to
    // nodes, edges and assignments.
    await db.delete(skillTreeTable).where(eq(skillTreeTable.userId, user.id))
    await db
      .delete(electronSettingsTable)
      .where(eq(electronSettingsTable.userId, user.id))
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db
      .delete(importBatchTable)
      .where(eq(importBatchTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

/**
 * Creates a user with a skill tree, plus one completed todo the user could assign.
 * @param clerkId - Clerk identity to provision.
 * @returns The user id, two node ids, and the completed todo's id.
 * @example
 * const { nodeIds, todoId } = await arrangeAssignableTodo(clerkId)
 */
async function arrangeAssignableTodo(clerkId: string) {
  const tree = await call(getMyTree, undefined, authContext(clerkId))
  const user = await readUser(clerkId)
  const [category] = await db
    .select()
    .from(categoryTable)
    .where(eq(categoryTable.userId, user.id))
  const [todo] = await db
    .insert(todoTable)
    .values({
      text: 'ship the migration',
      completed: true,
      completedAt: new Date('2026-06-03T14:30:00.000Z'),
      userId: user.id,
      categoryId: category!.id,
    })
    .returning()
  const [firstNode, secondNode] = tree.nodes
  return {
    userId: user.id,
    nodeIds: [firstNode!.id, secondNode!.id] as const,
    todoId: todo!.id,
  }
}

describeIfDb('constraint-violation catch sites (real PostgreSQL)', () => {
  test('answers CONFLICT "already exists" when a category name is created twice', async () => {
    // Arrange
    const clerkId = freshClerkId()
    await call(
      createCategory,
      { name: 'Focus', color: 'blue' },
      authContext(clerkId),
    )

    // Act
    const duplicate = call(
      createCategory,
      { name: 'Focus', color: 'green' },
      authContext(clerkId),
    )

    // Assert
    await expect(duplicate).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A main category named "Focus" already exists.',
    })
  })

  test('answers CONFLICT when a category is renamed onto a name the user already has', async () => {
    // Arrange
    const clerkId = freshClerkId()
    await call(
      createCategory,
      { name: 'Focus', color: 'blue' },
      authContext(clerkId),
    )
    const other = await call(
      createCategory,
      { name: 'Errands', color: 'green' },
      authContext(clerkId),
    )

    // Act
    const rename = call(
      updateCategory,
      { id: other.id, data: { name: 'Focus' } },
      authContext(clerkId),
    )

    // Assert
    await expect(rename).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A main category named "Focus" already exists.',
    })
  })

  test('treats a default category committed by someone else mid-seed as success instead of failing the read', async () => {
    // Arrange — a user with zero categories, and a second transaction (the Clerk webhook's
    // role) that has inserted "General" but not committed yet.
    const clerkId = freshClerkId()
    const [user] = await db.insert(userTable).values({ clerkId }).returning()

    // Act — the read sees no categories, then the seed insert parks on the (name, userId) unique index.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx
          .insert(categoryTable)
          .values({ ...DEFAULT_CATEGORY_SEED, userId: user!.id })
      },
      startCall: async () =>
        call(listCategories, undefined, authContext(clerkId)),
    })

    // Assert — the unique violation is a no-op and the re-read returns the winner's row.
    expect(settled).not.toHaveProperty('error')
    expect(
      'value' in settled &&
        settled.value.categories.map((category) => category.name),
    ).toEqual(['General'])
    expect(await countCategories(user!.id)).toBe(1)
  })

  test('files an import under the existing category when the default "General" name is already taken by a non-default one', async () => {
    // Arrange — General exists but is NOT the default, so seeding a default General collides.
    const clerkId = freshClerkId()
    const [user] = await db.insert(userTable).values({ clerkId }).returning()
    const [nonDefaultGeneral] = await db
      .insert(categoryTable)
      .values({
        name: 'General',
        color: 'blue',
        isDefault: false,
        userId: user!.id,
      })
      .returning()

    // Act
    const result = await call(
      importLocalCompleted,
      {
        batchId: randomUUID(),
        items: [
          {
            localId: 'keep-1',
            title: 'push-ups',
            completedAt: new Date('2026-09-01T09:00:00Z'),
          },
        ],
      },
      authContext(clerkId),
    )

    // Assert
    expect(result.imported).toBe(1)
    const rows = await db
      .select()
      .from(completedTable)
      .where(eq(completedTable.userId, user!.id))
    expect(rows.map((row) => row.categoryId)).toEqual([nonDefaultGeneral!.id])
    expect(await countCategories(user!.id)).toBe(1)
  })

  test('reports alreadyImported and adds no rows when the same import batch is sent twice', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const batchId = randomUUID()
    const input = {
      batchId,
      items: [
        {
          localId: 'keep-1',
          title: 'push-ups',
          completedAt: new Date('2026-09-01T09:00:00Z'),
        },
      ],
    }
    await call(importLocalCompleted, input, authContext(clerkId))

    // Act
    const retry = await call(importLocalCompleted, input, authContext(clerkId))

    // Assert
    expect(retry).toEqual({ batchId, imported: 0, alreadyImported: true })
    const user = await readUser(clerkId)
    const [rowCount] = await db
      .select({ value: count() })
      .from(completedTable)
      .where(eq(completedTable.userId, user.id))
    expect(rowCount?.value).toBe(1)
  })

  test('returns the row another request created first when the first Electron settings read races an insert', async () => {
    // Arrange — a second transaction has inserted this user's settings but not committed.
    const clerkId = freshClerkId()
    await call(listCategories, undefined, authContext(clerkId))
    const user = await readUser(clerkId)

    // Act — the read finds nothing, then the default-settings insert parks on the userId unique index.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx.insert(electronSettingsTable).values({ userId: user.id })
      },
      startCall: async () =>
        call(getElectronSettings, undefined, authContext(clerkId)),
    })

    // Assert — one row exists and the caller received exactly that row.
    const rows = await db
      .select()
      .from(electronSettingsTable)
      .where(eq(electronSettingsTable.userId, user.id))
    expect(rows).toHaveLength(1)
    expect(settled).toMatchObject({ value: { id: rows[0]!.id } })
  })

  test('returns the tree another request created first when the first skill tree load races an import', async () => {
    // Arrange — a second transaction has inserted this user's tree but not committed.
    const clerkId = freshClerkId()
    await call(listCategories, undefined, authContext(clerkId))
    const user = await readUser(clerkId)

    // Act — the template import parks on the userId unique index and then rolls back.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx
          .insert(skillTreeTable)
          .values({ userId: user.id, name: 'Winner' })
      },
      startCall: async () => call(getMyTree, undefined, authContext(clerkId)),
    })

    // Assert — the caller gets the committed winner; the loser's half-imported nodes are gone.
    const storedTrees = await db
      .select()
      .from(skillTreeTable)
      .where(eq(skillTreeTable.userId, user.id))
    expect(storedTrees).toHaveLength(1)
    expect(settled).toMatchObject({
      value: { id: storedTrees[0]!.id, name: 'Winner', nodes: [] },
    })
  })

  test('answers NOT_FOUND "Todo no longer exists" when another assignment for the todo commits first', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const { nodeIds, todoId } = await arrangeAssignableTodo(clerkId)

    // Act — a second transaction holds an uncommitted assignment for the same todo, so
    // assignTask's insert parks on the unique todoId index and then violates it.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx
          .insert(nodeAssignmentTable)
          .values({ nodeId: nodeIds[0], todoId, todoText: 'held' })
      },
      startCall: async () =>
        call(assignTask, { nodeId: nodeIds[1], todoId }, authContext(clerkId)),
    })

    // Assert
    expect(settled).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Todo no longer exists' },
    })
  })

  test('answers NOT_FOUND "Todo no longer exists" when the todo is deleted while the assignment is being written', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const { nodeIds, todoId } = await arrangeAssignableTodo(clerkId)

    // Act — a second transaction deleted the todo but has not committed: ownership still sees it,
    // then the assignment insert parks on the foreign key and violates it once the delete commits.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx.delete(todoTable).where(eq(todoTable.id, todoId))
      },
      startCall: async () =>
        call(assignTask, { nodeId: nodeIds[0], todoId }, authContext(clerkId)),
    })

    // Assert
    expect(settled).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Todo no longer exists' },
    })
  })

  test('returns null when a concurrent unassign removes the assignment first', async () => {
    // Arrange — an assignment exists.
    const clerkId = freshClerkId()
    const { nodeIds, todoId } = await arrangeAssignableTodo(clerkId)
    await db
      .insert(nodeAssignmentTable)
      .values({ nodeId: nodeIds[0], todoId, todoText: 'ship the migration' })

    // Act — a second transaction deletes it but has not committed: unassignTask still sees the
    // row, then its DELETE parks on the row lock and finds nothing left once that commits.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx
          .delete(nodeAssignmentTable)
          .where(eq(nodeAssignmentTable.todoId, todoId))
      },
      startCall: async () =>
        call(
          unassignTask,
          { nodeId: nodeIds[0], todoId },
          authContext(clerkId),
        ),
    })

    // Assert — the already-gone row is a clean null, not a 500.
    expect(settled).toEqual({ value: null })
  })

  test('keeps an assignment that a concurrent call moved to another node before the unassign ran its delete, answering null', async () => {
    // Arrange — the todo is assigned to the first node.
    const clerkId = freshClerkId()
    const { nodeIds, todoId } = await arrangeAssignableTodo(clerkId)
    await db
      .insert(nodeAssignmentTable)
      .values({ nodeId: nodeIds[0], todoId, todoText: 'ship the migration' })

    // Act — a second transaction moves the assignment to the second node but has not committed:
    // unassignTask still reads it on the first node, then its DELETE parks on the row lock and, once
    // that commits, must no longer match, because the row now belongs to the other node.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx
          .update(nodeAssignmentTable)
          .set({ nodeId: nodeIds[1] })
          .where(eq(nodeAssignmentTable.todoId, todoId))
      },
      startCall: async () =>
        call(
          unassignTask,
          { nodeId: nodeIds[0], todoId },
          authContext(clerkId),
        ),
    })

    // Assert — nothing was deleted: the moved assignment is still there.
    expect(settled).toEqual({ value: null })
    const remaining = await db
      .select({ nodeId: nodeAssignmentTable.nodeId })
      .from(nodeAssignmentTable)
      .where(eq(nodeAssignmentTable.todoId, todoId))
    expect(remaining).toEqual([{ nodeId: nodeIds[1] }])
  })

  test('returns null when the todo has no assignment to remove', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const { nodeIds, todoId } = await arrangeAssignableTodo(clerkId)

    // Act
    const result = await call(
      unassignTask,
      { nodeId: nodeIds[0], todoId },
      authContext(clerkId),
    )

    // Assert
    expect(result).toBeNull()
  })
})

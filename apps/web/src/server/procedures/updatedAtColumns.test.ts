// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  completedTable,
  electronSettingsTable,
  skillNodeTable,
  skillTreeTable,
  todoTable,
  userTable,
} from '@/db/schema'

import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from './category'
import { describeIfDb } from './describeIfDb'
import { upsertElectronSettings } from './electronSettings'
import { getMyTree } from './skillTree'

/**
 * Real-database guard for the seven `updatedAt` columns. The previous ORM's `@updatedAt`
 * stamped them client-side on every write; drizzle only does that where the schema
 * says `$onUpdate`, and a missing one is silent (the column just stays stale). Each
 * test first parks `updatedAt` at a far-past sentinel, runs the real write path, and
 * asserts the column now holds the moment of the write (a stamp shifted by a
 * time-zone offset, or left stale, would miss the window).
 */
vi.setConfig({ testTimeout: 30_000 })

/** A stale value no real write can produce, so "now" proves the write stamped the column. */
const STALE_UPDATED_AT = new Date('2020-01-01T00:00:00.000Z')

/** Longest a stamp may differ from the test's own clock and still count as "just written". */
const JUST_WRITTEN_TOLERANCE_MS = 5_000

/**
 * Asserts a stamp is the current instant, so a stale value or one shifted by a local UTC offset fails.
 * @param stamp - `updatedAt` value read back after the write.
 * @returns Nothing; throws through `expect` when the stamp is not within seconds of now.
 * @example
 * expectStampedJustNow(updated.updatedAt)
 */
function expectStampedJustNow(stamp: Date): void {
  expect(Math.abs(stamp.getTime() - Date.now())).toBeLessThan(
    JUST_WRITTEN_TOLERANCE_MS,
  )
}

const createdClerkIds = new Set<string>()

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

/**
 * Reserves a unique Clerk id for one test and registers it for teardown.
 * @returns A clerk id no other test uses.
 * @example
 * const clerkId = freshClerkId() // => 'test_updated_3f2c…'
 */
function freshClerkId(): string {
  const clerkId = `test_updated_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

/**
 * Reads the user row the auth middleware created for a Clerk id.
 * @param clerkId - Clerk identity to look up.
 * @returns The user row.
 * @throws when no row exists.
 * @example
 * const { id } = await readUser('test_updated_1')
 */
async function readUser(clerkId: string) {
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, clerkId))
  if (!user) throw new Error(`No user row for ${clerkId}`)
  return user
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db.delete(skillTreeTable).where(eq(skillTreeTable.userId, user.id))
    await db
      .delete(electronSettingsTable)
      .where(eq(electronSettingsTable.userId, user.id))
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('updatedAt columns advance on write (real PostgreSQL)', () => {
  test('advances Category.updatedAt when a category is renamed', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const created = await call(
      createCategory,
      { name: 'Focus', color: 'blue' },
      authContext(clerkId),
    )
    await db
      .update(categoryTable)
      .set({ updatedAt: STALE_UPDATED_AT })
      .where(eq(categoryTable.id, created.id))

    // Act
    const updated = await call(
      updateCategory,
      { id: created.id, data: { name: 'Deep Focus' } },
      authContext(clerkId),
    )

    // Assert
    expect(updated.name).toBe('Deep Focus')
    expectStampedJustNow(updated.updatedAt)
  })

  test('stamps ElectronSettings.updatedAt on the insert path and advances it on the conflict-update path', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const inserted = await call(
      upsertElectronSettings,
      { hideAppIcon: false },
      authContext(clerkId),
    )
    await db
      .update(electronSettingsTable)
      .set({ updatedAt: STALE_UPDATED_AT })
      .where(eq(electronSettingsTable.id, inserted.id))

    // Act
    const updated = await call(
      upsertElectronSettings,
      { hideAppIcon: true },
      authContext(clerkId),
    )

    // Assert
    expectStampedJustNow(inserted.updatedAt)
    expect(updated.id).toBe(inserted.id)
    expect(updated.hideAppIcon).toBe(true)
    expectStampedJustNow(updated.updatedAt)
  })

  test('preserves Todo.updatedAt and Completed.updatedAt when deleting a category moves their rows, keeping historical dates unchanged', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const doomed = await call(
      createCategory,
      { name: 'Doomed', color: 'rose' },
      authContext(clerkId),
    )
    const user = await readUser(clerkId)
    const [todo] = await db
      .insert(todoTable)
      .values({
        text: 'legacy task',
        userId: user.id,
        categoryId: doomed.id,
        updatedAt: STALE_UPDATED_AT,
      })
      .returning()
    const [completed] = await db
      .insert(completedTable)
      .values({
        title: 'finished task',
        userId: user.id,
        categoryId: doomed.id,
        updatedAt: STALE_UPDATED_AT,
      })
      .returning()

    // Act
    await call(deleteCategory, { id: doomed.id }, authContext(clerkId))

    // Assert
    const [movedTodo] = await db
      .select()
      .from(todoTable)
      .where(eq(todoTable.id, todo!.id))
    const [movedCompleted] = await db
      .select()
      .from(completedTable)
      .where(eq(completedTable.id, completed!.id))
    expect(movedTodo!.categoryId).not.toBe(doomed.id)
    expect(movedTodo!.updatedAt).toEqual(STALE_UPDATED_AT)
    expect(movedCompleted!.categoryId).toBe(movedTodo!.categoryId)
    expect(movedCompleted!.updatedAt).toEqual(STALE_UPDATED_AT)
  })

  test('advances User, SkillTree and SkillNode updatedAt on a direct update, covering the tables no procedure edits today', async () => {
    // Arrange
    const clerkId = freshClerkId()
    const tree = await call(getMyTree, undefined, authContext(clerkId))
    const user = await readUser(clerkId)
    const nodeId = tree.nodes[0]!.id
    await db
      .update(userTable)
      .set({ updatedAt: STALE_UPDATED_AT })
      .where(eq(userTable.id, user.id))
    await db
      .update(skillTreeTable)
      .set({ updatedAt: STALE_UPDATED_AT })
      .where(eq(skillTreeTable.id, tree.id))
    await db
      .update(skillNodeTable)
      .set({ updatedAt: STALE_UPDATED_AT })
      .where(eq(skillNodeTable.id, nodeId))

    // Act
    await db
      .update(userTable)
      .set({ bio: 'now with a bio' })
      .where(eq(userTable.id, user.id))
    await db
      .update(skillTreeTable)
      .set({ name: 'Renamed tree' })
      .where(eq(skillTreeTable.id, tree.id))
    await db
      .update(skillNodeTable)
      .set({ name: 'Renamed node' })
      .where(eq(skillNodeTable.id, nodeId))

    // Assert
    const [userRow] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, user.id))
    const [treeRow] = await db
      .select()
      .from(skillTreeTable)
      .where(eq(skillTreeTable.id, tree.id))
    const [nodeRow] = await db
      .select()
      .from(skillNodeTable)
      .where(eq(skillNodeTable.id, nodeId))
    expectStampedJustNow(userRow!.updatedAt)
    expectStampedJustNow(treeRow!.updatedAt)
    expectStampedJustNow(nodeRow!.updatedAt)
  })

  test('fills updatedAt on insert for tables whose column has no database default', async () => {
    // Arrange
    const clerkId = freshClerkId()

    // Act
    await call(listCategories, undefined, authContext(clerkId))

    // Assert — the middleware's user + General inserts never pass updatedAt.
    const user = await readUser(clerkId)
    const [category] = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.userId, user.id))
    expectStampedJustNow(user.updatedAt)
    expectStampedJustNow(category!.updatedAt)
  })
})

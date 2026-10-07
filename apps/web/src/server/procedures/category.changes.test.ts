// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryDeletionTable,
  categoryTable,
  completedTable,
  todoTable,
  userTable,
} from '@/db/schema'

import {
  createCategory,
  deleteCategory,
  listCategories,
  listCategoryChanges,
} from './category'
import { describeIfDb } from './describeIfDb'

vi.setConfig({ testTimeout: 120_000 })
const createdUsers = new Set<number>()

/** Provisions an isolated account through the real category bootstrap and auth middleware.
 * The suite tracks its user for local-only teardown after each scenario.
 * @example const account = await arrangeAccount()
 */
async function arrangeAccount() {
  const options = {
    context: {
      headers: new Headers({
        Authorization: `Bearer test_category_changes_${randomUUID()}`,
      }),
    },
  }
  const { categories } = await call(listCategories, undefined, options)
  const general = categories[0]!
  createdUsers.add(general.userId)
  return { options, general, userId: general.userId }
}

afterEach(async () => {
  // Only accounts provisioned by this suite are removed; child references go first.
  for (const userId of createdUsers) {
    await db.delete(completedTable).where(eq(completedTable.userId, userId))
    await db.delete(todoTable).where(eq(todoTable.userId, userId))
    await db
      .delete(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, userId),
          isNotNull(categoryTable.parentId),
        ),
      )
    await db.delete(categoryTable).where(eq(categoryTable.userId, userId))
    await db.delete(userTable).where(eq(userTable.id, userId))
  }
  createdUsers.clear()
})

describeIfDb('cross-host category deletion receipts (real PostgreSQL)', () => {
  test('replays the selected deletion destination only to its owner, without advancing over foreign receipts, and pages owned history', async () => {
    // Arrange
    const owner = await arrangeAccount()
    const other = await arrangeAccount()
    const source = await call(createCategory, { name: 'Work' }, owner.options)
    const destination = await call(
      createCategory,
      { name: 'Writing' },
      owner.options,
    )
    const foreignSource = await call(
      createCategory,
      { name: 'Private work' },
      other.options,
    )

    // Act
    await call(
      deleteCategory,
      { id: source.id, targetCategoryId: destination.id },
      owner.options,
    )
    await call(deleteCategory, { id: foreignSource.id }, other.options)
    const owned = await call(listCategoryChanges, { afterId: 0 }, owner.options)
    const foreign = await call(
      listCategoryChanges,
      { afterId: 0 },
      other.options,
    )
    const caughtUp = await call(
      listCategoryChanges,
      { afterId: owned.cursor },
      owner.options,
    )

    // Assert
    expect(
      owned.deletions.map(({ sourceId, destinationId }) => ({
        sourceId,
        destinationId,
      })),
    ).toEqual([{ sourceId: source.id, destinationId: destination.id }])
    expect(owned.hasMore).toBe(false)
    expect(owned.cursor).toBe(owned.deletions[0]!.id)
    expect(
      foreign.deletions.map(({ sourceId, destinationId }) => ({
        sourceId,
        destinationId,
      })),
    ).toEqual([{ sourceId: foreignSource.id, destinationId: other.general.id }])
    expect(caughtUp).toEqual({
      deletions: [],
      cursor: owned.cursor,
      hasMore: false,
    })
    const stored = await db
      .select()
      .from(categoryDeletionTable)
      .where(eq(categoryDeletionTable.userId, owner.userId))
    expect(
      stored.map(({ userId, sourceId, destinationId }) => ({
        userId,
        sourceId,
        destinationId,
      })),
    ).toEqual([
      {
        userId: owner.userId,
        sourceId: source.id,
        destinationId: destination.id,
      },
    ])

    // Arrange — committed historical receipts use genuine category IDs, never another suite's IDs.
    const historical = await db
      .insert(categoryTable)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          name: `History ${index}`,
          color: 'blue',
          userId: owner.userId,
        })),
      )
      .returning({ id: categoryTable.id })
    await db.delete(categoryTable).where(
      and(
        eq(categoryTable.userId, owner.userId),
        inArray(
          categoryTable.id,
          historical.map(({ id }) => id),
        ),
      ),
    )
    await db.insert(categoryDeletionTable).values(
      historical.map(({ id }) => ({
        userId: owner.userId,
        sourceId: id,
        destinationId: owner.general.id,
      })),
    )

    // Act
    const firstPage = await call(
      listCategoryChanges,
      { afterId: owned.cursor },
      owner.options,
    )
    const secondPage = await call(
      listCategoryChanges,
      { afterId: firstPage.cursor },
      owner.options,
    )

    // Assert
    expect(firstPage.deletions).toHaveLength(100)
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.cursor).toBe(firstPage.deletions[99]!.id)
    expect(
      secondPage.deletions.map(({ sourceId, destinationId }) => ({
        sourceId,
        destinationId,
      })),
    ).toEqual([
      { sourceId: historical[100]!.id, destinationId: owner.general.id },
    ])
    expect(secondPage.hasMore).toBe(false)
    expect(secondPage.cursor).toBe(secondPage.deletions[0]!.id)
  })

  test('receipt persistence failure rolls back category renaming, child promotion and transferred history', async () => {
    // Arrange
    const owner = await arrangeAccount()
    const source = await call(createCategory, { name: 'Work' }, owner.options)
    const child = await call(
      createCategory,
      { name: 'Work', parentId: source.id },
      owner.options,
    )
    const [completion] = await db
      .insert(completedTable)
      .values({
        title: 'Keep this history',
        userId: owner.userId,
        categoryId: source.id,
        completedAt: new Date('2026-10-01T09:00:00.000Z'),
      })
      .returning()
    const [todo] = await db
      .insert(todoTable)
      .values({
        text: 'Keep this task',
        userId: owner.userId,
        categoryId: source.id,
      })
      .returning()
    // A conflicting receipt makes the real insert fail after earlier transactional moves.
    await db.insert(categoryDeletionTable).values({
      userId: owner.userId,
      sourceId: source.id,
      destinationId: owner.general.id,
    })

    // Act
    const deletion = call(deleteCategory, { id: source.id }, owner.options)

    // Assert
    await expect(deletion).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This category deletion was already recorded',
    })
    const { categories } = await call(listCategories, undefined, owner.options)
    expect(categories.find(({ id }) => id === source.id)).toMatchObject({
      name: 'Work',
      parentId: null,
    })
    expect(categories.find(({ id }) => id === child.id)).toMatchObject({
      name: 'Work',
      parentId: source.id,
    })
    const [keptCompletion] = await db
      .select()
      .from(completedTable)
      .where(eq(completedTable.id, completion!.id))
    const [keptTodo] = await db
      .select()
      .from(todoTable)
      .where(eq(todoTable.id, todo!.id))
    expect(keptCompletion).toMatchObject({
      categoryId: source.id,
      title: 'Keep this history',
      completedAt: new Date('2026-10-01T09:00:00.000Z'),
    })
    expect(keptTodo).toMatchObject({
      categoryId: source.id,
      text: 'Keep this task',
    })
    const changes = await call(
      listCategoryChanges,
      { afterId: 0 },
      owner.options,
    )
    expect(
      changes.deletions.map(({ sourceId, destinationId }) => ({
        sourceId,
        destinationId,
      })),
    ).toEqual([{ sourceId: source.id, destinationId: owner.general.id }])
  })
})

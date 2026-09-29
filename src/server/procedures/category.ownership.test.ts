// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { categoryTable, todoTable, userTable } from '@/db/schema'

import { deleteCategory, listCategories, updateCategory } from './category'
import { describeIfDb } from './describeIfDb'

/**
 * Real-database coverage for the category sidebar badge and the owner check that
 * guards rename/delete. The badge used to be the previous ORM's filtered `_count`
 * and is now a correlated `$count` subquery; the owner check is a hand-written
 * `id AND userId` select. Either can silently widen (count completed tasks, or let
 * one account edit another's category) without a real query behind the test.
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

// Every clerk id a test touches, so afterEach can delete the user and its rows.
const createdClerkIds = new Set<string>()

/**
 * Provisions an account through the real auth middleware and returns its "General" row.
 * @returns The clerk id, the user id and the default category.
 * @example
 * const { clerkId, userId, general } = await arrangeAccount()
 */
async function arrangeAccount() {
  const clerkId = `test_category_owner_${randomUUID()}`
  createdClerkIds.add(clerkId)
  const { categories } = await call(
    listCategories,
    undefined,
    authContext(clerkId),
  )
  const general = categories[0]!
  return { clerkId, userId: general.userId, general }
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    // Todo rows restrict their category's delete, so they go first.
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('category badge counts and owner checks (real PostgreSQL)', () => {
  test('shows each category badge as its open tasks only, leaving out completed tasks and other categories', async () => {
    // Arrange — General: two open + one completed task; Work: one open task.
    const { clerkId, userId, general } = await arrangeAccount()
    const work = requireRow(
      await db
        .insert(categoryTable)
        .values({ name: 'Work', color: 'green', userId })
        .returning(),
      'category.insert',
    )
    await db.insert(todoTable).values([
      { text: 'open one', userId, categoryId: general.id },
      { text: 'open two', userId, categoryId: general.id },
      {
        text: 'already done',
        completed: true,
        completedAt: new Date('2026-06-03T14:30:00.000Z'),
        userId,
        categoryId: general.id,
      },
      { text: 'work task', userId, categoryId: work.id },
    ])

    // Act
    const { categories } = await call(
      listCategories,
      undefined,
      authContext(clerkId),
    )

    // Assert — the counts are real numbers, oldest category first.
    expect(
      categories.map((category) => ({
        name: category.name,
        _count: category._count,
      })),
    ).toEqual([
      { name: 'General', _count: { todos: 2 } },
      { name: 'Work', _count: { todos: 1 } },
    ])
  })

  test('answers NOT_FOUND and keeps the name when an account renames a category it does not own', async () => {
    // Arrange
    const owner = await arrangeAccount()
    const intruder = await arrangeAccount()
    const ownersWork = requireRow(
      await db
        .insert(categoryTable)
        .values({ name: 'Work', color: 'green', userId: owner.userId })
        .returning(),
      'category.insert',
    )

    // Act
    const rename = call(
      updateCategory,
      { id: ownersWork.id, data: { name: 'Hijacked' } },
      authContext(intruder.clerkId),
    )

    // Assert
    await expect(rename).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Category not found',
    })
    const [stored] = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, ownersWork.id))
    expect(stored).toMatchObject({ name: 'Work', userId: owner.userId })
  })

  test('answers NOT_FOUND and keeps the category when an account deletes a category it does not own', async () => {
    // Arrange
    const owner = await arrangeAccount()
    const intruder = await arrangeAccount()
    const ownersWork = requireRow(
      await db
        .insert(categoryTable)
        .values({ name: 'Work', color: 'green', userId: owner.userId })
        .returning(),
      'category.insert',
    )

    // Act
    const removal = call(
      deleteCategory,
      { id: ownersWork.id },
      authContext(intruder.clerkId),
    )

    // Assert
    await expect(removal).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Category not found',
    })
    const survivors = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, ownersWork.id))
    expect(survivors).toHaveLength(1)
  })

  test('refuses to delete the default category and leaves its tasks in place', async () => {
    // Arrange
    const { clerkId, userId, general } = await arrangeAccount()
    const task = requireRow(
      await db
        .insert(todoTable)
        .values({ text: 'stay here', userId, categoryId: general.id })
        .returning(),
      'todo.insert',
    )

    // Act
    const removal = call(
      deleteCategory,
      { id: general.id },
      authContext(clerkId),
    )

    // Assert
    await expect(removal).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Cannot delete the default category',
    })
    const [storedTask] = await db
      .select()
      .from(todoTable)
      .where(eq(todoTable.id, task.id))
    expect(storedTask).toMatchObject({ categoryId: general.id })
  })

  test('answers an update with no fields by returning the category unchanged and stamping updatedAt', async () => {
    // Arrange — park updatedAt in the past so a fresh stamp is unmistakable.
    const { clerkId, userId } = await arrangeAccount()
    const work = requireRow(
      await db
        .insert(categoryTable)
        .values({ name: 'Work', color: 'green', userId })
        .returning(),
      'category.insert',
    )
    const parkedAt = new Date('2026-01-01T00:00:00.000Z')
    await db
      .update(categoryTable)
      .set({ updatedAt: parkedAt })
      .where(eq(categoryTable.id, work.id))

    // Act
    const updated = await call(
      updateCategory,
      { id: work.id, data: {} },
      authContext(clerkId),
    )

    // Assert — the name and color survive and the row is stamped as touched.
    expect(updated).toMatchObject({ id: work.id, name: 'Work', color: 'green' })
    expect(updated.updatedAt.getTime()).toBeGreaterThan(parkedAt.getTime())
  })
})

// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { categoryTable, completedTable, userTable } from '@/db/schema'

import { listCategories } from './category'
import { createCompleted, deleteCompleted } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-database coverage for the LiveEditor "complete" flow: `createCompleted` writes
 * the row a checkbox tick produces and `deleteCompleted` is the toast-undo. Neither had
 * a test before the ORM swap, and both changed (`INSERT … RETURNING`, a conditional
 * `DELETE … RETURNING` whose row count decides between success, FORBIDDEN and NOT_FOUND).
 */
vi.setConfig({ testTimeout: 30_000 })

/** Well past the 60 s undo window enforced by `deleteCompleted`. */
const FIVE_MINUTES_MS = 5 * 60 * 1000

const createdClerkIds = new Set<string>()

/**
 * Builds the direct-call options every authenticated procedure needs.
 * @param clerkId - Clerk user id placed in the Bearer header.
 * @returns oRPC call options carrying the auth header.
 * @example
 * await call(createCompleted, input, authContext('user_1'))
 */
function authContext(clerkId: string) {
  return {
    context: {
      headers: new Headers({ Authorization: `Bearer ${clerkId}` }),
    },
  }
}

/**
 * Provisions a user through the real auth middleware and returns its default category id.
 * @returns The clerk id and that account's "General" category id.
 * @example
 * const { clerkId, categoryId } = await arrangeAccount()
 */
async function arrangeAccount(): Promise<{
  clerkId: string
  categoryId: number
}> {
  const clerkId = `test_completed_${randomUUID()}`
  createdClerkIds.add(clerkId)
  const { categories } = await call(
    listCategories,
    undefined,
    authContext(clerkId),
  )
  return { clerkId, categoryId: categories[0]!.id }
}

/**
 * Counts an account's completed rows by title.
 * @param title - Title to look for.
 * @returns The matching rows.
 * @example
 * await findCompletedByTitle('buy milk') // => [{ id: 3, … }]
 */
async function findCompletedByTitle(title: string) {
  return db.select().from(completedTable).where(eq(completedTable.title, title))
}

afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    if (!user) continue
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('completed.create and completed.delete (real PostgreSQL)', () => {
  test('creates a Completed row in the caller’s category and returns it', async () => {
    // Arrange
    const { clerkId, categoryId } = await arrangeAccount()
    const title = `buy milk ${randomUUID()}`

    // Act
    const created = await call(
      createCompleted,
      { categoryId, title },
      authContext(clerkId),
    )

    // Assert — createdAt is the current UTC instant, which the 60 s undo window is measured from.
    expect(created).toMatchObject({ title, categoryId, archived: false })
    expect(Math.abs(created.createdAt.getTime() - Date.now())).toBeLessThan(
      5_000,
    )
    expect(await findCompletedByTitle(title)).toHaveLength(1)
  })

  test('answers NOT_FOUND and writes nothing when the category belongs to another account', async () => {
    // Arrange
    const owner = await arrangeAccount()
    const intruder = await arrangeAccount()
    const title = `not yours ${randomUUID()}`

    // Act
    const attempt = call(
      createCompleted,
      { categoryId: owner.categoryId, title },
      authContext(intruder.clerkId),
    )

    // Assert
    await expect(attempt).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Category not found',
    })
    expect(await findCompletedByTitle(title)).toHaveLength(0)
  })

  test('undoes a fresh completion inside the window and returns its id', async () => {
    // Arrange
    const { clerkId, categoryId } = await arrangeAccount()
    const title = `undo me ${randomUUID()}`
    const created = await call(
      createCompleted,
      { categoryId, title },
      authContext(clerkId),
    )

    // Act
    const result = await call(
      deleteCompleted,
      { id: created.id },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ id: created.id })
    expect(await findCompletedByTitle(title)).toHaveLength(0)
  })

  test('answers FORBIDDEN and keeps the row once the undo window has passed', async () => {
    // Arrange — age the row's insert time beyond the window.
    const { clerkId, categoryId } = await arrangeAccount()
    const title = `too late ${randomUUID()}`
    const created = await call(
      createCompleted,
      { categoryId, title },
      authContext(clerkId),
    )
    await db
      .update(completedTable)
      .set({ createdAt: new Date(Date.now() - FIVE_MINUTES_MS) })
      .where(eq(completedTable.id, created.id))

    // Act
    const attempt = call(
      deleteCompleted,
      { id: created.id },
      authContext(clerkId),
    )

    // Assert
    await expect(attempt).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Undo window has expired for this completion',
    })
    expect(await findCompletedByTitle(title)).toHaveLength(1)
  })

  test('answers NOT_FOUND for an id that does not exist', async () => {
    // Arrange
    const { clerkId } = await arrangeAccount()

    // Act
    const attempt = call(
      deleteCompleted,
      { id: 2_000_000_000 },
      authContext(clerkId),
    )

    // Assert
    await expect(attempt).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Completed row not found',
    })
  })

  test('never deletes another account’s completion, even inside the window', async () => {
    // Arrange
    const owner = await arrangeAccount()
    const intruder = await arrangeAccount()
    const title = `mine ${randomUUID()}`
    const created = await call(
      createCompleted,
      { categoryId: owner.categoryId, title },
      authContext(owner.clerkId),
    )

    // Act
    const attempt = call(
      deleteCompleted,
      { id: created.id },
      authContext(intruder.clerkId),
    )

    // Assert
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await findCompletedByTitle(title)).toHaveLength(1)
  })
})

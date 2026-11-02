// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  todoTable,
  userTable,
} from '@/db/schema'
import { settleBehindHeldTransaction } from '@/test/heldTransaction'

import { deleteCategory, listCategories, updateCategory } from './category'
import { describeIfDb } from './describeIfDb'

/**
 * Real-database coverage for rows that disappear while a request is using them.
 * The previous ORM threw on an `update` / `delete` that matched nothing; drizzle
 * returns `[]`, so these paths only fail loudly because of `requireRow` (or, for
 * the import, because the whole batch shares one transaction). Each race is made
 * deterministic by parking a second transaction on the row, letting the procedure
 * block behind it, then committing the delete.
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
  const clerkId = `test_vanished_${randomUUID()}`
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
    // FK-safe teardown: child rows before the user.
    await db.delete(completedTable).where(eq(completedTable.userId, user.id))
    await db.delete(todoTable).where(eq(todoTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('rows that vanish mid-request (real PostgreSQL)', () => {
  test('fails the rename instead of reporting a phantom success when another request deletes the category first', async () => {
    // Arrange
    const { clerkId, userId } = await arrangeAccount()
    const work = requireRow(
      await db
        .insert(categoryTable)
        .values({ name: 'Work', color: 'green', userId })
        .returning(),
      'category.insert',
    )

    // Act — the owner check still sees the row; the UPDATE parks on its lock and then matches nothing.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx.delete(categoryTable).where(eq(categoryTable.id, work.id))
      },
      startCall: async () =>
        call(
          updateCategory,
          { id: work.id, data: { name: 'Side Project' } },
          authContext(clerkId),
        ),
    })

    // Assert
    expect(settled).toMatchObject({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update category',
        // The vanished row is what failed it, not some other error inside the procedure.
        cause: { message: 'category.update matched no row' },
      },
    })
  })

  test('fails the delete instead of reporting success when another request removes the category first', async () => {
    // Arrange
    const { clerkId, userId } = await arrangeAccount()
    const work = requireRow(
      await db
        .insert(categoryTable)
        .values({ name: 'Work', color: 'green', userId })
        .returning(),
      'category.insert',
    )

    // Act — the owner check still sees the row; the DELETE parks on its lock and then matches nothing.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx.delete(categoryTable).where(eq(categoryTable.id, work.id))
      },
      startCall: async () =>
        call(deleteCategory, { id: work.id }, authContext(clerkId)),
    })

    // Assert
    expect(settled).toMatchObject({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete category',
        cause: { message: 'category.delete matched no row' },
      },
    })
  })
})

// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { and, count, eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import { PG_FOREIGN_KEY_VIOLATION } from '@/db/constants'
import { isPgError } from '@/db/isPgError'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  importBatchTable,
  todoTable,
  userTable,
} from '@/db/schema'
import { settleBehindHeldTransaction } from '@/test/heldTransaction'

import { deleteCategory, listCategories, updateCategory } from './category'
import { importLocalCompleted } from './completed'
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
    await db
      .delete(importBatchTable)
      .where(eq(importBatchTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

/**
 * Reads the `cause` an oRPC error carries, where the underlying database or helper error lives.
 * @param settled - Outcome of a call run through {@link settleBehindHeldTransaction}.
 * @returns The rejection's `cause`, or `undefined` when the call resolved or carried none.
 * @example
 * readFailureCause({ error: new ORPCError('INTERNAL_SERVER_ERROR', { cause: dbError }) }) // => dbError
 */
function readFailureCause(
  settled: { value: unknown } | { error: unknown },
): unknown {
  if (!('error' in settled)) return undefined
  const { error } = settled
  return typeof error === 'object' && error !== null && 'cause' in error
    ? error.cause
    : undefined
}

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

  test('rolls the whole import back when its category disappears mid-write, so a retry lands instead of being reported as already imported', async () => {
    // Arrange
    const { clerkId, userId, general } = await arrangeAccount()
    const batchId = randomUUID()
    const input = {
      batchId,
      items: [
        {
          localId: 'keep-1',
          title: 'push-ups',
          completedAt: new Date('2026-09-01T09:00:00.000Z'),
        },
      ],
    }

    // Act — the category lookup still sees "General"; the row insert parks on its
    // foreign key and then violates it once the delete commits.
    const settled = await settleBehindHeldTransaction({
      holdLocks: async (tx) => {
        await tx.delete(categoryTable).where(eq(categoryTable.id, general.id))
      },
      startCall: async () =>
        call(importLocalCompleted, input, authContext(clerkId)),
    })
    const [batchRowsAfterFailure] = await db
      .select({ value: count() })
      .from(importBatchTable)
      .where(
        and(
          eq(importBatchTable.userId, userId),
          eq(importBatchTable.id, `${userId}:${batchId}`),
        ),
      )
    const retry = await call(importLocalCompleted, input, authContext(clerkId))

    // Assert — the failed attempt left no batch marker behind, so the retry imports the keep.
    expect(settled).toMatchObject({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to import local completions',
      },
    })
    // The category the batch was filed under vanished, so the row insert broke a foreign key.
    expect(isPgError(readFailureCause(settled), PG_FOREIGN_KEY_VIOLATION)).toBe(
      true,
    )
    expect(batchRowsAfterFailure?.value).toBe(0)
    expect(retry).toEqual({ batchId, imported: 1, alreadyImported: false })
  })
})

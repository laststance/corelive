// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { call } from '@orpc/server'
import { count, eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '@/db'
import {
  categoryTable,
  completedTable,
  importBatchTable,
  userTable,
} from '@/db/schema'

import { listCategories } from './category'
import { importLocalCompleted } from './completed'
import { describeIfDb } from './describeIfDb'

/**
 * Real-database coverage for the edges of `completed.importLocal`'s single
 * multi-row `INSERT … ON CONFLICT DO NOTHING RETURNING`. The previous ORM's
 * `createMany` ran under a 30-second transaction budget sized for the 2000-keep
 * maximum; that budget is gone, so the maximum batch must still land in one call,
 * and the returned row count must stay honest when rows inside one batch collide.
 */
vi.setConfig({ testTimeout: 60_000 })

/**
 * Builds the direct-call options every authenticated procedure needs.
 * @param clerkId - Clerk user id placed in the Bearer header.
 * @returns oRPC call options carrying the auth header.
 * @example
 * await call(importLocalCompleted, input, authContext('user_1'))
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
 * Provisions an account through the real auth middleware.
 * @returns The clerk id and the user id.
 * @example
 * const { clerkId, userId } = await arrangeAccount()
 */
async function arrangeAccount() {
  const clerkId = `test_import_limits_${randomUUID()}`
  createdClerkIds.add(clerkId)
  const { categories } = await call(
    listCategories,
    undefined,
    authContext(clerkId),
  )
  return { clerkId, userId: categories[0]!.userId }
}

/**
 * Counts one account's Completed rows.
 * @param userId - Owner whose rows to count.
 * @returns The number of Completed rows.
 * @example
 * await countCompleted(1) // => 2000
 */
async function countCompleted(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(completedTable)
    .where(eq(completedTable.userId, userId))
  return row?.value ?? 0
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
    await db
      .delete(importBatchTable)
      .where(eq(importBatchTable.userId, user.id))
    await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
    await db.delete(userTable).where(eq(userTable.id, user.id))
  }
  createdClerkIds.clear()
})

describeIfDb('completed.importLocal batch limits (real PostgreSQL)', () => {
  test('merges a full 2000-keep device history in one call', async () => {
    // Arrange — the schema's maximum batch, one keep per minute.
    const { clerkId, userId } = await arrangeAccount()
    const batchId = randomUUID()
    const items = Array.from({ length: 2000 }, (_, index) => ({
      localId: `keep-${index}`,
      title: `keep number ${index}`,
      completedAt: new Date(
        Date.parse('2026-06-01T00:00:00.000Z') + index * 60_000,
      ),
    }))

    // Act
    const result = await call(
      importLocalCompleted,
      { batchId, items },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ batchId, imported: 2000, alreadyImported: false })
    expect(await countCompleted(userId)).toBe(2000)
  })

  test('lands a keep once and reports one import when the same local id appears twice in a single batch', async () => {
    // Arrange
    const { clerkId, userId } = await arrangeAccount()
    const batchId = randomUUID()
    const keep = {
      localId: 'keep-dup',
      title: 'push-ups',
      completedAt: new Date('2026-09-01T09:00:00.000Z'),
    }

    // Act
    const result = await call(
      importLocalCompleted,
      { batchId, items: [keep, { ...keep }] },
      authContext(clerkId),
    )

    // Assert
    expect(result).toEqual({ batchId, imported: 1, alreadyImported: false })
    expect(await countCompleted(userId)).toBe(1)
  })
})

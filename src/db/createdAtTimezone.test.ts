// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { expect, test } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'

import {
  categoryTable,
  skillNodeTable,
  skillTreeTable,
  userTable,
} from './schema'

import { db } from './index'

/** Longest a row's stamp may differ from the test's own clock and still count as "now". */
const NOW_TOLERANCE_MS = 5_000

/** Session zones on either side of UTC; the default `CURRENT_TIMESTAMP` reads the session zone. */
const NON_UTC_SESSION_ZONES = ['America/Los_Angeles', 'Asia/Tokyo']

/**
 * Runs a callback against a drizzle client whose PostgreSQL session uses a given `TimeZone`, then closes it.
 * @param timeZone - IANA zone for the session, e.g. `Asia/Tokyo`.
 * @param callback - Work to run with the zoned client.
 * @returns Whatever the callback returns.
 * @example
 * await withSessionTimeZone('Asia/Tokyo', (zoned) => zoned.insert(categoryTable).values(row))
 */
async function withSessionTimeZone<Result>(
  timeZone: string,
  callback: (zoned: ReturnType<typeof drizzle>) => Promise<Result>,
): Promise<Result> {
  const pool = new Pool({
    connectionString: process.env.POSTGRES_PRISMA_URL,
    options: `-c TimeZone=${timeZone}`,
  })
  try {
    return await callback(drizzle({ client: pool }))
  } finally {
    await pool.end()
  }
}

describeIfDb(
  'server-stamped createdAt / updatedAt defaults (real PostgreSQL)',
  () => {
    test.each(NON_UTC_SESSION_ZONES)(
      'stamps createdAt with the current UTC instant when the database session runs in %s, so day buckets and the 60 s undo window do not shift',
      async (timeZone) => {
        // Arrange
        const clerkId = `test_created_at_${randomUUID()}`
        const [user] = await db
          .insert(userTable)
          .values({ clerkId })
          .returning({ id: userTable.id })

        try {
          // Act
          const [category] = await withSessionTimeZone(timeZone, (zoned) =>
            zoned
              .insert(categoryTable)
              .values({ name: 'Zoned', userId: user!.id })
              .returning(),
          )

          // Assert
          expect(
            Math.abs(category!.createdAt.getTime() - Date.now()),
          ).toBeLessThan(NOW_TOLERANCE_MS)
        } finally {
          // Category.userId is ON DELETE RESTRICT, so the user can only go once its category is gone.
          await db
            .delete(categoryTable)
            .where(eq(categoryTable.userId, user!.id))
          await db.delete(userTable).where(eq(userTable.clerkId, clerkId))
        }
      },
    )

    test.each(NON_UTC_SESSION_ZONES)(
      'stamps a new skill node with the current UTC instant when the database session runs in %s',
      async (timeZone) => {
        // Arrange
        const clerkId = `test_node_stamp_${randomUUID()}`
        const [user] = await db
          .insert(userTable)
          .values({ clerkId })
          .returning({ id: userTable.id })

        try {
          // Act
          const node = await withSessionTimeZone(timeZone, async (zoned) => {
            const [tree] = await zoned
              .insert(skillTreeTable)
              .values({ userId: user!.id, name: 'Zoned tree' })
              .returning({ id: skillTreeTable.id })
            const [inserted] = await zoned
              .insert(skillNodeTable)
              .values({ skillTreeId: tree!.id, name: 'Zoned node', x: 0, y: 0 })
              .returning()
            return inserted!
          })

          // Assert
          expect(Math.abs(node.createdAt.getTime() - Date.now())).toBeLessThan(
            NOW_TOLERANCE_MS,
          )
          expect(Math.abs(node.updatedAt.getTime() - Date.now())).toBeLessThan(
            NOW_TOLERANCE_MS,
          )
        } finally {
          await db.delete(userTable).where(eq(userTable.clerkId, clerkId))
        }
      },
    )
  },
)

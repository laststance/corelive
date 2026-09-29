// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'

import { isPgError } from './isPgError'
import { userTable } from './schema'
import { runTransaction } from './transaction'

import { db } from './index'

/** SQLSTATE `query_canceled`: what PostgreSQL raises when `statement_timeout` expires. */
const PG_QUERY_CANCELED = '57014'

/**
 * Reads `statement_timeout` as the server reports it to the calling session.
 * @param executor - Anything that can run a query: the pool client or a transaction.
 * @returns The setting text, e.g. `'0'` or `'1234ms'`.
 * @example
 * await readStatementTimeout(db) // => '0'
 */
async function readStatementTimeout(executor: Pick<typeof db, 'execute'>) {
  const { rows } = await executor.execute<{ statement_timeout: string }>(
    sql`SHOW statement_timeout`,
  )
  return rows[0]?.statement_timeout
}

describeIfDb('runTransaction (real PostgreSQL)', () => {
  test('gives up on a statement that outlives the limit, so a stalled database fails fast instead of pinning a pooled connection', async () => {
    // Arrange
    const startedAt = Date.now()

    // Act
    const failure = await runTransaction(async (tx) => {
      await tx.execute(sql`SELECT pg_sleep(5)`)
    }, 200).then(
      () => undefined,
      (error: unknown) => error,
    )

    // Assert
    expect(isPgError(failure, PG_QUERY_CANCELED)).toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(3_000)
  })

  test('applies the limit inside the transaction and returns the callback value', async () => {
    // Arrange / Act
    const result = await runTransaction(async (tx) => {
      return { during: await readStatementTimeout(tx) }
    }, 1234)

    // Assert
    expect(result).toEqual({ during: '1234ms' })
  })

  test('leaves no limit on the pooled connection once the transaction has ended', async () => {
    // Arrange
    await runTransaction(async () => undefined, 1234)

    // Act — ten concurrent reads touch every connection the pool can hold, including the one the transaction used.
    const readings = await Promise.all(
      Array.from({ length: 10 }, async () => readStatementTimeout(db)),
    )

    // Assert
    expect(readings).toEqual(Array.from({ length: 10 }, () => '0'))
  })

  test('rolls back everything the callback wrote when the callback throws', async () => {
    // Arrange
    const clerkId = `test_tx_rollback_${randomUUID()}`

    // Act
    await runTransaction(async (tx) => {
      await tx.insert(userTable).values({ clerkId })
      throw new Error('abort')
    }).catch(() => undefined)

    // Assert
    const survivors = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, clerkId))
    expect(survivors).toEqual([])
  })
})

// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import type { PoolClient } from 'pg'
import { expect, type MockInstance, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'

import { isPgError } from './isPgError'
import { userTable } from './schema'
import { runTransaction } from './transaction'

import { db } from './index'

/** SQLSTATE `query_canceled`: what PostgreSQL raises when `statement_timeout` expires. */
const PG_QUERY_CANCELED = '57014'

/** Connections the shared pool can hold; pg-pool fills `max` with 10 when it is not configured. */
const POOL_SIZE = db.$client.options.max ?? 10

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

    // Act — one concurrent read per pool slot touches every connection the pool can hold, including the one the transaction used.
    const readings = await Promise.all(
      Array.from({ length: POOL_SIZE }, async () => readStatementTimeout(db)),
    )

    // Assert
    expect(readings).toEqual(Array.from({ length: POOL_SIZE }, () => '0'))
  })

  test('ends a transaction that sits idle past the limit and leaves the pool usable, so a callback stuck on external work cannot pin a connection', async () => {
    // Arrange
    const startedAt = Date.now()

    // Act — the callback pauses between two statements for three times the limit.
    const failure = await runTransaction(async (tx) => {
      await tx.execute(sql`SELECT 1`)
      await new Promise((resolve) => setTimeout(resolve, 600))
      await tx.execute(sql`SELECT 2`)
    }, 200).then(
      () => undefined,
      (error: unknown) => error,
    )

    // Assert — the server terminated the session, so there is no SQLSTATE to match; the pool still answers.
    expect(failure).toBeInstanceOf(Error)
    expect(Date.now() - startedAt).toBeLessThan(3_000)
    const { rows } = await db.execute<{ alive: number }>(sql`SELECT 1 AS alive`)
    expect(rows).toEqual([{ alive: 1 }])
  })

  test('hands the pooled connection back when BEGIN itself fails, so a stale socket cannot shrink the pool for good', async () => {
    // Arrange — the first statement on the next checked-out connection is BEGIN; make it reject.
    let beginSpy: MockInstance | undefined
    db.$client.once('acquire', (client) => {
      beginSpy = vi
        .spyOn(client, 'query')
        .mockRejectedValueOnce(new Error('BEGIN failed'))
    })
    const callback = vi.fn(async () => 'never runs')

    // Act
    const failure = await runTransaction(callback).then(
      () => undefined,
      (error: unknown) => error,
    )
    beginSpy?.mockRestore()

    // Assert — the callback never started, and no connection is left checked out.
    expect(failure).toBeInstanceOf(Error)
    expect(callback).not.toHaveBeenCalled()
    expect(db.$client.totalCount - db.$client.idleCount).toBe(0)
    const { rows } = await db.execute<{ alive: number }>(sql`SELECT 1 AS alive`)
    expect(rows).toEqual([{ alive: 1 }])
  })

  test('discards the connection and rejects when the server stops answering mid-transaction, so a silent socket cannot pin a pool slot past the deadline', async () => {
    // Arrange — after BEGIN, the statement that sets the limits never gets an answer, like a proxy that keeps the
    // socket open and forwards nothing. The 50 ms limit makes the client-side deadline 50 ms + 2 s.
    const slotsInUseBefore = db.$client.totalCount - db.$client.idleCount
    const totalBefore = db.$client.totalCount
    let stalledClient: MockInstance | undefined
    let stalled: PoolClient | undefined
    const removed: PoolClient[] = []
    const recordRemoved = (client: PoolClient) => removed.push(client)
    db.$client.on('remove', recordRemoved)
    const stallAfterBegin = (client: PoolClient) => {
      stalled = client
      const realQuery = client.query.bind(client) as (
        ...args: unknown[]
      ) => unknown
      stalledClient = vi
        .spyOn(client, 'query')
        .mockImplementation((...args: unknown[]) => {
          const first = args[0]
          const text =
            typeof first === 'string'
              ? first
              : ((first as { text?: string }).text ?? '')
          return text.includes('set_config')
            ? new Promise(() => {})
            : realQuery(...args)
        })
    }
    db.$client.once('acquire', stallAfterBegin)

    try {
      // Act
      const failure = await runTransaction(
        async () => 'never reached',
        50,
      ).then(
        () => undefined,
        (error: unknown) => error,
      )

      // Assert — rejected with the deadline message, the slot is free again and the connection is gone.
      expect(failure).toEqual(
        new Error(
          'Transaction did not finish within 2050 ms; its database connection was discarded and the outcome is unknown',
        ),
      )
      expect(db.$client.totalCount - db.$client.idleCount).toBe(
        slotsInUseBefore,
      )
      expect(db.$client.totalCount).toBeLessThanOrEqual(totalBefore)
      const { rows } = await db.execute<{ one: number }>(sql`SELECT 1 AS one`)
      expect(rows[0]?.one).toBe(1)
      // The pool announces every connection it destroys: the stalled one must be among them. Handing it back
      // instead would let the next request run inside a transaction that already sent BEGIN.
      await vi.waitFor(() => expect(removed).toContain(stalled))
    } finally {
      db.$client.off('acquire', stallAfterBegin)
      db.$client.off('remove', recordRemoved)
      stalledClient?.mockRestore()
    }
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

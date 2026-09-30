// @vitest-environment node
import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'

import { runTransaction } from './transaction'

import { db } from './index'

describeIfDb('connection dropped mid-transaction (real PostgreSQL)', () => {
  test('rejects the transaction and keeps the process alive when the server kills its connection, instead of crashing on an unhandled client error', async () => {
    // Arrange
    const uncaught: unknown[] = []
    const recordUncaught = (error: unknown) => void uncaught.push(error)
    process.on('uncaughtException', recordUncaught)
    let announcePid!: (pid: number) => void
    const pidAnnounced = new Promise<number>((resolve) => {
      announcePid = resolve
    })
    const stalledTransaction = runTransaction(async (tx) => {
      const { rows } = await tx.execute<{ pid: number }>(
        sql`SELECT pg_backend_pid() AS pid`,
      )
      announcePid(rows[0]!.pid)
      await tx.execute(sql`SELECT pg_sleep(10)`)
    }).then(
      () => undefined,
      (error: unknown) => error,
    )

    try {
      // Act — another pooled connection terminates the backend that holds the open transaction.
      const backendPid = await pidAnnounced
      await db.execute(sql`SELECT pg_terminate_backend(${backendPid})`)
      const failure = await stalledTransaction
      // The dead client's 'error' event fires on a later tick than the rejection.
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Assert
      expect(failure).toBeInstanceOf(Error)
      expect(uncaught).toEqual([])
      const { rows } = await db.execute<{ alive: number }>(
        sql`SELECT 1 AS alive`,
      )
      expect(rows).toEqual([{ alive: 1 }])
    } finally {
      process.off('uncaughtException', recordUncaught)
    }
  })
})

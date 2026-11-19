import { sql } from 'drizzle-orm'

import { db } from '@/db'

/** The transaction handle {@link db}.transaction passes to its callback. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Waits for a conflicting row or unique-key write to reach the holder's uncommitted transaction.
 * A concurrent suite can request a table lock behind the same holder before the tested write even starts.
 * @param holderPid - `pg_backend_pid()` of the transaction that holds the locks.
 * @returns Resolves once a writer waits for that transaction to finish.
 * @throws when nothing blocks within ten seconds.
 * @example
 * await waitForStatementBlockedBy(holderPid)
 */
async function waitForStatementBlockedBy(holderPid: number): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const { rows } = await db.execute<{ blocked: number }>(sql`
      SELECT count(*)::int AS blocked
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND wait_event = 'transactionid'
        AND ${holderPid}::int = ANY(pg_blocking_pids(pid))
    `)
    if ((rows[0]?.blocked ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(
    `No statement became blocked behind backend ${holderPid} within 10s`,
  )
}

/**
 * Runs a procedure call while a second transaction holds locks the call must wait for,
 * then commits that transaction so the call's blocked statement fails (or proceeds) for real.
 *
 * Deterministic replacement for "fire N calls and hope they collide": the holder takes
 * its locks first, the call is started and observed parked behind the holder's backend, and only
 * then is the holder committed.
 *
 * @param options.holdLocks - Statements the second transaction runs and then keeps open.
 * @param options.startCall - Starts the procedure call under test (do not await inside).
 * @returns `{ value }` when the call resolved, `{ error }` when it rejected.
 * @example
 * const settled = await settleBehindHeldTransaction({
 *   holdLocks: async (tx) => { await tx.delete(todoTable).where(eq(todoTable.id, 1)) },
 *   startCall: () => call(assignTask, input, authContext(clerkId)),
 * })
 */
export async function settleBehindHeldTransaction<Result>(options: {
  holdLocks: (tx: Transaction) => Promise<void>
  startCall: () => Promise<Result>
}): Promise<{ value: Result } | { error: unknown }> {
  const { promise: released, resolve: release } = Promise.withResolvers<void>()
  const { promise: started, resolve: markStarted } =
    Promise.withResolvers<void>()
  let holderPid = 0
  const finished = db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid() AS pid`,
    )
    holderPid = rows[0]?.pid ?? 0
    await options.holdLocks(tx)
    markStarted()
    await released
  })
  // If the lock-taking statements throw, surface that instead of hanging on `started`.
  await Promise.race([started, finished])

  try {
    const outcome = options.startCall().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    await waitForStatementBlockedBy(holderPid)
    release()
    await finished
    return await outcome
  } finally {
    release()
    await finished.catch(() => undefined)
  }
}

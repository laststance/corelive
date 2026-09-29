import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

import { databaseSchema, db } from './index'

/** The transaction handle a drizzle client passes to its `transaction` callback; {@link db} and the per-call client {@link runTransaction} builds share this type. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Time budget for an ordinary transaction — the interactive-transaction default of the previous ORM. */
const DEFAULT_TRANSACTION_TIMEOUT_MS = 5_000

/** Time budget for `importLocalCompleted`, whose single transaction inserts up to {@link IMPORT_LOCAL_MAX_ITEMS} rows. */
export const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000

/**
 * Runs a callback in one database transaction that gives up on a stalled database instead of waiting for the platform to kill the request.
 *
 * The previous ORM aborted an interactive transaction after 5 s (30 s for the local-completion import) and every catch block turned that into the oRPC 500 envelope; a bare `db.transaction` has no limit, so a held lock or a hung connection would pin a pooled connection until the serverless function timed out. The limits are set with `set_config(..., true)` (`SET LOCAL`), which lasts only until COMMIT/ROLLBACK: nothing leaks to the pooled connection, and no startup parameter is needed (a pooler in transaction mode rejects those).
 * The connection is checked out here, not by `db.transaction`: drizzle sends BEGIN before its own try/finally, so a BEGIN that fails (a socket gone stale while a serverless instance was frozen) would never hand the client back and the pool would lose that slot for good. A drizzle client built over one checked-out connection runs the transaction on it and leaves the release to this function.
 * Called by every procedure that writes more than one row atomically: {@link resolveUser}'s account creation, the Clerk webhook, `deleteCategory`, `importLocalCompleted` and the skill-tree writes.
 *
 * @param callback - Work to run atomically; receives the transaction handle.
 * @param timeoutMs - Longest a single statement, or a pause between statements, may take.
 * @returns Whatever the callback returns, once committed.
 * @throws A `DrizzleQueryError` wrapping SQLSTATE `57014` when one statement outlives `timeoutMs`; the transaction rolls back. A pause between statements longer than `timeoutMs` makes the server end the whole connection (`25P03`, session terminated), so that rejection is a plain connection error with no usable SQLSTATE; the pool discards the dead client.
 * @example
 * const category = await runTransaction(async (tx) => {
 *   await tx.update(todoTable).set({ categoryId: 1 }).where(eq(todoTable.categoryId, 2))
 *   return tx.delete(categoryTable).where(eq(categoryTable.id, 2)).returning()
 * })
 */
export async function runTransaction<Result>(
  callback: (tx: Transaction) => Promise<Result>,
  timeoutMs: number = DEFAULT_TRANSACTION_TIMEOUT_MS,
): Promise<Result> {
  const client = await db.$client.connect()
  try {
    return await drizzle({ client, schema: databaseSchema }).transaction(
      async (tx) => {
        // `set_config` takes bound parameters, unlike `SET LOCAL`, so the limit needs no string splicing.
        await tx.execute(sql`
          SELECT set_config('statement_timeout', ${String(timeoutMs)}, true),
                 set_config('idle_in_transaction_session_timeout', ${String(timeoutMs)}, true)
        `)
        return callback(tx)
      },
    )
  } finally {
    // A client whose connection is no longer queryable is discarded by the pool on release.
    client.release()
  }
}

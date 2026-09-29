import 'dotenv/config'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { createModuleLogger } from '../lib/logger'

import * as relations from './relations'
import * as schema from './schema'

const log = createModuleLogger('db')

// `connectionTimeoutMillis` bounds how long a request waits for a free or new connection: pg's
// default is no limit, so an unreachable database would hang until the platform kills the function.
// Per-statement limits are not set here: a startup `options` parameter is rejected by transaction-mode
// poolers, so {@link runTransaction} sets them per transaction with `set_config(..., true)` instead.
const pool = new Pool({
  connectionString: process.env.POSTGRES_PRISMA_URL,
  connectionTimeoutMillis: 10_000,
})

// An idle client can be dropped by the server or a proxy between requests. pg-pool
// re-emits that on the pool, and an 'error' event with no listener is an uncaught
// exception that takes the whole process down. Log it; the pool discards the dead
// client and opens a fresh one on the next query.
pool.on('error', (error) => {
  // Serialized by {@link logSerializers}, which expands `err` into message + stack and drops SQL/params.
  log.error({ err: error }, 'Idle PostgreSQL client error')
})

// pg-pool removes its idle listener while a client is checked out, and drizzle's `db.transaction`
// checks out a raw client without adding one. A connection that drops mid-transaction would then
// emit an unhandled 'error' (an uncaught exception that ends plain Node processes and bypasses the
// logger under Next.js). The pool still discards the non-queryable client on release.
pool.on('connect', (client) => {
  client.on('error', (error) => {
    log.warn({ err: error }, 'PostgreSQL client error')
  })
})

/**
 * Shared drizzle client over one `pg` pool — the only database handle the app uses.
 *
 * Replaces the former client module and the second private client the Clerk webhook
 * used to build, so a serverless instance now holds one pool instead of two.
 * The connection string keeps its historical env name `POSTGRES_PRISMA_URL`.
 * Imports are all relative and never use the `@/` alias on purpose: the tsx-run seeds import
 * this module too, and tsx does not reliably honor tsconfig `paths`.
 *
 * @example
 * const [row] = await db.select().from(userTable).where(eq(userTable.id, 1))
 */
export const db = drizzle({
  client: pool,
  schema: { ...schema, ...relations },
})

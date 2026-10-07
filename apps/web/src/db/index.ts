import 'dotenv/config'

import { attachDatabasePool } from '@vercel/functions'
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
  // Keep parallel procedure reads possible without retaining ten connections per warm instance.
  max: 5,
  idleTimeoutMillis: 5_000,
  maxLifetimeSeconds: 300,
})
// Fluid Compute must finish idle cleanup before suspending the function instance.
attachDatabasePool(pool)

// An idle client can be dropped by the server or a proxy between requests. pg-pool re-emits that
// on the pool, and an 'error' event with no listener is an uncaught exception that takes the whole
// process down, so the pool needs a handler. It stays silent: the per-client listener below sees the
// same failure and logs it, so each drop is logged once. The pool discards the dead client and opens
// a fresh one on the next query.
pool.on('error', () => {
  // Logged by the per-client 'error' listener registered on connect.
})

// pg-pool removes its idle listener while a client is checked out, and a transaction ({@link runTransaction},
// drizzle's `db.transaction`) holds a raw client without adding one. A connection that drops mid-transaction would then
// emit an unhandled 'error' (an uncaught exception that ends plain Node processes and bypasses the
// logger under Next.js). This listener lives as long as the client, idle or checked out, so it is the
// one place a drop is logged. The pool still discards the non-queryable client on release.
pool.on('connect', (client) => {
  client.on('error', (error) => {
    // Serialized by {@link logSerializers}, which expands `err` into message + stack and drops SQL/params.
    log.warn({ err: error }, 'PostgreSQL client error')
  })
})

/**
 * Every table and relation definition, the schema each drizzle client in the app is built with.
 *
 * Shared by {@link db} and by {@link runTransaction}, which builds a second client over one checked-out connection and
 * needs the same schema so its transaction handle has the same type.
 */
export const databaseSchema = { ...schema, ...relations }

/**
 * Shared drizzle client over one `pg` pool — the app's one pool, which every query goes through.
 * ({@link runTransaction} checks one connection out of this pool and wraps it in a short-lived second client so it can release the connection itself.)
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
  schema: databaseSchema,
})

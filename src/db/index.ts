import 'dotenv/config'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { createModuleLogger } from '../lib/logger'

import * as relations from './relations'
import * as schema from './schema'

const log = createModuleLogger('db')

const pool = new Pool({ connectionString: process.env.POSTGRES_PRISMA_URL })

// An idle client can be dropped by the server or a proxy between requests. pg-pool
// re-emits that on the pool, and an 'error' event with no listener is an uncaught
// exception that takes the whole process down. Log it; the pool discards the dead
// client and opens a fresh one on the next query.
pool.on('error', (error) => {
  // `err` (not `error`) is the key pino's standard serializer expands into message + stack.
  log.error({ err: error }, 'Idle PostgreSQL client error')
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

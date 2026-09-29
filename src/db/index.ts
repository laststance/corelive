import 'dotenv/config'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as relations from './relations'
import * as schema from './schema'

/**
 * Shared drizzle client over one `pg` pool — the only database handle the app uses.
 *
 * Replaces the former client module and the second private client the Clerk webhook
 * used to build, so a serverless instance now holds one pool instead of two.
 * The connection string keeps its historical env name `POSTGRES_PRISMA_URL`.
 * All relative imports and no `@/` alias on purpose: the tsx-run seeds import
 * this module too, and tsx does not reliably honor tsconfig `paths`.
 *
 * @example
 * const [row] = await db.select().from(user).where(eq(user.id, 1))
 */
export const db = drizzle({
  client: new Pool({ connectionString: process.env.POSTGRES_PRISMA_URL }),
  schema: { ...schema, ...relations },
})

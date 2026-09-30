import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { db } from '@/db'

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/**
 * Creates a throwaway database on the same server as the shared test database and builds it from the committed migrations.
 *
 * Tests that change the schema or the migration bookkeeping (drop tables, drop the `drizzle` schema, run the reset script) need a database of their own: on the shared one they would race every other real-database suite, and an interrupted run would leave the developer's database broken. The name carries the process id and a random suffix, so parallel workers never collide.
 * Called by the baseline-migration, schema-parity and reset-script suites; each calls `drop` in its own teardown.
 *
 * @param options.firstMigrationOnly - Run only the first migration file (`0000_init`) instead of all of them, for a test that pins that file's schema.
 * @returns `url` (same server and credentials as the shared database), a drizzle client over the scratch database, and `drop`, which closes the pool and removes the database even when a connection lingers.
 * @throws when `POSTGRES_PRISMA_URL` is unset, or when building the schema fails (the database is dropped first).
 * @example
 * const scratch = await createScratchDatabase()
 * try {
 *   await scratch.db.execute(sql`DROP SCHEMA drizzle CASCADE`)
 * } finally {
 *   await scratch.drop()
 * }
 */
export async function createScratchDatabase(
  options: { firstMigrationOnly?: boolean } = {},
): Promise<{ url: string; db: NodePgDatabase; drop: () => Promise<void> }> {
  const sharedUrl = process.env.POSTGRES_PRISMA_URL
  if (!sharedUrl) {
    throw new Error(
      'POSTGRES_PRISMA_URL is required to create a scratch database',
    )
  }
  // Only hex digits, digits and underscores: safe to splice into an identifier.
  const name = `corelive_scratch_${process.pid}_${randomUUID().slice(0, 8)}`
  await db.execute(sql.raw(`CREATE DATABASE "${name}"`))

  const scratchUrl = new URL(sharedUrl)
  scratchUrl.pathname = `/${name}`
  const pool = new Pool({ connectionString: scratchUrl.toString() })
  // `pool.end()` resolves once every client has been told to end, not once the server has closed the connections,
  // so the forced drop below can kill a backend the client is still saying goodbye to. pg-pool re-emits that
  // idle-client error (57P01) on the POOL, and a pool without an 'error' listener turns it into an uncaught exception
  // that fails the whole run even when every test passed. A listener on the individual client does not help.
  pool.on('error', () => {})
  const scratchDb = drizzle({ client: pool })
  const drop = async () => {
    await pool.end()
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`))
  }

  try {
    if (options.firstMigrationOnly) {
      const [first] = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      })
      for (const statement of first?.sql ?? []) {
        await scratchDb.execute(sql.raw(statement))
      }
    } else {
      await migrate(scratchDb, { migrationsFolder: MIGRATIONS_FOLDER })
    }
  } catch (error) {
    await drop()
    throw error
  }
  return { url: scratchUrl.toString(), db: scratchDb, drop }
}

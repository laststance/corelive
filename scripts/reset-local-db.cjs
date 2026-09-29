/**
 * Drops every schema CoreLive owns so `pnpm db:reset` / `pnpm db:truncate` can rebuild the local database from the migrations.
 *
 * Replaces the destructive half of the former `migrate reset --force`: drop the `public` schema (all app tables) and the
 * `drizzle` schema (migration bookkeeping), then recreate an empty `public`. The caller chains `drizzle-kit migrate`
 * (and, for `db:reset`, the seed) afterwards.
 *
 * Fail-closed: requiring the gate below runs `scripts/assert-local-db.cjs`, which exits the process unless the
 * connection is provably local — so even a bare `node scripts/reset-local-db.cjs` cannot wipe a remote database.
 */

// Side-effect import: exits 1 on a non-local connection string, before any connection is opened.
require('./assert-local-db.cjs')

const { Client } = require('pg')

const { LOCAL_POSTGRES_HOST_PORT } = require('./local-db-port.cjs')

// Same resolution order (and fallback) as assert-local-db.cjs and drizzle.config.ts, so the URL judged
// by the gate is the URL this script connects to.
const connectionString =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  `postgresql://user:pass@localhost:${LOCAL_POSTGRES_HOST_PORT}/db?schema=public`

/**
 * Empties the connected database of every CoreLive-owned schema.
 * @returns Resolves once `public` has been recreated empty and `drizzle` is gone.
 * @example
 * await resetSchemas() // "User", "Todo", … and drizzle.__drizzle_migrations no longer exist
 */
async function resetSchemas() {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    // One transaction so a failure part-way never leaves the database without a `public` schema.
    await client.query('BEGIN')
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE')
    await client.query('DROP SCHEMA IF EXISTS public CASCADE')
    // A freshly created database (PostgreSQL 14+) owns `public` via `pg_database_owner`, with this comment and
    // PUBLIC usage. Recreate exactly that so a reset database is indistinguishable from a new one; otherwise
    // pg_dump reports the difference.
    await client.query('CREATE SCHEMA public AUTHORIZATION pg_database_owner')
    await client.query("COMMENT ON SCHEMA public IS 'standard public schema'")
    await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

resetSchemas()
  .then(() => {
    // eslint-disable-next-line no-console -- CLI progress line for the operator running db:reset / db:truncate
    console.log(
      '✅ [reset-local-db] Dropped schemas "drizzle" and "public"; recreated an empty "public".',
    )
  })
  .catch((error) => {
    console.error(
      '❌ [reset-local-db] Failed to reset the local database:',
      error,
    )
    process.exit(1)
  })

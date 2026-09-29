// @vitest-environment node
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, expect, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'

import { isPgError } from './isPgError'
import { userTable } from './schema'

import { db } from './index'

/**
 * Real-database guard for the production rollout. Production's application tables
 * were built by the previous ORM's migrations, so `drizzle-kit migrate` must be told
 * `drizzle/0000_init.sql` is already applied by inserting ONE bookkeeping row (the
 * migrator only compares the newest `created_at` with each file's `when`). These
 * tests recreate that "tables exist, no bookkeeping" state on the local test
 * database and prove (1) why the row is required and (2) that with it the migrator
 * changes nothing. The suite restores the normal migrated state when it finishes.
 */
vi.setConfig({ testTimeout: 30_000 })

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** SQLSTATE `duplicate_table`: what CREATE TABLE raises when the relation already exists. */
const PG_DUPLICATE_TABLE = '42P07'

/**
 * Removes the migrator's bookkeeping schema, leaving the application tables in place —
 * the exact shape of a database built by the previous ORM.
 * @returns Resolves once `drizzle` is gone.
 * @example
 * await dropBookkeeping() // public."User" still exists, drizzle.__drizzle_migrations does not
 */
async function dropBookkeeping(): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
}

/**
 * Records `0000_init` as applied, exactly as the one-off production baseline does.
 * Idempotent: does nothing when a bookkeeping row already exists.
 * @returns Resolves once the row is present.
 * @example
 * await recordBaseline() // drizzle.__drizzle_migrations now has one row
 */
async function recordBaseline(): Promise<void> {
  const [migration] = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  })
  if (!migration) throw new Error('No migration files found in drizzle/')
  const { hash, folderMillis } = migration
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
  await db.execute(sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    SELECT ${hash}, ${folderMillis}
    WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations)
  `)
}

/**
 * Serializes the `public` schema's columns, indexes and constraints so two states can be compared.
 * @returns One line per column/index/constraint, sorted.
 * @example
 * const before = await fingerprintPublicSchema()
 */
async function fingerprintPublicSchema(): Promise<string> {
  const { rows } = await db.execute<{ item: string }>(sql`
    SELECT 'column ' || table_name || '.' || column_name || ' ' || data_type
           || ' default=' || coalesce(column_default, '') || ' nullable=' || is_nullable AS item
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL
    SELECT 'index ' || indexdef FROM pg_indexes WHERE schemaname = 'public'
    UNION ALL
    SELECT 'constraint ' || conrelid::regclass::text || ' ' || pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    ORDER BY 1
  `)
  return rows.map((row) => row.item).join('\n')
}

/**
 * Counts the migrator's bookkeeping rows.
 * @returns The number of rows in `drizzle.__drizzle_migrations`.
 * @example
 * await countBookkeepingRows() // => 1
 */
async function countBookkeepingRows(): Promise<number> {
  const { rows } = await db.execute<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations`,
  )
  return rows[0]?.total ?? 0
}

afterAll(async () => {
  // Leave the database the way `pnpm db:migrate` would: one bookkeeping row for 0000_init.
  await recordBaseline()
})

describeIfDb(
  'migrating a database built by the previous ORM (real PostgreSQL)',
  () => {
    test('refuses to recreate existing tables when no baseline row was recorded, which is why production needs one', async () => {
      // Arrange
      await dropBookkeeping()

      // Act
      const migration = migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

      // Assert — CREATE TABLE "Category" collides; the migrator's single transaction rolls back.
      const failure = await migration.then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(isPgError(failure, PG_DUPLICATE_TABLE)).toBe(true)
    })

    test('applies nothing and keeps existing data when the baseline row is recorded', async () => {
      // Arrange
      await dropBookkeeping()
      await recordBaseline()
      const clerkId = `test_baseline_${randomUUID()}`
      await db.insert(userTable).values({ clerkId })
      const schemaBefore = await fingerprintPublicSchema()

      try {
        // Act
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

        // Assert — no DDL ran, no second bookkeeping row, and the existing row survived.
        expect(await fingerprintPublicSchema()).toBe(schemaBefore)
        expect(await countBookkeepingRows()).toBe(1)
        const survivors = await db
          .select()
          .from(userTable)
          .where(eq(userTable.clerkId, clerkId))
        expect(survivors).toHaveLength(1)
      } finally {
        await db.delete(userTable).where(eq(userTable.clerkId, clerkId))
      }
    })
  },
)

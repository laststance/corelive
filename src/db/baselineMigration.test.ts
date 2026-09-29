// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { fingerprintPublicSchema } from '@/test/schemaFingerprint'

import { isPgError } from './isPgError'
import { userTable } from './schema'

import { db } from './index'

/**
 * Real-database guard for the production rollout. Production's application tables
 * were built by the previous ORM's migrations, so `drizzle-kit migrate` must be told
 * `drizzle/0000_init.sql` is already applied by inserting ONE bookkeeping row (the
 * migrator only compares the newest `created_at` with each file's `when`). The
 * committed `scripts/baseline-drizzle-migrations.mjs` writes that row and
 * `.github/workflows/db-migrate.yml` runs its read-only checks around the migrator.
 * These tests recreate the "tables exist, no bookkeeping" state on the local test
 * database and prove (1) why the row is required, (2) that with it the migrator
 * changes nothing, and (3) what the script does and refuses to do. The suite puts
 * the bookkeeping rows back exactly as it found them when it finishes.
 */
vi.setConfig({ testTimeout: 30_000 })

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** SQLSTATE `duplicate_table`: what CREATE TABLE raises when the relation already exists. */
const PG_DUPLICATE_TABLE = '42P07'

/** Journal `when` of `0000_init`, as the migrator compares it with `created_at`. */
const BASELINE_MILLIS = '1790679206746'

/** Newest migration the previous ORM applied to production; the script insists on it. */
const PREVIOUS_ORM_LAST_MIGRATION =
  '20260924120000_default_category_named_general'

/** How many migrations the previous ORM had applied to production. */
const PREVIOUS_ORM_MIGRATION_COUNT = 16

/** One row of the migrator's bookkeeping table, as read back through SQL. */
type BookkeepingRow = { hash: string; created_at: string }

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
 * Reads every bookkeeping row, or nothing when the bookkeeping table does not exist.
 * @returns The rows in application order.
 * @example
 * await readBookkeeping() // => [{ hash: '…', created_at: '1790679206746' }]
 */
async function readBookkeeping(): Promise<BookkeepingRow[]> {
  const { rows: presence } = await db.execute<{ present: boolean }>(
    sql`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`,
  )
  if (!presence[0]?.present) return []
  const { rows } = await db.execute<BookkeepingRow>(sql`
    SELECT hash, created_at::text AS created_at
      FROM drizzle.__drizzle_migrations ORDER BY id
  `)
  return rows
}

/**
 * Puts the bookkeeping table back to a recorded state; an empty record means the migrator's normal single baseline row.
 * @param rows - Rows captured by {@link readBookkeeping} before the suite touched anything.
 * @returns Resolves once the table holds exactly those rows.
 * @example
 * await restoreBookkeeping(originalRows)
 */
async function restoreBookkeeping(rows: BookkeepingRow[]): Promise<void> {
  await dropBookkeeping()
  if (rows.length === 0) {
    await recordBaseline()
    return
  }
  await db.execute(sql`CREATE SCHEMA drizzle`)
  await db.execute(sql`
    CREATE TABLE drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
  for (const row of rows) {
    await db.execute(sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${row.hash}, ${row.created_at})
    `)
  }
}

/**
 * Creates the previous ORM's history table with a given number of finished migrations, the newest being the real last one.
 * @param migrationCount - How many rows to insert.
 * @returns Resolves once `public."_prisma_migrations"` exists.
 * @example
 * await createPreviousOrmHistory(16) // what production carries
 */
async function createPreviousOrmHistory(migrationCount: number): Promise<void> {
  await db.execute(sql`
    CREATE TABLE public."_prisma_migrations" (
      id varchar(36) PRIMARY KEY,
      checksum varchar(64) NOT NULL,
      finished_at timestamptz,
      migration_name varchar(255) NOT NULL,
      logs text,
      rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0
    )
  `)
  for (let position = 1; position <= migrationCount; position++) {
    const migrationName =
      position === migrationCount
        ? PREVIOUS_ORM_LAST_MIGRATION
        : `20260101${String(position).padStart(6, '0')}_step`
    await db.execute(sql`
      INSERT INTO public."_prisma_migrations" (id, checksum, finished_at, migration_name)
      VALUES (${randomUUID()}, 'checksum', now(), ${migrationName})
    `)
  }
}

/**
 * Removes the previous ORM's history table, if a test created it.
 * @returns Resolves once it is gone.
 * @example
 * await dropPreviousOrmHistory()
 */
async function dropPreviousOrmHistory(): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS public."_prisma_migrations"`)
}

/**
 * Runs the committed baseline script against the test database, the way the deploy workflow and the operator do.
 * @param flags - Command-line flags, e.g. `['--apply']`.
 * @returns The exit code and everything the script printed.
 * @example
 * runBaselineScript(['--expect-current']) // => { status: 0, output: 'target: host=localhost …' }
 */
function runBaselineScript(flags: string[]): {
  status: number | null
  output: string
} {
  const result = spawnSync(
    process.execPath,
    ['scripts/baseline-drizzle-migrations.mjs', ...flags],
    { env: { ...process.env }, encoding: 'utf8' },
  )
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

let originalBookkeeping: BookkeepingRow[] = []

describeIfDb(
  'migrating a database built by the previous ORM (real PostgreSQL)',
  () => {
    beforeAll(async () => {
      originalBookkeeping = await readBookkeeping()
    })

    afterAll(async () => {
      // Leave the database the way it was found: every bookkeeping row `pnpm db:migrate` had written.
      await dropPreviousOrmHistory()
      await restoreBookkeeping(originalBookkeeping)
    })

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
      const schemaBefore = await fingerprintPublicSchema(db)

      try {
        // Act
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

        // Assert — no DDL ran, no second bookkeeping row, and the existing row survived.
        expect(await fingerprintPublicSchema(db)).toBe(schemaBefore)
        expect(await readBookkeeping()).toHaveLength(1)
        const survivors = await db
          .select()
          .from(userTable)
          .where(eq(userTable.clerkId, clerkId))
        expect(survivors).toHaveLength(1)
      } finally {
        await db.delete(userTable).where(eq(userTable.clerkId, clerkId))
      }
    })

    test('the deploy check fails on a database with tables but no baseline row, so a forgotten baseline stops the job before the migrator runs', async () => {
      // Arrange
      await dropBookkeeping()

      // Act
      const verdict = runBaselineScript([])

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain(
        'application tables exist but drizzle.__drizzle_migrations has no row',
      )
    })

    test('the deploy checks pass once the baseline row is recorded, before and after the migrator', async () => {
      // Arrange
      await dropBookkeeping()
      await recordBaseline()

      // Act
      const beforeMigrating = runBaselineScript([])
      const afterMigrating = runBaselineScript(['--expect-current'])

      // Assert
      expect(beforeMigrating.status).toBe(0)
      expect(afterMigrating.status).toBe(0)
      expect(afterMigrating.output).toContain('baseline recorded')
    })

    test('never prints the connection password or user, only the host and database name', async () => {
      // Arrange
      await dropBookkeeping()

      // Act
      const verdict = runBaselineScript([])

      // Assert
      expect(verdict.output).toContain('target: host=')
      expect(verdict.output).not.toContain('password')
      expect(verdict.output).not.toContain('postgres:')
    })

    test('refuses to record a baseline on a database the previous ORM never built, writing nothing', async () => {
      // Arrange
      await dropBookkeeping()
      await dropPreviousOrmHistory()

      // Act
      const verdict = runBaselineScript(['--apply'])

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain('_prisma_migrations" not found')
      expect(await readBookkeeping()).toEqual([])
    })

    test('refuses to record a baseline when the previous ORM history is incomplete', async () => {
      // Arrange
      await dropBookkeeping()
      await createPreviousOrmHistory(PREVIOUS_ORM_MIGRATION_COUNT - 1)

      try {
        // Act
        const verdict = runBaselineScript(['--apply'])

        // Assert
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain('previous ORM history mismatch')
        expect(await readBookkeeping()).toEqual([])
      } finally {
        await dropPreviousOrmHistory()
      }
    })

    test('records exactly one baseline row at the journal timestamp for the previous ORM history, then refuses a second run', async () => {
      // Arrange
      await dropBookkeeping()
      await createPreviousOrmHistory(PREVIOUS_ORM_MIGRATION_COUNT)
      const [migration] = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      })

      try {
        // Act
        const firstRun = runBaselineScript(['--apply'])
        const secondRun = runBaselineScript(['--apply'])

        // Assert
        expect(firstRun.status).toBe(0)
        expect(await readBookkeeping()).toEqual([
          { hash: migration?.hash, created_at: BASELINE_MILLIS },
        ])
        expect(secondRun.status).toBe(1)
        expect(secondRun.output).toContain(
          'bookkeeping table already has 1 row(s); refusing',
        )
      } finally {
        await dropPreviousOrmHistory()
      }
    })
  },
)

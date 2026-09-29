// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
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
 * the bookkeeping table back exactly as it found it (rows, or absent) when it finishes,
 * and refuses to start at all when the previous ORM's history table is already there,
 * because the tests create and drop that table themselves.
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

/** Anything that can run SQL: the shared client, or one wired to a scratch database. */
type SqlExecutor = Pick<typeof db, 'execute'>

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
 * Tells whether a table exists, so a test can tell "no bookkeeping table" from "an empty one".
 * @param executor - Client for the database to inspect.
 * @param relation - Schema-qualified, quoted relation name, e.g. `drizzle.__drizzle_migrations`.
 * @returns `true` when the relation exists.
 * @example
 * await relationExists(db, 'public."_prisma_migrations"') // => false on a database drizzle built
 */
async function relationExists(
  executor: SqlExecutor,
  relation: string,
): Promise<boolean> {
  const { rows } = await executor.execute<{ present: boolean }>(
    sql`SELECT to_regclass(${relation}) IS NOT NULL AS present`,
  )
  return rows[0]?.present === true
}

/**
 * Reads every bookkeeping row, or nothing when the bookkeeping table does not exist.
 * @returns The rows in application order.
 * @example
 * await readBookkeeping() // => [{ hash: '…', created_at: '1790679206746' }]
 */
async function readBookkeeping(): Promise<BookkeepingRow[]> {
  if (!(await relationExists(db, 'drizzle.__drizzle_migrations'))) return []
  const { rows } = await db.execute<BookkeepingRow>(sql`
    SELECT hash, created_at::text AS created_at
      FROM drizzle.__drizzle_migrations ORDER BY id
  `)
  return rows
}

/**
 * Puts the bookkeeping table back to a recorded state, faithfully: the rows it held, or no table at all when it had none.
 * @param rows - Rows captured before the suite touched anything, or `null` when the bookkeeping table did not exist.
 * @returns Resolves once the table holds exactly those rows (or is absent).
 * @example
 * await restoreBookkeeping(originalRows)
 */
async function restoreBookkeeping(
  rows: BookkeepingRow[] | null,
): Promise<void> {
  await dropBookkeeping()
  if (rows === null) return
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
 * @param executor - Database to create it in; the shared test database by default.
 * @returns Resolves once `public."_prisma_migrations"` exists.
 * @example
 * await createPreviousOrmHistory(16) // what production carries
 */
async function createPreviousOrmHistory(
  migrationCount: number,
  executor: SqlExecutor = db,
): Promise<void> {
  await executor.execute(sql`
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
    await executor.execute(sql`
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
 * @param connectionUrl - Database to target; the shared test database by default.
 * @returns The exit code and everything the script printed.
 * @example
 * runBaselineScript(['--expect-current']) // => { status: 0, output: 'target: host=localhost …' }
 */
function runBaselineScript(
  flags: string[],
  connectionUrl: string | undefined = process.env.POSTGRES_PRISMA_URL,
): {
  status: number | null
  output: string
} {
  const result = spawnSync(
    process.execPath,
    ['scripts/baseline-drizzle-migrations.mjs', ...flags],
    {
      env: { ...process.env, POSTGRES_PRISMA_URL: connectionUrl },
      encoding: 'utf8',
    },
  )
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** Bookkeeping rows found at start, or `null` when the table did not exist. */
let originalBookkeeping: BookkeepingRow[] | null = null
/** Whether `public."_prisma_migrations"` was there before the suite: then it is not ours to drop. */
let previousOrmHistoryPreexisted = false

describeIfDb(
  'migrating a database built by the previous ORM (real PostgreSQL)',
  () => {
    beforeAll(async () => {
      previousOrmHistoryPreexisted = await relationExists(
        db,
        'public."_prisma_migrations"',
      )
      if (previousOrmHistoryPreexisted) {
        // These tests create and drop that table; running here would destroy a real history.
        throw new Error(
          'public."_prisma_migrations" already exists: refusing to run tests that drop it. Point POSTGRES_PRISMA_URL at a database drizzle built.',
        )
      }
      originalBookkeeping = (await relationExists(
        db,
        'drizzle.__drizzle_migrations',
      ))
        ? await readBookkeeping()
        : null
    })

    afterAll(async () => {
      // Leave the database the way it was found: the bookkeeping rows `pnpm db:migrate` wrote, or none.
      if (previousOrmHistoryPreexisted) return
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

    test('the post-migrate check fails when the newest applied migration is older than the journal, so a migrator that silently skipped a file fails the deploy job', async () => {
      // Arrange — a baseline row one millisecond older than 0000_init's journal timestamp.
      await dropBookkeeping()
      await recordBaseline()
      await db.execute(
        sql`UPDATE drizzle.__drizzle_migrations SET created_at = 1790679206745`,
      )

      // Act
      const verdict = runBaselineScript(['--expect-current'])

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain(
        'newest applied migration is 1790679206745, journal expects 1790679206746',
      )
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
        expect(firstRun.output).toContain('schema verified')
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

    test('refuses to record a baseline when the live schema differs from the one drizzle describes, even by a single column type modifier, writing nothing', async () => {
      // Arrange — a scratch database (a drift on the shared one would race the other suites) built by
      // 0000_init, carrying the previous ORM history, with Category.name narrowed from text to varchar(50).
      const scratchName = `corelive_baseline_drift_${process.pid}`
      await db.execute(sql.raw(`CREATE DATABASE "${scratchName}"`))
      const scratchUrl = new URL(process.env.POSTGRES_PRISMA_URL ?? '')
      scratchUrl.pathname = `/${scratchName}`
      const scratchPool = new Pool({ connectionString: scratchUrl.toString() })
      const scratchDb = drizzle({ client: scratchPool })

      try {
        await migrate(scratchDb, { migrationsFolder: MIGRATIONS_FOLDER })
        await scratchDb.execute(sql`DROP SCHEMA drizzle CASCADE`)
        await createPreviousOrmHistory(PREVIOUS_ORM_MIGRATION_COUNT, scratchDb)
        await scratchDb.execute(
          sql`ALTER TABLE "Category" ALTER COLUMN "name" TYPE varchar(50)`,
        )

        // Act
        const verdict = runBaselineScript(['--apply'], scratchUrl.toString())

        // Assert
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain(
          'the live schema differs from the schema `drizzle/0000_init.sql` builds',
        )
        expect(verdict.output).toContain(
          'column Category.name pos=2 character varying udt=varchar len=50',
        )
        expect(
          await relationExists(scratchDb, 'drizzle.__drizzle_migrations'),
        ).toBe(false)
      } finally {
        await scratchPool.end()
        await db.execute(
          sql.raw(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`),
        )
      }
    })
  },
)

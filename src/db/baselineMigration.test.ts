// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { fingerprintPublicSchema } from '@/test/schemaFingerprint'
import { createScratchDatabase as createBaseScratchDatabase } from '@/test/scratchDatabase'

import { isPgError } from './isPgError'
import { userTable } from './schema'

import type { db } from './index'

/**
 * Real-database guard for the production rollout. Production's application tables
 * were built by the previous ORM's migrations, so `drizzle-kit migrate` must be told
 * `drizzle/0000_init.sql` is already applied by inserting ONE bookkeeping row (the
 * migrator only compares the newest `created_at` with each file's `when`). The
 * committed `scripts/baseline-drizzle-migrations.mjs` writes that row and
 * `.github/workflows/db-migrate.yml` runs its read-only checks around the migrator.
 * These tests recreate the "tables exist, no bookkeeping" state and prove (1) why the
 * row is required, (2) that with it the migrator changes nothing, and (3) what the
 * script does and refuses to do.
 *
 * Every test runs on a scratch database (see {@link createScratchDatabase}), never on the
 * shared test database: the tests drop the bookkeeping schema and the schema itself, which
 * would race the other suites and, if a run were interrupted, leave a developer's database
 * without its bookkeeping row.
 *
 * Lifecycle: the `--apply` tests (`refuses to record a baseline …`, `records exactly one baseline
 * row …`) belong to the one-time cutover and are deleted together with `--apply` once production
 * carries the baseline row; see the header of `scripts/baseline-drizzle-migrations.mjs`. The rest
 * cover the read-only checks the deploy workflow runs every time and stay, BUT the tests that call
 * {@link recordBaseline} or hard-code `0000_init`'s timestamp only hold while the journal lists exactly
 * ONE migration (the baseline is `readMigrationFiles()[0]`, and `pending migrations: none` assumes nothing
 * newer exists). Adding the next migration makes them fail: update them in that same change.
 */
vi.setConfig({ testTimeout: 30_000 })

let historicalRoot: string
let MIGRATIONS_FOLDER: string

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

/** Anything that can run SQL: a client wired to a scratch database. */
type SqlExecutor = Pick<typeof db, 'execute'>

type ScratchDatabase = Awaited<ReturnType<typeof createScratchDatabase>>

/** Builds the frozen first-migration database for cutover regressions even after newer feature migrations exist.
 * @returns A scratch database whose only recorded migration is the historical baseline.
 * @example const scratch = await createScratchDatabase()
 */
async function createScratchDatabase() {
  const scratch = await createBaseScratchDatabase({ firstMigrationOnly: true })
  await recordBaseline(scratch.db)
  return scratch
}

/** Copies the current guard into a first-migration-only fixture so historical --apply evidence remains meaningful.
 * @example prepareHistoricalMigrationFixture()
 */
function prepareHistoricalMigrationFixture() {
  historicalRoot = mkdtempSync(path.join(tmpdir(), 'corelive-baseline-'))
  MIGRATIONS_FOLDER = path.join(historicalRoot, 'drizzle')
  for (const directory of ['scripts', 'drizzle/meta', 'src/db/__fixtures__'])
    mkdirSync(path.join(historicalRoot, directory), { recursive: true })
  symlinkSync(
    path.join(process.cwd(), 'node_modules'),
    path.join(historicalRoot, 'node_modules'),
    'dir',
  )
  for (const file of [
    'scripts/baseline-drizzle-migrations.mjs',
    'scripts/schema-fingerprint.sql',
    'src/db/__fixtures__/previousOrmSchemaFingerprint.txt',
    'drizzle/0000_init.sql',
    'drizzle/meta/0000_snapshot.json',
  ])
    copyFileSync(
      path.join(process.cwd(), file),
      path.join(historicalRoot, file),
    )
  const journal = JSON.parse(
    readFileSync('drizzle/meta/_journal.json', 'utf8'),
  ) as { entries: unknown[] }
  journal.entries = journal.entries.slice(0, 1)
  writeFileSync(
    path.join(historicalRoot, 'drizzle/meta/_journal.json'),
    JSON.stringify(journal),
  )
}

/**
 * Removes the migrator's bookkeeping schema, leaving the application tables in place —
 * the exact shape of a database built by the previous ORM.
 * @param executor - Client for the scratch database.
 * @returns Resolves once `drizzle` is gone.
 * @example
 * await dropBookkeeping(scratch.db) // public."User" still exists, drizzle.__drizzle_migrations does not
 */
async function dropBookkeeping(executor: SqlExecutor): Promise<void> {
  await executor.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
}

/**
 * Records `0000_init` as applied, exactly as the one-off production baseline does.
 * Idempotent: does nothing when a bookkeeping row already exists.
 * @param executor - Client for the scratch database.
 * @returns Resolves once the row is present.
 * @example
 * await recordBaseline(scratch.db) // drizzle.__drizzle_migrations now has one row
 */
async function recordBaseline(executor: SqlExecutor): Promise<void> {
  const [migration] = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  })
  if (!migration) throw new Error('No migration files found in drizzle/')
  const { hash, folderMillis } = migration
  await executor.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`)
  await executor.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
  await executor.execute(sql`
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
 * await relationExists(scratch.db, 'public."_prisma_migrations"') // => false on a database drizzle built
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
 * @param executor - Client for the scratch database.
 * @returns The rows in application order.
 * @example
 * await readBookkeeping(scratch.db) // => [{ hash: '…', created_at: '1790679206746' }]
 */
async function readBookkeeping(
  executor: SqlExecutor,
): Promise<BookkeepingRow[]> {
  if (!(await relationExists(executor, 'drizzle.__drizzle_migrations'))) {
    return []
  }
  const { rows } = await executor.execute<BookkeepingRow>(sql`
    SELECT hash, created_at::text AS created_at
      FROM drizzle.__drizzle_migrations ORDER BY id
  `)
  return rows
}

/**
 * Creates the previous ORM's history table with a given number of finished migrations, the newest being the real last one.
 * @param migrationCount - How many rows to insert.
 * @param executor - Client for the scratch database.
 * @returns Resolves once `public."_prisma_migrations"` exists.
 * @example
 * await createPreviousOrmHistory(16, scratch.db) // what production carries
 */
async function createPreviousOrmHistory(
  migrationCount: number,
  executor: SqlExecutor,
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
 * @param executor - Client for the scratch database.
 * @returns Resolves once it is gone.
 * @example
 * await dropPreviousOrmHistory(scratch.db)
 */
async function dropPreviousOrmHistory(executor: SqlExecutor): Promise<void> {
  await executor.execute(sql`DROP TABLE IF EXISTS public."_prisma_migrations"`)
}

/** Longest any single script run may take; above the script's own 45 s query backstop, so only a real hang reaches it. */
const SCRIPT_RUN_LIMIT_MS = 60_000

/**
 * Runs the committed baseline script against a database, the way the deploy workflow and the operator do.
 * @param flags - Command-line flags, e.g. `['--apply']`.
 * @param connectionUrl - Database to target; always a scratch database in this suite.
 * @param extraEnv - Environment variables added for this run, e.g. `GITHUB_ACTIONS`.
 * @returns The exit code and everything the script printed.
 * @example
 * runBaselineScript(['--expect-current'], scratch.url) // => { status: 0, output: 'target: host=localhost …' }
 */
function runBaselineScript(
  flags: string[],
  connectionUrl: string,
  extraEnv: Record<string, string> = {},
): {
  status: number | null
  output: string
} {
  const result = spawnSync(
    process.execPath,
    [
      path.join(historicalRoot, 'scripts/baseline-drizzle-migrations.mjs'),
      ...flags,
    ],
    {
      env: {
        ...process.env,
        POSTGRES_PRISMA_URL: connectionUrl,
        ...extraEnv,
      },
      encoding: 'utf8',
      // spawnSync blocks this worker's event loop, so vitest's own timeout could never fire on a script that hangs.
      timeout: SCRIPT_RUN_LIMIT_MS,
      killSignal: 'SIGKILL',
    },
  )
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

describeIfDb(
  'migrating a database built by the previous ORM (real PostgreSQL)',
  () => {
    let scratch: ScratchDatabase

    beforeAll(async () => {
      prepareHistoricalMigrationFixture()
      scratch = await createScratchDatabase()
    })

    afterAll(async () => {
      await scratch?.drop()
      rmSync(historicalRoot, { recursive: true, force: true })
    })

    // Every test starts from the shape the previous ORM left in production: application tables,
    // no bookkeeping schema, no history table (the `--apply` tests add what they need).
    beforeEach(async () => {
      await dropBookkeeping(scratch.db)
      await dropPreviousOrmHistory(scratch.db)
    })

    test('refuses to recreate existing tables when no baseline row was recorded, which is why production needs one', async () => {
      // Arrange — tables exist, `drizzle.__drizzle_migrations` does not (see beforeEach).

      // Act
      const migration = migrate(scratch.db, {
        migrationsFolder: MIGRATIONS_FOLDER,
      })

      // Assert — CREATE TABLE "Category" collides; the migrator's single transaction rolls back.
      const failure = await migration.then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(isPgError(failure, PG_DUPLICATE_TABLE)).toBe(true)
    })

    test('applies nothing and keeps existing data when the baseline row is recorded', async () => {
      // Arrange
      await recordBaseline(scratch.db)
      const clerkId = `test_baseline_${randomUUID()}`
      await scratch.db.insert(userTable).values({ clerkId })
      const schemaBefore = await fingerprintPublicSchema(scratch.db)

      // Act
      await migrate(scratch.db, { migrationsFolder: MIGRATIONS_FOLDER })

      // Assert — no DDL ran, no second bookkeeping row, and the existing row survived.
      expect(await fingerprintPublicSchema(scratch.db)).toBe(schemaBefore)
      expect(await readBookkeeping(scratch.db)).toHaveLength(1)
      const survivors = await scratch.db
        .select()
        .from(userTable)
        .where(eq(userTable.clerkId, clerkId))
      expect(survivors).toHaveLength(1)
    })

    test('the deploy check fails on a database with tables but no baseline row, so a forgotten baseline stops the job before the migrator runs', () => {
      // Arrange — tables exist, no bookkeeping row (see beforeEach).

      // Act
      const verdict = runBaselineScript([], scratch.url)

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain(
        'application tables exist but drizzle.__drizzle_migrations has no row',
      )
    })

    test('the deploy checks pass once the baseline row is recorded, before and after the migrator runs', async () => {
      // Arrange
      await recordBaseline(scratch.db)

      // Act
      const beforeMigrating = runBaselineScript([], scratch.url)
      await migrate(scratch.db, { migrationsFolder: MIGRATIONS_FOLDER })
      const afterMigrating = runBaselineScript(
        ['--expect-current'],
        scratch.url,
      )

      // Assert
      expect(beforeMigrating.status).toBe(0)
      expect(beforeMigrating.output).toContain('pending migrations: none')
      expect(afterMigrating.status).toBe(0)
      expect(afterMigrating.output).toContain('baseline recorded')
    })

    test('the read-only run lists the migration the migrator would still apply, so a dry run shows what a deploy would do', async () => {
      // Arrange — a baseline row one millisecond older than 0000_init's journal timestamp.
      await recordBaseline(scratch.db)
      await scratch.db.execute(
        sql`UPDATE drizzle.__drizzle_migrations SET created_at = 1790679206745`,
      )

      // Act
      const verdict = runBaselineScript([], scratch.url)

      // Assert — pending migrations are normal before a deploy, so the run still succeeds.
      expect(verdict.status).toBe(0)
      expect(verdict.output).toContain('pending migrations: 0000_init')
    })

    test('the post-migrate check fails when the newest applied migration is older than the journal, so a migrator that silently skipped a file fails the deploy job', async () => {
      // Arrange — a baseline row one millisecond older than 0000_init's journal timestamp.
      await recordBaseline(scratch.db)
      await scratch.db.execute(
        sql`UPDATE drizzle.__drizzle_migrations SET created_at = 1790679206745`,
      )

      // Act
      const verdict = runBaselineScript(['--expect-current'], scratch.url)

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain(
        'newest applied migration is 1790679206745, journal expects 1790679206746',
      )
    })

    test('the post-migrate check fails when the newest row carries the journal timestamp but not the file hash, and says the file was edited after it was applied', async () => {
      // Arrange — the newest row carries the journal timestamp but not the hash of any journal file.
      await recordBaseline(scratch.db)
      await scratch.db.execute(
        sql`UPDATE drizzle.__drizzle_migrations SET hash = 'not-the-hash-of-any-migration-file'`,
      )

      // Act
      const verdict = runBaselineScript(['--expect-current'], scratch.url)

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain(
        '1 journal migration(s) not recorded correctly in drizzle.__drizzle_migrations',
      )
      expect(verdict.output).toContain(
        '0000_init (journal "when" 1790679206746) is recorded with a different hash: the file was edited after it was applied',
      )
    })

    test('the pre-migrate check fails when a migration older than the newest recorded row was never recorded, because the migrator would skip it without an error', async () => {
      // Arrange — a newer row exists (as after a deploy of a later migration) and it is not 0000_init's hash.
      await recordBaseline(scratch.db)
      await scratch.db.execute(
        sql`UPDATE drizzle.__drizzle_migrations SET hash = 'hash-of-a-newer-migration', created_at = 1790679206747`,
      )

      // Act
      const verdict = runBaselineScript([], scratch.url)

      // Assert — named by its journal tag, with the fix that applies to a skipped file.
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain(
        '0000_init (journal "when" 1790679206746) was never recorded: the migrator skips a file whose "when" is not newer than the newest recorded row',
      )
    })

    test('the deploy checks fail when a bookkeeping row has no created_at, because the migrator reads it as the newest row and applies every migration again', async () => {
      // Arrange — the baseline row plus a row whose created_at is NULL (ORDER BY … DESC puts NULL first).
      await recordBaseline(scratch.db)
      await scratch.db.execute(
        sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('row-without-timestamp', NULL)`,
      )

      // Act
      const migration = migrate(scratch.db, {
        migrationsFolder: MIGRATIONS_FOLDER,
      })
      const readOnly = runBaselineScript([], scratch.url)
      const postMigrate = runBaselineScript(['--expect-current'], scratch.url)

      // Assert — the premise (the migrator does try to create the tables again) and the guard on it.
      const failure = await migration.then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(isPgError(failure, PG_DUPLICATE_TABLE)).toBe(true)
      for (const verdict of [readOnly, postMigrate]) {
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain(
          'drizzle.__drizzle_migrations has 1 row(s) without created_at',
        )
      }
    })

    test('the deploy checks fail when one table of the recorded schema is missing but the bookkeeping row and the other tables survive, because the migrator skips 0000_init and the app could not query that table', async () => {
      // Arrange — a database of its own: a partial restore or an accidental drop left everything but "Completed".
      const partial = await createScratchDatabase()

      try {
        await partial.db.execute(sql`DROP TABLE "Completed" CASCADE`)

        // Act
        const readOnly = runBaselineScript([], partial.url)
        const postMigrate = runBaselineScript(['--expect-current'], partial.url)

        // Assert
        for (const verdict of [readOnly, postMigrate]) {
          expect(verdict.status).toBe(1)
          expect(verdict.output).toContain(
            '0000_init is recorded as applied, but the database lacks 1 of its objects: table "Completed"',
          )
        }
      } finally {
        await partial.drop()
      }
    })

    test('the deploy checks fail when a column of the recorded schema is missing, naming the table and the column', async () => {
      // Arrange
      const partial = await createScratchDatabase()

      try {
        await partial.db.execute(
          sql`ALTER TABLE "Category" DROP COLUMN "color"`,
        )

        // Act
        const verdict = runBaselineScript(['--expect-current'], partial.url)

        // Assert
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain('column "Category"."color"')
      } finally {
        await partial.drop()
      }
    })

    test('the deploy checks report that every recorded table and column is present on an intact database', async () => {
      // Arrange
      await recordBaseline(scratch.db)

      // Act
      const verdict = runBaselineScript(['--expect-current'], scratch.url)

      // Assert
      expect(verdict.status).toBe(0)
      expect(verdict.output).toContain(
        'schema present: every table and column of 0000_init',
      )
    })

    test('never prints the connection password or user, only the host and database name', () => {
      // Arrange
      const { username, password } = new URL(scratch.url)

      // Act
      const verdict = runBaselineScript([], scratch.url)

      // Assert
      expect(verdict.output).toContain('target: host=')
      expect(verdict.output).not.toContain(password)
      expect(verdict.output).not.toMatch(new RegExp(`\\b${username}\\b`))
    })

    test('registers the database host as an Actions log mask before printing it, because the repository and its logs are public', () => {
      // Arrange
      const { hostname } = new URL(scratch.url)

      // Act
      const onRunner = runBaselineScript([], scratch.url, {
        GITHUB_ACTIONS: 'true',
      })
      const onDeveloperMachine = runBaselineScript([], scratch.url, {
        GITHUB_ACTIONS: '',
      })

      // Assert
      const lines = onRunner.output.split('\n')
      expect(lines[0]).toBe(`::add-mask::${hostname}`)
      expect(lines[1]).toContain('target: host=')
      expect(onDeveloperMachine.output).not.toContain('::add-mask::')
    })

    test('refuses to record a baseline on a database the previous ORM never built, writing nothing', async () => {
      // Arrange — no history table (see beforeEach).

      // Act
      const verdict = runBaselineScript(['--apply'], scratch.url)

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain('_prisma_migrations" not found')
      expect(await readBookkeeping(scratch.db)).toEqual([])
    })

    test('refuses to record a baseline when the previous ORM history is incomplete', async () => {
      // Arrange
      await createPreviousOrmHistory(
        PREVIOUS_ORM_MIGRATION_COUNT - 1,
        scratch.db,
      )

      // Act
      const verdict = runBaselineScript(['--apply'], scratch.url)

      // Assert
      expect(verdict.status).toBe(1)
      expect(verdict.output).toContain('previous ORM history mismatch')
      expect(await readBookkeeping(scratch.db)).toEqual([])
    })

    test('records exactly one baseline row at the journal timestamp for the previous ORM history, then refuses a second run', async () => {
      // Arrange
      await createPreviousOrmHistory(PREVIOUS_ORM_MIGRATION_COUNT, scratch.db)
      const [migration] = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      })

      // Act
      const firstRun = runBaselineScript(['--apply'], scratch.url)
      const secondRun = runBaselineScript(['--apply'], scratch.url)

      // Assert
      expect(firstRun.status).toBe(0)
      expect(firstRun.output).toContain('schema verified')
      expect(await readBookkeeping(scratch.db)).toEqual([
        { hash: migration?.hash, created_at: BASELINE_MILLIS },
      ])
      expect(secondRun.status).toBe(1)
      expect(secondRun.output).toContain(
        'bookkeeping table already has 1 row(s); refusing',
      )
    })

    test('refuses to record a baseline when the live schema differs from the one drizzle describes, even by a single column type modifier, writing nothing', async () => {
      // Arrange — a database of its own, because the schema is altered: built by 0000_init, carrying the
      // previous ORM history, with Category.name narrowed from text to varchar(50).
      const drifted = await createScratchDatabase()

      try {
        await dropBookkeeping(drifted.db)
        await createPreviousOrmHistory(PREVIOUS_ORM_MIGRATION_COUNT, drifted.db)
        await drifted.db.execute(
          sql`ALTER TABLE "Category" ALTER COLUMN "name" TYPE varchar(50)`,
        )

        // Act
        const verdict = runBaselineScript(['--apply'], drifted.url)

        // Assert
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain(
          'the live schema differs from the schema `drizzle/0000_init.sql` builds',
        )
        expect(verdict.output).toContain(
          'column Category.name pos=2 character varying udt=varchar len=50',
        )
        expect(
          await relationExists(drifted.db, 'drizzle.__drizzle_migrations'),
        ).toBe(false)
      } finally {
        await drifted.drop()
      }
    })

    test('the deploy checks fail when the bookkeeping row survived but the application tables are gone, because the migrator would skip 0000_init and report a green deploy on an empty database', async () => {
      // Arrange — a database of its own: a data reset dropped `public` and left the `drizzle` schema behind.
      const emptied = await createScratchDatabase()

      try {
        await emptied.db.execute(sql`DROP SCHEMA public CASCADE`)
        await emptied.db.execute(sql`CREATE SCHEMA public`)

        // Act
        const readOnly = runBaselineScript([], emptied.url)
        const postMigrate = runBaselineScript(['--expect-current'], emptied.url)

        // Assert
        for (const verdict of [readOnly, postMigrate]) {
          expect(verdict.status).toBe(1)
          expect(verdict.output).toContain(
            'drizzle.__drizzle_migrations records applied migrations but no application tables exist in public',
          )
        }
      } finally {
        await emptied.drop()
      }
    })

    test('the post-migrate check fails on a database with no tables at all, while the pre-migrate check accepts it as fresh', async () => {
      // Arrange — a database of its own with neither the tables nor any bookkeeping.
      const fresh = await createScratchDatabase()

      try {
        await fresh.db.execute(sql`DROP SCHEMA drizzle CASCADE`)
        await fresh.db.execute(sql`DROP SCHEMA public CASCADE`)
        await fresh.db.execute(sql`CREATE SCHEMA public`)

        // Act
        const beforeMigrating = runBaselineScript([], fresh.url)
        const afterMigrating = runBaselineScript(
          ['--expect-current'],
          fresh.url,
        )

        // Assert
        expect(beforeMigrating.status).toBe(0)
        expect(beforeMigrating.output).toContain('fresh database')
        expect(afterMigrating.status).toBe(1)
        expect(afterMigrating.output).toContain(
          'expected a migrated database, but no application tables exist in public',
        )
      } finally {
        await fresh.drop()
      }
    })

    test('gives up on a database that accepts the connection but never answers, instead of holding the deploy job for hours', async () => {
      // Arrange — the kernel completes the TCP handshake for a listening socket that nobody serves, which is
      // what an unresponsive database looks like to the client.
      const silentServer = net.createServer()
      await new Promise<void>((resolve) =>
        silentServer.listen(0, '127.0.0.1', resolve),
      )
      const { port } = silentServer.address() as net.AddressInfo

      try {
        // Act
        const verdict = runBaselineScript(
          [],
          `postgresql://postgres:password@127.0.0.1:${port}/never_answers`,
        )

        // Assert — a killed run would report a null status, so 1 proves the script ended itself.
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain('timeout expired')
      } finally {
        silentServer.close()
      }
    }, 90_000)

    test('gives up when another session holds the bookkeeping table locked, instead of queueing behind a migration running elsewhere', async () => {
      // Arrange — the bookkeeping table exists and a second session holds it exclusively.
      await scratch.db.execute(sql`CREATE SCHEMA drizzle`)
      await scratch.db.execute(
        sql`CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
      )
      const lockHolder = new pg.Client({ connectionString: scratch.url })
      await lockHolder.connect()

      try {
        await lockHolder.query('BEGIN')
        await lockHolder.query(
          'LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE',
        )

        // Act
        const verdict = runBaselineScript([], scratch.url)

        // Assert
        expect(verdict.status).toBe(1)
        expect(verdict.output).toContain('lock timeout')
      } finally {
        // Ending the session rolls its transaction back and releases the lock.
        await lockHolder.end()
      }
    }, 90_000)
  },
)

// Production baseline for the drizzle migrator — the ONE manual step of the ORM cutover.
//
// Production's application tables were built by the previous ORM's 16 migrations, so
// `drizzle-kit migrate` would try to `CREATE TABLE "Category"` again and fail. The
// migrator only compares the newest `created_at` in `drizzle.__drizzle_migrations` with
// each migration file's journal `when`, so recording `0000_init` as applied takes ONE row.
// The row is the only thing this script ever writes; application tables are untouched.
//
// Usage (POSTGRES_PRISMA_URL points at the database to inspect — never printed):
//   node scripts/baseline-drizzle-migrations.mjs                   read-only: report the state, exit 1 when
//                                                                  the baseline row is missing
//   node scripts/baseline-drizzle-migrations.mjs --expect-current  read-only: additionally require that the
//                                                                  newest row equals the journal (post-migrate)
//   node scripts/baseline-drizzle-migrations.mjs --apply           write the baseline row (once), after
//                                                                  verifying the previous ORM's history
//                                                                  AND that the live schema equals the
//                                                                  committed fingerprint of that ORM's schema
//
// `--apply` compares the database's columns (with type modifiers), indexes and named constraints with
// `src/db/__fixtures__/previousOrmSchemaFingerprint.txt` — the schema `drizzle/0000_init.sql` reproduces —
// and refuses on any difference: recording the baseline for a schema drizzle does not describe would
// hide the drift from every later migration.
// Reversible: `DELETE FROM drizzle.__drizzle_migrations` (then drop the `drizzle` schema).
import { readFileSync } from 'node:fs'

import { readMigrationFiles } from 'drizzle-orm/migrator'
import pg from 'pg'

/**
 * Prints one progress line to stdout (the console rule allows only warn/error, and these lines are the script's report).
 * @param message - Line to print.
 * @returns Nothing.
 * @example
 * say('baseline recorded')
 */
function say(message) {
  process.stdout.write(`${message}\n`)
}

/** Migrations the previous ORM had applied to production, each recorded as finished. */
const EXPECTED_PREVIOUS_MIGRATIONS = 16
/** The last of them — the one that renamed the default category to "General". */
const EXPECTED_LAST_PREVIOUS_MIGRATION =
  '20260924120000_default_category_named_general'
/** Journal `when` of `0000_init`; the migrator compares it with `created_at`, so it must not drift. */
const EXPECTED_BASELINE_MILLIS = 1790679206746

/** Query text shared with `src/test/schemaFingerprint.ts`, so both sides serialize the schema identically. */
const FINGERPRINT_SQL_URL = new URL('./schema-fingerprint.sql', import.meta.url)
/** Schema the previous ORM's migrations built, as serialized by that query. */
const FINGERPRINT_FIXTURE_URL = new URL(
  '../src/db/__fixtures__/previousOrmSchemaFingerprint.txt',
  import.meta.url,
)

const applyRequested = process.argv.includes('--apply')
const expectCurrent = process.argv.includes('--expect-current')

const url = process.env.POSTGRES_PRISMA_URL
if (!url) fail('POSTGRES_PRISMA_URL is required')

const target = new URL(url)
say(`target: host=${target.hostname} database=${target.pathname.slice(1)}`)

const migrations = readMigrationFiles({ migrationsFolder: './drizzle' })
const newestJournalMillis = Math.max(...migrations.map((m) => m.folderMillis))

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  const state = await readState(client)
  say(
    `state: application tables=${state.applicationTables ? 'present' : 'absent'} ` +
      `bookkeeping rows=${state.bookkeepingRows} newest created_at=${state.newestCreatedAt ?? 'none'}`,
  )

  if (applyRequested) {
    await applyBaseline(client, state)
  } else if (!state.applicationTables) {
    say('fresh database: `drizzle-kit migrate` will build it')
  } else if (state.bookkeepingRows === 0) {
    fail(
      'application tables exist but drizzle.__drizzle_migrations has no row: ' +
        '`drizzle-kit migrate` would fail on CREATE TABLE. ' +
        'Record the baseline first: node scripts/baseline-drizzle-migrations.mjs --apply',
    )
  } else if (expectCurrent && state.newestCreatedAt !== newestJournalMillis) {
    fail(
      `newest applied migration is ${state.newestCreatedAt}, journal expects ${newestJournalMillis}`,
    )
  } else {
    say('baseline recorded: `drizzle-kit migrate` applies only newer files')
  }
} finally {
  await client.end()
}

/**
 * Reads what the migrator and the guard need to know about the database, without writing.
 * @param connected - Connected pg client.
 * @returns Whether application tables exist and what the bookkeeping table holds.
 * @example
 * await readState(client) // => { applicationTables: true, bookkeepingRows: 0, newestCreatedAt: null }
 */
async function readState(connected) {
  const {
    rows: [presence],
  } = await connected.query(`
    SELECT to_regclass('public."User"') IS NOT NULL AS application_tables,
           to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS bookkeeping
  `)
  let bookkeepingRows = 0
  let newestCreatedAt = null
  if (presence.bookkeeping) {
    const {
      rows: [tally],
    } = await connected.query(
      'SELECT count(*)::int AS total, max(created_at)::text AS newest FROM drizzle.__drizzle_migrations',
    )
    bookkeepingRows = tally.total
    newestCreatedAt = tally.newest === null ? null : Number(tally.newest)
  }
  return {
    applicationTables: presence.application_tables,
    bookkeepingRows,
    newestCreatedAt,
  }
}

/**
 * Records `0000_init` as applied after proving the database carries the previous ORM's full history. One transaction; refuses when a row already exists.
 * @param connected - Connected pg client.
 * @param state - Result of {@link readState}.
 * @returns Resolves once the row is committed.
 * @example
 * await applyBaseline(client, await readState(client))
 */
async function applyBaseline(connected, state) {
  if (!state.applicationTables) {
    fail('public."User" not found: nothing to baseline')
  }
  if (state.bookkeepingRows !== 0) {
    fail(
      `bookkeeping table already has ${state.bookkeepingRows} row(s); refusing`,
    )
  }
  if (migrations.length !== 1) {
    fail(`expected exactly one migration file, found ${migrations.length}`)
  }
  const [{ hash, folderMillis }] = migrations
  if (folderMillis !== EXPECTED_BASELINE_MILLIS) {
    fail(
      `0000_init journal "when" is ${folderMillis}, expected ${EXPECTED_BASELINE_MILLIS}: ` +
        'the migration was regenerated, so the baseline must be reviewed by hand',
    )
  }

  const {
    rows: [history],
  } = await connected.query(`
    SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present
  `)
  if (!history.present) {
    fail(
      'public."_prisma_migrations" not found: this database was not built by the previous ORM',
    )
  }
  const {
    rows: [previous],
  } = await connected.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS finished,
           max(migration_name) AS last_name
      FROM public."_prisma_migrations"
  `)
  if (
    previous.total !== EXPECTED_PREVIOUS_MIGRATIONS ||
    previous.finished !== EXPECTED_PREVIOUS_MIGRATIONS ||
    previous.last_name !== EXPECTED_LAST_PREVIOUS_MIGRATION
  ) {
    fail(
      `previous ORM history mismatch: ${previous.finished}/${previous.total} finished, last=${previous.last_name}; ` +
        `expected ${EXPECTED_PREVIOUS_MIGRATIONS} finished, last=${EXPECTED_LAST_PREVIOUS_MIGRATION}`,
    )
  }

  await verifySchemaMatchesFixture(connected)

  await connected.query('BEGIN')
  try {
    await connected.query('CREATE SCHEMA IF NOT EXISTS drizzle')
    await connected.query(
      'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
    )
    // Re-check inside the transaction so two concurrent runs cannot both insert.
    await connected.query(
      'LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE',
    )
    const {
      rows: [{ total }],
    } = await connected.query(
      'SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations',
    )
    if (total !== 0)
      throw new Error(`bookkeeping table already has ${total} row(s); refusing`)
    await connected.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [hash, folderMillis],
    )
    await connected.query('COMMIT')
  } catch (error) {
    await connected.query('ROLLBACK')
    throw error
  }
  say(
    `baseline recorded: hash=${hash.slice(0, 12)}… created_at=${folderMillis}`,
  )
}

/**
 * Fails unless the database's `public` schema equals the committed fingerprint of the schema the previous ORM built.
 *
 * Lines are compared as sorted sets, so a server whose collation orders rows differently does not raise a false alarm. The message lists at most 10 differing lines per side; they describe schema only (names, types, defaults), never row data.
 * @param connected - Connected pg client.
 * @returns Resolves when the schema matches; otherwise the process ends via {@link fail}.
 * @example
 * await verifySchemaMatchesFixture(client)
 */
async function verifySchemaMatchesFixture(connected) {
  const { rows } = await connected.query(
    readFileSync(FINGERPRINT_SQL_URL, 'utf8'),
  )
  const actual = rows.map((row) => row.item).sort()
  const expected = readFileSync(FINGERPRINT_FIXTURE_URL, 'utf8')
    .trimEnd()
    .split('\n')
    .sort()
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const missing = expected.filter((line) => !actualSet.has(line))
  const unexpected = actual.filter((line) => !expectedSet.has(line))
  if (missing.length === 0 && unexpected.length === 0) {
    say(`schema verified: ${actual.length} lines match the fixture`)
    return
  }
  const list = (label, lines) =>
    lines.length === 0
      ? ''
      : `\n  ${label} (${lines.length}):\n    ${lines.slice(0, 10).join('\n    ')}`
  fail(
    'the live schema differs from the schema `drizzle/0000_init.sql` builds; refusing to record the baseline.' +
      list('expected but absent', missing) +
      list('present but not expected', unexpected),
  )
}

/**
 * Prints the reason and ends the process with a failing exit code.
 * @param reason - Human-readable cause; never contains connection credentials.
 * @returns Never returns.
 * @example
 * fail('POSTGRES_PRISMA_URL is required')
 */
function fail(reason) {
  console.error(`baseline: ${reason}`)
  process.exit(1)
}

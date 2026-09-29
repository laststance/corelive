// Production baseline for the drizzle migrator — the ONE manual step of the ORM cutover.
//
// Production's application tables were built by the previous ORM's 16 migrations, so
// `drizzle-kit migrate` would try to `CREATE TABLE "Category"` again and fail. The
// migrator only compares the newest `created_at` in `drizzle.__drizzle_migrations` with
// each migration file's journal `when`, so recording `0000_init` as applied takes ONE row.
// The row is the only thing this script ever writes; application tables are untouched.
//
// Usage (POSTGRES_PRISMA_URL points at the database to inspect — never printed):
//   node scripts/baseline-drizzle-migrations.mjs                   read-only: report the state and the pending
//                                                                  migrations; exit 1 when the baseline row is
//                                                                  missing, a table or column of the newest recorded
//                                                                  schema is gone, or a migration older than the newest
//                                                                  recorded row is not recorded (the migrator would
//                                                                  skip it silently)
//   node scripts/baseline-drizzle-migrations.mjs --expect-current  read-only: additionally require that the
//                                                                  newest row equals the journal AND every
//                                                                  journal migration is recorded (post-migrate)
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
//
// Lifecycle: only `--apply` is cutover-only. `.github/workflows/db-migrate.yml` runs the read-only mode and
// `--expect-current` on EVERY deploy, so those stay. Once the baseline row is recorded on production, and
// BEFORE the next migration lands, remove:
//   - the `--apply` path of this script (`applyBaseline`, `verifySchemaMatchesFixture`, the constants above it),
//   - the `--apply` tests in `src/db/baselineMigration.test.ts`, and rewrite the tests that assume a journal
//     of exactly one migration (see the header of that file),
//   - every pointer to `--apply`: the "Record the baseline first" message below, the one-off paragraph in the
//     header of `.github/workflows/db-migrate.yml`, and the "Local database built before the move to Drizzle"
//     note in `README.md`.
// Keep `src/db/__fixtures__/previousOrmSchemaFingerprint.txt`: `src/db/schemaParity.test.ts` still reads it. It
// is a frozen record of the previous ORM's schema and must never be edited to make a test pass.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

// Bounds on every wait against the database. `pg` waits forever by default, so an unreachable or wedged server
// would hold the deploy job, and the `db-migrate-production` concurrency slot behind it, until Actions' 6-hour
// limit. The queries here read catalog views or touch one small table; none legitimately runs for long.
/** Time to open the connection; generous because a managed Postgres can take several seconds to wake up. */
const CONNECT_TIMEOUT_MS = 15_000
/** A statement stuck behind another session's lock (a migration running elsewhere) fails instead of queueing. */
const LOCK_TIMEOUT_MS = 10_000
/** Server-side cap on one statement. */
const STATEMENT_TIMEOUT_MS = 30_000
/** Client-side backstop above the server-side cap: it also covers a socket that went silent, where no server timeout can fire. */
const QUERY_TIMEOUT_MS = 45_000

/** Migrations the previous ORM had applied to production, each recorded as finished. */
const EXPECTED_PREVIOUS_MIGRATIONS = 16
/** The last of them — the one that renamed the default category to "General". */
const EXPECTED_LAST_PREVIOUS_MIGRATION =
  '20260924120000_default_category_named_general'
/** Journal `when` of `0000_init`; the migrator compares it with `created_at`, so it must not drift. */
const EXPECTED_BASELINE_MILLIS = 1790679206746
/**
 * sha256 of `drizzle/0000_init.sql` exactly as the migrator computes it (the whole file text, comments included).
 * `--apply` records this hash, and every later deploy compares it with the file, so a single edited byte would
 * fail every deploy; `src/db/migrationJournal.test.ts` pins the same value in CI.
 */
const EXPECTED_BASELINE_HASH =
  'c74b835ea8b3fc89b265d9dc5ce7b5f079267073724f1bd7fb07cef18b0af3d9'

/** Query text shared with `src/test/schemaFingerprint.ts`, so both sides serialize the schema identically. */
const FINGERPRINT_SQL_URL = new URL('./schema-fingerprint.sql', import.meta.url)
/** Schema the previous ORM's migrations built, as serialized by that query. */
const FINGERPRINT_FIXTURE_URL = new URL(
  '../src/db/__fixtures__/previousOrmSchemaFingerprint.txt',
  import.meta.url,
)

/** The migrator's own index of the migration files: `tag` names each file and `when` is the timestamp it compares. */
const JOURNAL_URL = new URL('../drizzle/meta/_journal.json', import.meta.url)

const applyRequested = process.argv.includes('--apply')
const expectCurrent = process.argv.includes('--expect-current')

const url = process.env.POSTGRES_PRISMA_URL
if (!url) fail('POSTGRES_PRISMA_URL is required')

const target = new URL(url)
// The repository and its Actions logs are public. GitHub masks the secret as a whole, not the host inside it,
// so the host is registered as a mask before it is printed.
if (process.env.GITHUB_ACTIONS === 'true') say(`::add-mask::${target.hostname}`)
say(`target: host=${target.hostname} database=${target.pathname.slice(1)}`)

// Resolved from this file, like the fixture paths above, so the script works from any working directory.
const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
})
const journalEntries = JSON.parse(readFileSync(JOURNAL_URL, 'utf8')).entries
const newestJournalMillis = Math.max(...migrations.map((m) => m.folderMillis))

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  lock_timeout: LOCK_TIMEOUT_MS,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  query_timeout: QUERY_TIMEOUT_MS,
})
await client.connect()
try {
  const state = await readState(client)
  say(
    `state: application tables=${state.applicationTables ? 'present' : 'absent'} ` +
      `bookkeeping rows=${state.bookkeepingRows} newest created_at=${state.newestCreatedAt ?? 'none'}`,
  )

  if (applyRequested) {
    await applyBaseline(client, state)
  } else if (state.rowsWithoutCreatedAt > 0) {
    // The migrator orders by created_at DESC, which puts a NULL first; it then reads that as 0 and
    // treats every migration as unapplied, while the newest-row check here would not notice.
    fail(
      `drizzle.__drizzle_migrations has ${state.rowsWithoutCreatedAt} row(s) without created_at: ` +
        '`drizzle-kit migrate` would read the newest one as 0 and try to apply every migration again.',
    )
  } else if (!state.applicationTables && state.bookkeepingRows > 0) {
    // The migrator skips every file that is not newer than the newest row, so it would build nothing
    // and the deploy would report success on a database without tables.
    fail(
      'drizzle.__drizzle_migrations records applied migrations but no application tables exist in public: ' +
        '`drizzle-kit migrate` would skip them and leave the database without tables. ' +
        'Drop the `drizzle` schema so the migrator rebuilds everything, or restore the tables.',
    )
  } else if (!state.applicationTables) {
    if (expectCurrent) {
      fail(
        'expected a migrated database, but no application tables exist in public',
      )
    }
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
    // After the migrator every file must be recorded. Before it, the files the migrator will not touch
    // (not newer than the newest row) must already be recorded, or it skips them without an error.
    await requireMigrationsRecorded(
      client,
      expectCurrent
        ? migrations
        : migrations.filter((m) => m.folderMillis <= state.newestCreatedAt),
    )
    await requireSchemaPresent(client, state.newestCreatedAt)
    say('baseline recorded: `drizzle-kit migrate` applies only newer files')
    const pending = pendingMigrationTags(state.newestCreatedAt)
    say(
      `pending migrations: ${pending.length === 0 ? 'none' : pending.join(', ')}`,
    )
  }
} finally {
  await client.end()
}

/**
 * Reads what the migrator and the guard need to know about the database, without writing.
 * @param connected - Connected pg client.
 * @returns Whether application tables exist (any table in `public` except the previous ORM's history table) and what the bookkeeping table holds.
 * @example
 * await readState(client) // => { applicationTables: true, bookkeepingRows: 0, rowsWithoutCreatedAt: 0, newestCreatedAt: null }
 */
async function readState(connected) {
  // Any application table counts, not one named table: a later migration may rename or drop any of them,
  // and this check runs on every deploy.
  const {
    rows: [presence],
  } = await connected.query(`
    SELECT EXISTS (
             SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> '_prisma_migrations'
           ) AS application_tables,
           to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS bookkeeping
  `)
  let bookkeepingRows = 0
  let rowsWithoutCreatedAt = 0
  let newestCreatedAt = null
  if (presence.bookkeeping) {
    const {
      rows: [tally],
    } = await connected.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE created_at IS NULL)::int AS without_created_at,
             max(created_at)::text AS newest
        FROM drizzle.__drizzle_migrations
    `)
    bookkeepingRows = tally.total
    rowsWithoutCreatedAt = tally.without_created_at
    newestCreatedAt = tally.newest === null ? null : Number(tally.newest)
  }
  return {
    applicationTables: presence.application_tables,
    bookkeepingRows,
    rowsWithoutCreatedAt,
    newestCreatedAt,
  }
}

/**
 * Lists the migration files the migrator would still apply: those whose journal `when` is newer than the newest recorded row.
 *
 * Shown by the read-only run so an operator approving a production deploy can see whether zero or five files will run.
 * @param newestCreatedAt - Newest `created_at` in the bookkeeping table.
 * @returns Migration tags in journal order.
 * @example
 * pendingMigrationTags(1790679206746) // => [] when 0000_init is the newest file and is recorded
 */
function pendingMigrationTags(newestCreatedAt) {
  return journalEntries
    .filter((entry) => entry.when > newestCreatedAt)
    .map((entry) => entry.tag)
}

/**
 * Names a migration by its journal tag, falling back to the timestamp when the journal has no such entry.
 * @param folderMillis - The migration's journal `when`.
 * @returns Something an operator can map to a file, e.g. `0000_init (journal "when" 1790679206746)`.
 * @example
 * describeMigration(1790679206746) // => '0000_init (journal "when" 1790679206746)'
 */
function describeMigration(folderMillis) {
  const entry = journalEntries.find(
    (candidate) => candidate.when === folderMillis,
  )
  return `${entry?.tag ?? 'unknown migration'} (journal "when" ${folderMillis})`
}

/**
 * Fails unless every given migration has a bookkeeping row with its hash.
 *
 * The migrator applies a file only when its journal `when` is newer than the newest recorded `created_at`. A migration
 * generated on a parallel branch and merged after a newer one is therefore skipped WITHOUT an error, and so is a file
 * edited after it was applied (its hash no longer matches, but the migrator never looks at hashes). Checking the hashes
 * catches both, and the message says which of the two it is because the fix differs.
 * @param connected - Connected pg client.
 * @param required - Migrations that must already be recorded.
 * @returns Resolves when all are recorded; otherwise the process ends via {@link fail}.
 * @example
 * await requireMigrationsRecorded(client, migrations)
 */
async function requireMigrationsRecorded(connected, required) {
  const { rows } = await connected.query(
    'SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations',
  )
  const recordedHashes = new Set(rows.map((row) => row.hash))
  const recordedTimestamps = new Set(rows.map((row) => Number(row.created_at)))
  const problems = required
    .filter((migration) => !recordedHashes.has(migration.hash))
    .map((migration) =>
      recordedTimestamps.has(migration.folderMillis)
        ? `${describeMigration(migration.folderMillis)} is recorded with a different hash: the file was edited after it was applied. Restore it as it was; a change belongs in a new migration.`
        : `${describeMigration(migration.folderMillis)} was never recorded: the migrator skips a file whose "when" is not newer than the newest recorded row. Regenerate it so it sorts after the newer migration.`,
    )
  if (problems.length > 0) {
    fail(
      `${problems.length} journal migration(s) not recorded correctly in drizzle.__drizzle_migrations:\n  ${problems.join('\n  ')}`,
    )
  }
}

/**
 * Fails when a table or column of the schema the newest recorded migration produced is missing from `public`.
 *
 * The bookkeeping row says `0000_init` ran; it cannot say the tables are still there. After a partial restore or a
 * dropped table the migrator skips the file all the same, so the deploy would report success on a database the app
 * cannot query. The expectation comes from drizzle-kit's own snapshot of that migration (`drizzle/meta/NNNN_snapshot.json`),
 * which the schema-drift check keeps equal to `src/db/schema.ts`, so a later migration that renames a table brings its
 * own snapshot and needs no change here. Only presence is checked; types and indexes are the `--apply` fingerprint's job.
 * @param connected - Connected pg client.
 * @param newestCreatedAt - Newest `created_at` in the bookkeeping table, which names the snapshot to compare with.
 * @returns Resolves when nothing is missing, or when the newest recorded migration is not in this checkout (the deployed
 * code is older than the database, so there is no snapshot to compare with); otherwise the process ends via {@link fail}.
 * @example
 * await requireSchemaPresent(client, 1790679206746) // fails when public."Completed" was dropped
 */
async function requireSchemaPresent(connected, newestCreatedAt) {
  const entry = journalEntries.find(
    (candidate) => candidate.when === newestCreatedAt,
  )
  if (!entry) {
    say(
      'schema presence not checked: the newest recorded migration is not in this checkout',
    )
    return
  }
  const snapshotUrl = new URL(
    `../drizzle/meta/${String(entry.idx).padStart(4, '0')}_snapshot.json`,
    import.meta.url,
  )
  const { tables } = JSON.parse(readFileSync(snapshotUrl, 'utf8'))
  const { rows } = await connected.query(`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
  `)
  const present = new Set(
    rows.map((row) => `${row.table_name}.${row.column_name}`),
  )
  const presentTables = new Set(rows.map((row) => row.table_name))
  const missing = []
  // An empty snapshot would pass vacuously, so it is treated as a broken checkout.
  if (Object.keys(tables).length === 0) {
    fail(`drizzle/meta snapshot of ${entry.tag} lists no tables`)
  }
  for (const table of Object.values(tables)) {
    // drizzle-kit stores the default schema as an empty string.
    if (table.schema !== '' && table.schema !== 'public') continue
    if (!presentTables.has(table.name)) {
      missing.push(`table "${table.name}"`)
      continue
    }
    for (const column of Object.values(table.columns)) {
      if (!present.has(`${table.name}.${column.name}`)) {
        missing.push(`column "${table.name}"."${column.name}"`)
      }
    }
  }
  if (missing.length > 0) {
    fail(
      `${entry.tag} is recorded as applied, but the database lacks ${missing.length} of its objects: ` +
        `${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}. ` +
        '`drizzle-kit migrate` would skip the file and the deploy would report success on a schema the app cannot query.',
    )
  }
  say(`schema present: every table and column of ${entry.tag}`)
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
    fail('no application tables found in public: nothing to baseline')
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
  if (hash !== EXPECTED_BASELINE_HASH) {
    fail(
      `drizzle/0000_init.sql hashes to ${hash}, expected ${EXPECTED_BASELINE_HASH}: ` +
        'the file was edited, and the hash recorded now is the one every later deploy compares against',
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

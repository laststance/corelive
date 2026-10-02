// Read-only migration-ledger guard used before and after every production migration.
// The one-time previous-ORM baseline write mode has been retired.
//
// Usage (POSTGRES_PRISMA_URL is never printed):
//   node scripts/baseline-drizzle-migrations.mjs                  inspect recorded/pending migrations
//   node scripts/baseline-drizzle-migrations.mjs --expect-current  require every current migration recorded
//
// The frozen previous-ORM schema fixture remains owned by schemaParity.test.ts.
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

/** The migrator's own index of the migration files: `tag` names each file and `when` is the timestamp it compares. */
const JOURNAL_URL = new URL('../drizzle/meta/_journal.json', import.meta.url)

if (process.argv.slice(2).some((argument) => argument !== '--expect-current')) {
  fail(
    'Unsupported option. This guard is read-only; only --expect-current is supported.',
  )
}
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

  if (state.rowsWithoutCreatedAt > 0) {
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
        'Restore a matching migration ledger from backup, or reset a disposable local database.',
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
 * own snapshot and needs no change here. This guard checks presence; the frozen baseline's types and indexes are
 * verified separately by the schema parity integration test.
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

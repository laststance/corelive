import 'dotenv/config'

import { spawnSync } from 'node:child_process'

import { defineConfig } from 'drizzle-kit'

/** drizzle-kit subcommands that never open a database connection: they read the schema file and the `drizzle/` folder only. */
const OFFLINE_COMMANDS = new Set(['generate', 'check', 'up', 'export'])

/**
 * Whether this process may target a non-local database: on a GitHub Actions runner (`GITHUB_ACTIONS=true`, which
 * the runner sets itself) AND with the deploy workflow's explicit `DRIZZLE_ALLOW_REMOTE=1`.
 *
 * Both are required because drizzle-kit loads `.env` BEFORE it evaluates this file, so a `.env` line looks exactly
 * like a real environment variable here. A developer `.env` that holds a production URL and `DRIZZLE_ALLOW_REMOTE=1`
 * (copied from the deploy job, say) therefore cannot switch the gate off for a raw `pnpm exec drizzle-kit push`.
 */
const remoteAllowed =
  process.env.DRIZZLE_ALLOW_REMOTE === '1' &&
  process.env.GITHUB_ACTIONS === 'true'

/**
 * Applies the fail-closed local-database gate to a raw `drizzle-kit` invocation.
 *
 * The package scripts run `scripts/assert-local-db.cjs` before `drizzle-kit`, but `pnpm exec drizzle-kit push`
 * skips them, and a developer `.env` may point at production. drizzle-kit evaluates this config whenever the
 * connection comes from the environment, so the gate also runs here for any subcommand that could connect
 * (an unknown or missing subcommand counts as one). Only the deploy workflow, which targets production on
 * purpose, opts out (see {@link remoteAllowed}).
 *
 * This guards the accidental case: a URL taken from the environment or `.env`. Credential flags typed on the
 * command line (`--url`, `--host`, …) put drizzle-kit in a mode that never loads this file, and passing them is
 * an explicit act this gate does not try to stop.
 *
 * Called once when drizzle-kit loads this file.
 *
 * @example
 * // POSTGRES_PRISMA_URL=postgresql://…@prod.example.com/db pnpm exec drizzle-kit push
 * // => exits 1 with "[assert-local-db] …" before any connection is made
 */
function assertLocalDatabaseForOnlineCommands(): void {
  // argv[2] is the subcommand: `node drizzle-kit <subcommand> …`
  const subcommand = process.argv[2] ?? ''
  if (OFFLINE_COMMANDS.has(subcommand) || remoteAllowed) {
    return
  }
  const gate = spawnSync(process.execPath, ['scripts/assert-local-db.cjs'], {
    stdio: 'inherit',
  })
  if (gate.status !== 0) {
    process.exit(1)
  }
}

assertLocalDatabaseForOnlineCommands()

/**
 * drizzle-kit configuration for `pnpm db:generate` / `db:migrate` / `db:studio`.
 *
 * The connection URL is `POSTGRES_PRISMA_URL`, a name kept from before the move to Drizzle because
 * Vercel and GitHub secrets use it. When it is unset (CI installs and type-checks without a
 * database; drizzle-kit only needs some URL to start) it falls back to the local Docker DSN. That is
 * the same fallback `scripts/assert-local-db.cjs` and `scripts/reset-local-db.cjs` use, so the gate
 * and the tool always judge and reach the same target. Keep the port in sync with
 * `scripts/local-db-port.cjs`.
 *
 * Never run `drizzle-kit push` or `pull` against this schema. Their live-database introspection skips
 * every index that backs a foreign key, so it cannot see `SkillNode_skillTreeId_id_key` (the target of
 * both composite `NodeEdge` foreign keys) and always plans to drop and re-add those keys and to
 * re-create that index, which fails with 42P07 halfway through, because `push` runs its plan without a
 * transaction. Schema changes go through `db:generate` → committed SQL → `db:migrate`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // The previous ORM's history table exists only in databases it built; introspection must not see
  // it, or a `push` would plan to drop it.
  tablesFilter: ['!_prisma_migrations'],
  dbCredentials: {
    url:
      process.env.POSTGRES_PRISMA_URL ||
      'postgresql://user:pass@localhost:5491/db',
  },
})

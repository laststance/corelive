import { execFileSync } from 'node:child_process'

// Same source as the app's pool (`src/db/index.ts`): a URL that only lives in `.env` must count as set here
// however the importing suite orders its imports. dotenv never overrides a variable that is already set.
import 'dotenv/config'
import { describe } from 'vitest'

/**
 * Shared gate for every real-DB integration suite (procedures, middleware, webhook, `src/db`).
 * They opt in via `RUN_DB_INTEGRATION_TESTS=1` (CI's `test` job sets it once
 * Postgres is up; locally start Postgres with `docker compose up -d` and run
 * `pnpm test:db`). Most suites clean up with per-user-scoped deletes against the
 * shared database `POSTGRES_PRISMA_URL` points at; the ones that change the schema
 * or the migration bookkeeping build a throw-away database next to it instead (see
 * `createScratchDatabase`), so they can never leave the shared one broken — so when
 * enabled, this re-runs the SAME fail-closed chokepoint that guards `db:reset`
 * (`scripts/assert-local-db.cjs`) BEFORE any suite is defined. A misconfigured
 * remote URL aborts the run loudly instead of mutating prod data. Shelling out
 * reuses the gate verbatim — one source of truth, with none of its
 * security-critical URL parsing duplicated here where it could drift from the CLI.
 */
const dbIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === '1'

/**
 * Re-runs the local-DB chokepoint and throws (fail-closed) if it cannot prove
 * the active `POSTGRES_PRISMA_URL` is local — invoked once at import, before any
 * destructive per-user deletes. Surfaces the gate's own reason in the throw.
 * @returns Nothing; returns normally only when the gate exits 0 (provably local).
 * @throws when `POSTGRES_PRISMA_URL` is unset or empty, or when `scripts/assert-local-db.cjs` exits non-zero (non-local / unprovable)
 * @example
 * // POSTGRES_PRISMA_URL=postgresql://...neon.tech/db → throws, suites never run
 */
function assertLocalDbBeforeDestructiveTests(): void {
  // The gate approves the localhost fallback when the URL is unset, but the app's pool then follows
  // PGHOST / PGUSER / PGDATABASE, so the gate would have approved a database it never looked at.
  if (!process.env.POSTGRES_PRISMA_URL) {
    throw new Error(
      'Refusing to run destructive DB integration tests: POSTGRES_PRISMA_URL is not set, so the local-DB ' +
        'gate cannot prove which database the suites would write to. ' +
        'Set it to the local Docker Postgres (localhost:5491).',
    )
  }
  try {
    // process.execPath = the same node running vitest; cwd = repo root (vitest).
    execFileSync(process.execPath, ['scripts/assert-local-db.cjs'], {
      stdio: 'pipe',
    })
  } catch (error) {
    // Bubble up the gate's stderr (its specific "why" message) for debuggability.
    let gateReason = ''
    if (error && typeof error === 'object' && 'stderr' in error) {
      gateReason = String(error.stderr ?? '')
    }
    throw new Error(
      'Refusing to run destructive DB integration tests: the local-DB gate ' +
        '(scripts/assert-local-db.cjs) could not prove POSTGRES_PRISMA_URL is ' +
        'local. Point it at the local Docker Postgres (localhost:5491).\n' +
        gateReason,
    )
  }
}

// Fail closed at import time, before the importing suite's destructive teardown.
if (dbIntegrationEnabled) assertLocalDbBeforeDestructiveTests()

/**
 * `describe` when integration tests are enabled AND the DB is provably local,
 * else `describe.skip`. Wrap only the cases that need a database; keep DB-free
 * cases in a plain `describe`/`test` so they still run in a bare `pnpm test`.
 */
export const describeIfDb = dbIntegrationEnabled ? describe : describe.skip

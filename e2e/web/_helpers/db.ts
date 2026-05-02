import { exec as execCb } from 'node:child_process'
import util from 'node:util'

const exec = util.promisify(execCb)

/**
 * Resets the test database to a deterministic baseline with seeded fixtures.
 *
 * Internally invokes `pnpm db:reset`, which chains `prisma migrate reset
 * --force` and `pnpm prisma:seed` (see package.json) to drop the schema,
 * re-run all migrations, and re-seed the realistic fixture TODO list
 * defined in `prisma/seed.ts`.
 *
 * Call this in `test.beforeAll` so each spec file starts from an identical
 * known state — no leftover rows from earlier specs polluting Argos
 * screenshots, no random IDs bleeding across test boundaries.
 *
 * In CI matrix mode (`.github/workflows/e2e.web.yml`) each runner only
 * executes ONE spec, so `e2e/global-setup.ts`'s up-front reset is already
 * sufficient. The workflow sets `E2E_SKIP_PER_SPEC_RESET=true` to elide the
 * redundant per-spec reset and reclaim ~5-10s per runner. Local sequential
 * runs do NOT set this var, so per-spec resets keep their isolation role.
 *
 * @example
 * test.beforeAll(resetDatabase)
 */
export const resetDatabase = async (): Promise<void> => {
  if (process.env.E2E_SKIP_PER_SPEC_RESET) return
  await exec('pnpm db:reset')
}

import 'dotenv/config'

import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit configuration for `pnpm db:generate` / `db:migrate` / `db:studio`.
 *
 * The connection URL is `POSTGRES_PRISMA_URL`, a name kept from before the move to Drizzle because
 * Vercel and GitHub secrets use it. When it is unset (CI installs and type-checks without a
 * database; drizzle-kit only needs some URL to start) it falls back to the local Docker DSN. That is
 * the same fallback `scripts/assert-local-db.cjs` and `scripts/reset-local-db.cjs` use, so the gate
 * and the tool always judge and reach the same target. Keep the port in sync with
 * `scripts/local-db-port.cjs`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.POSTGRES_PRISMA_URL ||
      'postgresql://user:pass@localhost:5491/db',
  },
})

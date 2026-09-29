import 'dotenv/config'

import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit configuration for `pnpm db:generate` / `db:migrate` / `db:studio`.
 *
 * The connection URL resolves in the same order the ORM config
 * used before drizzle, so CI (dummy URL while installing) and local shells behave as before.
 * The variable keeps its historical name `POSTGRES_PRISMA_URL`; it is set in
 * Vercel and GitHub secrets and must not be renamed.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DATABASE_URL ||
      'postgresql://user:pass@localhost:5491/db?schema=public',
  },
})

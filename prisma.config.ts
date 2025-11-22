import 'dotenv/config'

import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Direct TCP connection via DATABASE_URL
    // Use dummy URL for CI environments where env vars are not yet available during install
    url:
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DATABASE_URL ||
      'postgresql://user:pass@localhost:5432/db?schema=public',
  },
})

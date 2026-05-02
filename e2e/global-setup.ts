import { execSync } from 'node:child_process'

import { clerkSetup } from '@clerk/testing/playwright'

/**
 * Global setup function for Playwright tests
 * This runs before all tests and sets up the test environment.
 *
 * `pnpm db:reset` chains `prisma migrate reset --force` with `pnpm prisma:seed`
 * (see package.json), so a single invocation drops the schema, re-runs all
 * migrations, and re-seeds fixtures in one shot. Prisma 7's `migrate reset`
 * skips seeding by default — the chained script is the corelive-side fix.
 */
export default async function globalSetup() {
  execSync('pnpm db:reset', {
    stdio: 'pipe',
    env: {
      ...process.env,
      DEBUG: '',
    },
  })

  // Initialize Clerk Testing Tokens for bot detection avoidance
  await clerkSetup()
}

import { execSync } from 'node:child_process'

import { clerkSetup } from '@clerk/testing/playwright'

/**
 * Global setup function for Playwright tests
 * This runs before all tests and sets up the test environment
 */
export default async function globalSetup() {
  // Reset database for clean test state
  // Note: Prisma 7's `migrate reset --force` does not auto-run the seed,
  // so we run it explicitly after reset to ensure test fixtures exist.
  execSync('pnpm db:reset', {
    stdio: 'pipe', // Suppress stdout/stderr for cleaner output
    env: {
      ...process.env,
      DEBUG: '', // Disable debug logging
    },
  })
  execSync('pnpm prisma:seed', {
    stdio: 'pipe',
    env: {
      ...process.env,
      DEBUG: '',
    },
  })

  // Initialize Clerk Testing Tokens for bot detection avoidance
  await clerkSetup()
}

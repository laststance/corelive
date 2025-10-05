import { execSync } from 'node:child_process'

import { clerkSetup } from '@clerk/testing/playwright'

/**
 * Global setup function for Playwright tests
 * This runs before all tests and sets up the test environment
 */
export default async function globalSetup() {
  // Reset database for clean test state
  execSync('pnpm db:reset', {
    stdio: 'pipe', // Suppress stdout/stderr for cleaner output
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEBUG: '', // Disable debug logging
    },
  })

  // Initialize Clerk Testing Tokens for bot detection avoidance
  await clerkSetup()
}

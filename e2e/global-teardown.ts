import { execSync } from 'node:child_process'

/**
 * Global teardown function for Playwright tests
 * This runs after all tests and cleans up the test environment
 */
export default async function globalTeardown() {
  // Reset database after tests complete
  execSync('pnpm db:reset', {
    stdio: 'pipe', // Suppress stdout/stderr for cleaner output
    env: {
      ...process.env,
      DEBUG: '', // Disable debug logging
    },
  })
}

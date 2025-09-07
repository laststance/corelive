import { clerkSetup } from '@clerk/testing/playwright'

async function globalSetup() {
  // Skip database reset for now to focus on authentication setup
  // execSync('pnpm db:reset', {
  //   stdio: 'pipe', // Suppress stdout/stderr for cleaner output
  //   env: {
  //     ...process.env,
  //     NODE_ENV: 'test',
  //     DEBUG: '', // Disable debug logging
  //   },
  // })

  // Initialize Clerk Testing Tokens for bot detection avoidance
  await clerkSetup()
}

export default globalSetup

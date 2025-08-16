import { execSync } from 'node:child_process'

import { clerkSetup } from '@clerk/testing/playwright'

async function globalSetup() {
  console.log('Running global setup...')

  // Database setup
  console.log('Running database seed...')
  execSync('pnpm db:seed', { stdio: 'inherit' })

  // Clerk setup
  console.log('Setting up Clerk...')
  await clerkSetup()

  // Validate required environment variables
  if (
    !process.env.E2E_CLERK_USER_USERNAME ||
    !process.env.E2E_CLERK_USER_PASSWORD ||
    !process.env.E2E_CLERK_USER_EMAIL
  ) {
    throw new Error(
      'Please provide E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD, E2E_CLERK_USER_EMAIL environment variables.',
    )
  }

  console.log('Global setup completed.')
}

export default globalSetup

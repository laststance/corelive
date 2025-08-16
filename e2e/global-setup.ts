import { execSync } from 'node:child_process'

// Note: clerkSetup not needed for pure MSW + Playwright route interception approach
// import { clerkSetup } from '@clerk/testing/playwright'

async function globalSetup() {
  console.log('Running global setup...')

  // Database setup
  console.log('Running database seed...')
  execSync('pnpm db:seed', { stdio: 'inherit' })
}

export default globalSetup

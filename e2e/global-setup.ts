import { execSync } from 'node:child_process'

async function globalSetup() {
  console.log('Running global setup...')

  // Database setup
  console.log('Running database seed...')
  execSync('pnpm db:reset', { stdio: 'inherit' })
}

export default globalSetup

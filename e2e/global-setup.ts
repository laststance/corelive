import { execSync } from 'node:child_process'

async function globalSetup() {
  // Database setup - suppress output for cleaner test logs
  execSync('pnpm db:reset', {
    stdio: 'pipe', // Suppress stdout/stderr for cleaner output
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEBUG: '', // Disable debug logging
    },
  })
}

export default globalSetup

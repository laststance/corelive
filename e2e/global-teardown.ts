import { execSync } from 'node:child_process'

import type { FullConfig } from '@playwright/test'

export default async function globalTeardown(_config: FullConfig) {
  //Skip database reset for now to focus on authentication setup

  execSync('pnpm db:reset', {
    stdio: 'pipe', // Suppress stdout/stderr for cleaner output
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEBUG: '', // Disable debug logging
    },
  })
}

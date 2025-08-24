import { execSync } from 'node:child_process'

import type { FullConfig } from '@playwright/test'

export default async function globalTeardown(_config: FullConfig) {
  // Skip database reset in CI environment since no database server is running
  if (!process.env.CI) {
    execSync('pnpm db:reset', {
      stdio: 'pipe', // Suppress stdout/stderr for cleaner output
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DEBUG: '', // Disable debug logging
      },
    })
  }
}

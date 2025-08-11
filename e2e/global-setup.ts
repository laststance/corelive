import { execSync } from 'node:child_process'

import type { FullConfig } from '@playwright/test'

export default async function globalSetup(_config: FullConfig) {
  execSync('pnpm db:reset', { stdio: 'inherit' })
}

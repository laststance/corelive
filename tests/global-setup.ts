import type { FullConfig } from '@playwright/test'
import { execSync } from 'node:child_process'

export default async function globalSetup(_config: FullConfig) {
  // Ensure MSW is enabled for the app during tests
  process.env.NEXT_PUBLIC_ENABLE_MSW_MOCK = 'true'

  // Free the Next.js port before Playwright's webServer starts
  try {
    execSync('npx kill-port 3000', { stdio: 'ignore' })
  } catch {
    // ignore
  }

  // Ensure Postgres is up (best-effort)
  try {
    execSync('docker compose -f /Users/ryotamurakami/corelive/compose.yml up -d postgres', {
      stdio: 'ignore',
    })
  } catch {
    // ignore
  }

  // Truncate DB tables before the run (best-effort)
  try {
    const sql = 'TRUNCATE "Completed", "Category", "User" RESTART IDENTITY CASCADE;'
    execSync(
      'docker exec -e PGPASSWORD=password corelive-postgres psql -h localhost -U postgres -d corelive -c "' +
        sql.replace(/"/g, '\\"') +
        '"',
      { stdio: 'ignore' },
    )
  } catch {
    // ignore
  }
}



import type { FullConfig } from '@playwright/test'
import { execSync } from 'node:child_process'

export default async function globalTeardown(_config: FullConfig) {
  // Truncate DB tables after the run (best-effort)
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

  try {
    execSync('npx kill-port 3000', { stdio: 'ignore' })
  } catch {
    // ignore
  }
}



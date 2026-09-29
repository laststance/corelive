// @vitest-environment node
import { spawnSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

/**
 * Contract test for `scripts/reset-local-db.cjs`, the schema wipe behind `pnpm db:reset`
 * and `pnpm db:truncate`. It replaced the previous ORM's `migrate reset --force` and
 * drops every CoreLive schema, so even a bare `node scripts/reset-local-db.cjs`
 * (skipping the package-script gate) must refuse a non-local URL before it opens a
 * connection. Never touches a database: the host uses the reserved `.invalid` TLD,
 * so even a broken gate could not reach a real server.
 */

describe('reset-local-db schema wipe', () => {
  test('refuses a remote connection string before connecting, so a bare run can never drop a production schema', () => {
    // Arrange
    const remoteUrl =
      'postgresql://postgres:secret@prod-db.invalid:5432/corelive?schema=public'

    // Act
    const run = spawnSync(process.execPath, ['scripts/reset-local-db.cjs'], {
      env: { ...process.env, POSTGRES_PRISMA_URL: remoteUrl },
      encoding: 'utf8',
    })

    // Assert — the gate aborted; the wipe never started or reported anything.
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('[assert-local-db]')
    expect(run.stderr).toContain('prod-db.invalid')
    expect(`${run.stdout}${run.stderr}`).not.toContain('[reset-local-db]')
  })
})

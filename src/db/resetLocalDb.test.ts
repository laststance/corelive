// @vitest-environment node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { describe, expect, test } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { fingerprintPublicSchema } from '@/test/schemaFingerprint'
import { createScratchDatabase } from '@/test/scratchDatabase'

/**
 * Contract test for `scripts/reset-local-db.cjs`, the schema wipe behind `pnpm db:reset`
 * and `pnpm db:truncate`. It replaced the previous ORM's `migrate reset --force` and
 * drops every CoreLive schema, so even a bare `node scripts/reset-local-db.cjs`
 * (skipping the package-script gate) must refuse a non-local URL before it opens a
 * connection. The refusal test never touches a database: the host uses the reserved
 * `.invalid` TLD, so even a broken gate could not reach a real server. The second block
 * runs the wipe for real, on a scratch database of its own.
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

describeIfDb(
  'reset-local-db against a scratch database (real PostgreSQL)',
  () => {
    test('drops the tables and the migration bookkeeping, and leaves a database the migrator rebuilds to the same schema, so db:reset gives a working database and not an empty one', async () => {
      // Arrange
      const scratch = await createScratchDatabase()

      try {
        const schemaBefore = await fingerprintPublicSchema(scratch.db)

        // Act
        const run = spawnSync(
          process.execPath,
          ['scripts/reset-local-db.cjs'],
          {
            env: { ...process.env, POSTGRES_PRISMA_URL: scratch.url },
            encoding: 'utf8',
          },
        )
        const afterWipe = await scratch.db.execute<{
          user_table: boolean
          bookkeeping: boolean
        }>(sql`
        SELECT to_regclass('public."User"') IS NOT NULL AS user_table,
               to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS bookkeeping
      `)
        await migrate(scratch.db, {
          migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
        })
        const schemaAfter = await fingerprintPublicSchema(scratch.db)

        // Assert — everything was dropped, and replaying the migrations restores the identical schema.
        expect(run.status).toBe(0)
        expect(run.stdout).toContain('[reset-local-db]')
        expect(afterWipe.rows).toEqual([
          { user_table: false, bookkeeping: false },
        ])
        expect(schemaAfter).toBe(schemaBefore)
      } finally {
        await scratch.drop()
      }
    })
  },
)

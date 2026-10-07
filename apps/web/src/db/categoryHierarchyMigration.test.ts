// @vitest-environment node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { expect, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { createScratchDatabase } from '@/test/scratchDatabase'

import { categoryTable, completedTable, userTable } from './schema'

vi.setConfig({ testTimeout: 30_000 })

describeIfDb(
  'category hierarchy upgrade preserves the frozen original schema evidence',
  () => {
    test('upgrades existing flat categories without changing entries and enforces parent ownership and sibling uniqueness', async () => {
      // Arrange — 0000 remains unmodified; only this owned throwaway database is migrated.
      const scratch = await createScratchDatabase({ firstMigrationOnly: true })
      const date = new Date('2026-01-01T12:34:56.000Z')
      try {
        const [owner] = await scratch.db
          .insert(userTable)
          .values({ clerkId: 'migration_owner' })
          .returning()
        const [other] = await scratch.db
          .insert(userTable)
          .values({ clerkId: 'migration_other' })
          .returning()
        const {
          rows: [work],
        } = await scratch.db.execute<{ id: number }>(
          sql`INSERT INTO "Category" (name, "userId", "updatedAt") VALUES ('Work', ${owner!.id}, ${date.toISOString()}) RETURNING id`,
        )
        const [entry] = await scratch.db
          .insert(completedTable)
          .values({
            userId: owner!.id,
            categoryId: work!.id,
            title: 'Existing writing',
            createdAt: date,
            updatedAt: date,
            completedAt: date,
          })
          .returning()
        const [baseline] = readMigrationFiles({
          migrationsFolder: path.resolve('drizzle'),
        })
        await scratch.db.execute(sql`CREATE SCHEMA drizzle`)
        await scratch.db.execute(
          sql`CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
        )
        await scratch.db.execute(
          sql`INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES (${baseline!.hash},${baseline!.folderMillis})`,
        )
        // Act
        await migrate(scratch.db, { migrationsFolder: path.resolve('drizzle') })
        // Assert
        const [storedWork] = await scratch.db
          .select()
          .from(categoryTable)
          .where(eq(categoryTable.id, work!.id))
        const [storedEntry] = await scratch.db
          .select()
          .from(completedTable)
          .where(eq(completedTable.id, entry!.id))
        expect(storedWork).toMatchObject({
          id: work!.id,
          name: 'Work',
          parentId: null,
        })
        expect(storedEntry).toMatchObject({
          id: entry!.id,
          categoryId: work!.id,
          title: 'Existing writing',
          createdAt: date,
          updatedAt: date,
          completedAt: date,
        })
        const [child] = await scratch.db
          .insert(categoryTable)
          .values({ name: 'Design', userId: owner!.id, parentId: work!.id })
          .returning()
        expect(child?.parentId).toBe(work!.id)
        const foreign = scratch.db
          .insert(categoryTable)
          .values({ name: 'Foreign', userId: other!.id, parentId: work!.id })
        await expect(foreign).rejects.toMatchObject({
          cause: { code: '23503' },
        })
        const duplicate = scratch.db
          .insert(categoryTable)
          .values({ name: 'Design', userId: owner!.id, parentId: work!.id })
        await expect(duplicate).rejects.toMatchObject({
          cause: { code: '23505' },
        })
        const [personal] = await scratch.db
          .insert(categoryTable)
          .values({ name: 'Personal', userId: owner!.id })
          .returning()
        await scratch.db
          .insert(categoryTable)
          .values({ name: 'Design', userId: owner!.id, parentId: personal!.id })
        const defaultChild = scratch.db.insert(categoryTable).values({
          name: 'Invalid default',
          userId: owner!.id,
          parentId: work!.id,
          isDefault: true,
        })
        await expect(defaultChild).rejects.toMatchObject({
          cause: { code: '23514' },
        })
        const self = scratch.db
          .update(categoryTable)
          .set({ parentId: work!.id })
          .where(eq(categoryTable.id, work!.id))
        await expect(self).rejects.toMatchObject({ cause: { code: '23514' } })
        const checked = spawnSync(
          process.execPath,
          ['scripts/baseline-drizzle-migrations.mjs', '--expect-current'],
          {
            env: { ...process.env, POSTGRES_PRISMA_URL: scratch.url },
            encoding: 'utf8',
            timeout: 15_000,
          },
        )
        expect(checked.status).toBe(0)
        expect(checked.stdout).toContain('pending migrations: none')
      } finally {
        await scratch.drop()
      }
    })
  },
)

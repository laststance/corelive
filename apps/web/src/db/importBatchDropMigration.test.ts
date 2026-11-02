// @vitest-environment node
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { expect, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'
import { createScratchDatabase } from '@/test/scratchDatabase'

vi.setConfig({ testTimeout: 30_000 })

/** Index of `0004_drop_import_batch` in the ordered migration list; everything before it is the pre-drop schema. */
const DROP_IMPORT_BATCH_MIGRATION_INDEX = 4

/**
 * Applies a slice of the committed migrations to a scratch database, statement by statement.
 * Used by the retention test below to stop the schema at `0003` and then apply `0004` alone.
 * @param database - Scratch database that owns the schema being built.
 * @param fromIndex - First migration (inclusive) to apply.
 * @param toIndex - Last migration (exclusive) to apply.
 * @returns Once every statement in the slice has run.
 * @example
 * await applyMigrationSlice(scratch.db, 1, 4) // 0001..0003
 */
async function applyMigrationSlice(
  database: NodePgDatabase,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const migrations = readMigrationFiles({
    migrationsFolder: path.resolve('drizzle'),
  }).slice(fromIndex, toIndex)
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      await database.execute(sql.raw(statement))
    }
  }
}

/**
 * Lists the columns a table has, so the test can see which ones a migration removed.
 * @param database - Scratch database to inspect.
 * @param tableName - Table whose column names are wanted.
 * @returns Column names in table order.
 * @example
 * await readColumnNames(scratch.db, 'Completed') // => ['id', 'archived', ...]
 */
async function readColumnNames(
  database: NodePgDatabase,
  tableName: string,
): Promise<string[]> {
  const { rows } = await database.execute<{ column_name: string }>(
    sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} ORDER BY ordinal_position`,
  )
  return rows.map((row) => row.column_name)
}

describeIfDb('dropping ImportBatch keeps existing completions', () => {
  test('keeps a completion row with its id and localCompletionId while ImportBatch and both importBatchId columns disappear', async () => {
    // Arrange — build the schema as it was at 0003, then insert a legacy import row.
    const scratch = await createScratchDatabase({ firstMigrationOnly: true })
    try {
      await applyMigrationSlice(
        scratch.db,
        1,
        DROP_IMPORT_BATCH_MIGRATION_INDEX,
      )
      const {
        rows: [owner],
      } = await scratch.db.execute<{ id: number }>(
        sql`INSERT INTO "User" ("clerkId", "updatedAt") VALUES ('import_drop_owner', now()) RETURNING id`,
      )
      const {
        rows: [category],
      } = await scratch.db.execute<{ id: number }>(
        sql`INSERT INTO "Category" (name, "userId", "updatedAt") VALUES ('General', ${owner!.id}, now()) RETURNING id`,
      )
      await scratch.db.execute(
        sql`INSERT INTO "ImportBatch" (id, "userId") VALUES ('legacy-batch', ${owner!.id})`,
      )
      const {
        rows: [completed],
      } = await scratch.db.execute<{ id: number }>(
        sql`INSERT INTO "Completed" (title, "userId", "categoryId", "updatedAt", "importBatchId", "localCompletionId") VALUES ('Legacy keep', ${owner!.id}, ${category!.id}, now(), 'legacy-batch', 'keep-1') RETURNING id`,
      )

      // Act
      await applyMigrationSlice(
        scratch.db,
        DROP_IMPORT_BATCH_MIGRATION_INDEX,
        DROP_IMPORT_BATCH_MIGRATION_INDEX + 1,
      )

      // Assert
      const { rows: storedRows } = await scratch.db.execute<{
        id: number
        title: string
        localCompletionId: string
      }>(
        sql`SELECT id, title, "localCompletionId" FROM "Completed" WHERE "userId" = ${owner!.id}`,
      )
      expect(storedRows).toEqual([
        {
          id: completed!.id,
          title: 'Legacy keep',
          localCompletionId: 'keep-1',
        },
      ])
      const { rows: importBatchTables } = await scratch.db.execute<{
        name: string | null
      }>(sql`SELECT to_regclass('public."ImportBatch"')::text AS name`)
      expect(importBatchTables[0]?.name).toBeNull()
      expect(await readColumnNames(scratch.db, 'Completed')).not.toContain(
        'importBatchId',
      )
      expect(await readColumnNames(scratch.db, 'Todo')).not.toContain(
        'importBatchId',
      )
    } finally {
      await scratch.drop()
    }
  })
})

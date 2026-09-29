// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { asc, eq, sql } from 'drizzle-orm'
import { expect, test, vi } from 'vitest'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { categoryTable, todoTable, userTable } from '@/db/schema'

import { describeIfDb } from './describeIfDb'

/**
 * Real-DB proof for the data migration that makes "General" every account's
 * fixed default. It runs the historical migration SQL, kept verbatim as a
 * fixture, so the exact statements that shipped are what gets tested. The SQL
 * rewrites every account, so each case runs inside one transaction that is
 * always rolled back: a local dev DB's real accounts are never touched, and
 * there is nothing to clean up.
 */
vi.setConfig({ testTimeout: 30_000 })

const MIGRATION_SQL_PATH = path.join(
  process.cwd(),
  'src',
  'server',
  'procedures',
  '__fixtures__',
  '20260924120000_default_category_named_general.sql',
)

/** The transaction handle `db.transaction` passes to its callback. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Thrown at the end of every case so the transaction rolls back. */
class RollbackSignal extends Error {}

/**
 * Runs one case inside a transaction that is always rolled back.
 * @param runCase - Arranges fixtures, runs the migration and asserts, all on `tx`.
 * @returns Resolves after the rollback; rethrows any assertion failure.
 * @example
 * await inRolledBackTransaction(async (tx) => { await runMigration(tx) })
 */
async function inRolledBackTransaction(
  runCase: (tx: Transaction) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await runCase(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

/**
 * Executes the whole migration file as one query. With no bound parameters the
 * driver uses the simple query protocol, which accepts several statements (and
 * their comments) in one round-trip, the same way a migration runner applies it.
 * @param tx - The case's transaction client.
 * @returns Resolves once every statement has run.
 * @example
 * await runMigration(tx)
 */
async function runMigration(tx: Transaction): Promise<void> {
  await tx.execute(sql.raw(readFileSync(MIGRATION_SQL_PATH, 'utf8')))
}

async function createUser(tx: Transaction) {
  return requireRow(
    await tx
      .insert(userTable)
      .values({ clerkId: `test_default_migration_${randomUUID()}` })
      .returning(),
    'user.create',
  )
}

async function createCategory(
  tx: Transaction,
  userId: number,
  name: string,
  isDefault: boolean,
) {
  return requireRow(
    await tx
      .insert(categoryTable)
      .values({ name, color: 'blue', isDefault, userId })
      .returning(),
    'category.create',
  )
}

async function readCategories(tx: Transaction, userId: number) {
  return tx
    .select({
      id: categoryTable.id,
      name: categoryTable.name,
      isDefault: categoryTable.isDefault,
    })
    .from(categoryTable)
    .where(eq(categoryTable.userId, userId))
    .orderBy(asc(categoryTable.id))
}

describeIfDb(
  'default category migration — "General" becomes the fixed default',
  () => {
    test('hands the default flag to an existing "General" and turns the renamed default into a normal, deletable category', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange — the signup default was renamed, and a later "General" was added.
        const user = await createUser(tx)
        const renamed = await createCategory(
          tx,
          user.id,
          'Geek Infiltration',
          true,
        )
        const general = await createCategory(tx, user.id, 'General', false)
        const task = requireRow(
          await tx
            .insert(todoTable)
            .values({
              text: 'Keep me',
              userId: user.id,
              categoryId: renamed.id,
            })
            .returning(),
          'todo.create',
        )

        // Act
        await runMigration(tx)

        // Assert — same ids, the flag moved, and the task did not.
        expect(await readCategories(tx, user.id)).toEqual([
          { id: renamed.id, name: 'Geek Infiltration', isDefault: false },
          { id: general.id, name: 'General', isDefault: true },
        ])
        expect(
          requireRow(
            await tx
              .select()
              .from(todoTable)
              .where(eq(todoTable.id, task.id))
              .limit(1),
            'todo.findUniqueOrThrow',
          ),
        ).toMatchObject({ categoryId: renamed.id })
      })
    })

    test('renames a renamed default back to "General" when the account has no "General"', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange
        const user = await createUser(tx)
        const renamed = await createCategory(tx, user.id, 'Inbox', true)
        const work = await createCategory(tx, user.id, 'Work', false)

        // Act
        await runMigration(tx)

        // Assert
        expect(await readCategories(tx, user.id)).toEqual([
          { id: renamed.id, name: 'General', isDefault: true },
          { id: work.id, name: 'Work', isDefault: false },
        ])
      })
    })

    test('leaves an account whose default is already "General" exactly as it was', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange
        const user = await createUser(tx)
        const general = await createCategory(tx, user.id, 'General', true)
        const work = await createCategory(tx, user.id, 'Work', false)

        // Act
        await runMigration(tx)

        // Assert
        expect(await readCategories(tx, user.id)).toEqual([
          { id: general.id, name: 'General', isDefault: true },
          { id: work.id, name: 'Work', isDefault: false },
        ])
      })
    })

    test('keeps "General" as the only default when a renamed default and "General" are both flagged (dev seed shape)', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange — the seed upsert re-flags "General" without clearing the old default.
        const user = await createUser(tx)
        const renamed = await createCategory(
          tx,
          user.id,
          'Geek Infiltration',
          true,
        )
        const general = await createCategory(tx, user.id, 'General', true)

        // Act
        await runMigration(tx)

        // Assert
        expect(await readCategories(tx, user.id)).toEqual([
          { id: renamed.id, name: 'Geek Infiltration', isDefault: false },
          { id: general.id, name: 'General', isDefault: true },
        ])
      })
    })

    test('keeps only the oldest of two non-"General" defaults and names it "General", without a unique-name clash', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange
        const user = await createUser(tx)
        const oldest = await createCategory(tx, user.id, 'Inbox', true)
        const newer = await createCategory(tx, user.id, 'Later', true)

        // Act
        await runMigration(tx)

        // Assert
        expect(await readCategories(tx, user.id)).toEqual([
          { id: oldest.id, name: 'General', isDefault: true },
          { id: newer.id, name: 'Later', isDefault: false },
        ])
      })
    })

    test('does not invent a default for an account that has none', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange
        const user = await createUser(tx)
        const work = await createCategory(tx, user.id, 'Work', false)

        // Act
        await runMigration(tx)

        // Assert
        expect(await readCategories(tx, user.id)).toEqual([
          { id: work.id, name: 'Work', isDefault: false },
        ])
      })
    })

    test('changes nothing when it runs a second time', async () => {
      await inRolledBackTransaction(async (tx) => {
        // Arrange — an account the first run has to fix.
        const user = await createUser(tx)
        const renamed = await createCategory(
          tx,
          user.id,
          'Geek Infiltration',
          true,
        )
        const general = await createCategory(tx, user.id, 'General', false)
        await runMigration(tx)

        // Act
        await runMigration(tx)

        // Assert
        expect(await readCategories(tx, user.id)).toEqual([
          { id: renamed.id, name: 'Geek Infiltration', isDefault: false },
          { id: general.id, name: 'General', isDefault: true },
        ])
      })
    })
  },
)

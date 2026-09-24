// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Prisma } from '@prisma/client'
import { expect, test, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

import { describeIfDb } from './describeIfDb'

/**
 * Real-DB proof for the data migration that makes "General" every account's
 * fixed default. It runs the exact SQL file `prisma migrate deploy` ships, so an
 * edit to the file is what gets tested. The SQL rewrites every account, so each
 * case runs inside one transaction that is always rolled back: a local dev DB's
 * real accounts are never touched, and there is nothing to clean up.
 */
vi.setConfig({ testTimeout: 30_000 })

const MIGRATION_SQL_PATH = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260924120000_default_category_named_general',
  'migration.sql',
)

/** Thrown at the end of every case so Prisma rolls the transaction back. */
class RollbackSignal extends Error {}

/**
 * Runs one case inside a transaction that is always rolled back.
 * @param runCase - Arranges fixtures, runs the migration and asserts, all on `tx`.
 * @returns Resolves after the rollback; rethrows any assertion failure.
 * @example
 * await inRolledBackTransaction(async (tx) => { await runMigration(tx) })
 */
async function inRolledBackTransaction(
  runCase: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await runCase(tx)
        throw new RollbackSignal()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

/**
 * Executes the migration file statement by statement (a prepared statement
 * takes one command). Comment lines are dropped first: they contain semicolons.
 * @param tx - The case's transaction client.
 * @returns Resolves once every statement has run.
 * @example
 * await runMigration(tx)
 */
async function runMigration(tx: Prisma.TransactionClient): Promise<void> {
  const statements = readFileSync(MIGRATION_SQL_PATH, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

async function createUser(tx: Prisma.TransactionClient) {
  return tx.user.create({
    data: { clerkId: `test_default_migration_${randomUUID()}` },
  })
}

async function createCategory(
  tx: Prisma.TransactionClient,
  userId: number,
  name: string,
  isDefault: boolean,
) {
  return tx.category.create({
    data: { name, color: 'blue', isDefault, userId },
  })
}

async function readCategories(tx: Prisma.TransactionClient, userId: number) {
  return tx.category.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, isDefault: true },
  })
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
        const task = await tx.todo.create({
          data: { text: 'Keep me', userId: user.id, categoryId: renamed.id },
        })

        // Act
        await runMigration(tx)

        // Assert — same ids, the flag moved, and the task did not.
        expect(await readCategories(tx, user.id)).toEqual([
          { id: renamed.id, name: 'Geek Infiltration', isDefault: false },
          { id: general.id, name: 'General', isDefault: true },
        ])
        expect(
          await tx.todo.findUniqueOrThrow({ where: { id: task.id } }),
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

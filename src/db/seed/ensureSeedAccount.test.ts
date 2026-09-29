// @vitest-environment node
import { and, eq } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { describeIfDb } from '@/server/procedures/describeIfDb'

import { db } from '../index'
import { categoryTable, userTable } from '../schema'

import { ensureSeedAccount } from './ensureSeedAccount'
import { SEED_USER_CLERK_ID } from './seedUser'

/**
 * Real-database coverage for the account both seeds (`pnpm db:seed`, `pnpm seed:dev`)
 * attach their data to. The previous ORM's `upsert` calls became
 * `ON CONFLICT (clerkId) DO NOTHING` and `ON CONFLICT (name, userId) DO UPDATE`;
 * a conflict target that matches no unique index fails only at run time, so the
 * re-run path is exercised against the real indexes here.
 *
 * The seed identity is fixed, and a developer database may already hold it (with
 * data) after `pnpm db:reset`, so teardown removes it only when this test created it.
 */
vi.setConfig({ testTimeout: 30_000 })

// Safe default: never delete a seed account this test did not create.
let seedUserExistedBeforeTest = true

afterEach(async () => {
  // Read and reset the flag before any await, so the next test starts from the safe default.
  const createdByThisTest = !seedUserExistedBeforeTest
  seedUserExistedBeforeTest = true
  if (!createdByThisTest) return
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, SEED_USER_CLERK_ID))
  if (!user) return
  await db.delete(categoryTable).where(eq(categoryTable.userId, user.id))
  await db.delete(userTable).where(eq(userTable.id, user.id))
})

describeIfDb('ensureSeedAccount (real PostgreSQL)', () => {
  test('re-running the seed makes "General" the default again without creating a second account or category', async () => {
    // Arrange — run once, then demote "General" the way a hand edit could.
    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, SEED_USER_CLERK_ID))
    seedUserExistedBeforeTest = existing.length > 0
    const first = await ensureSeedAccount()
    await db
      .update(categoryTable)
      .set({ isDefault: false })
      .where(eq(categoryTable.id, first.generalCategory.id))

    // Act
    const second = await ensureSeedAccount()

    // Assert
    expect(second.user.id).toBe(first.user.id)
    expect(second.generalCategory).toMatchObject({
      id: first.generalCategory.id,
      name: 'General',
      isDefault: true,
    })
    const seedUsers = await db
      .select()
      .from(userTable)
      .where(eq(userTable.clerkId, SEED_USER_CLERK_ID))
    expect(seedUsers).toHaveLength(1)
    const generalRows = await db
      .select()
      .from(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, first.user.id),
          eq(categoryTable.name, 'General'),
        ),
      )
    expect(generalRows).toHaveLength(1)
  })
})

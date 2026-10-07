import { eq, isNull } from 'drizzle-orm'

import { db } from '../index'
import { categoryTable, userTable } from '../schema'

import { SEED_USER_CLERK_ID, SEED_USER_EMAIL } from './seedUser'

/**
 * Makes sure the shared development account (Clerk dev-tenant user + its default
 * "General" category) exists, so both seeds attach their data to the same identity.
 *
 * Idempotent: an existing user is left untouched, and re-running promotes "General"
 * back to the default category. Called at the start of `seed.ts` and `seed.dev.ts`.
 *
 * @returns The seeded user row and its default "General" category row.
 * @throws {Error} When a row that was just inserted cannot be read back.
 * @example
 * const { user, generalCategory } = await ensureSeedAccount()
 */
export async function ensureSeedAccount() {
  // Insert-if-missing, then read: the seeded user is never modified on re-runs.
  await db
    .insert(userTable)
    .values({
      clerkId: SEED_USER_CLERK_ID,
      email: SEED_USER_EMAIL,
      name: 'test01',
      bio: 'Test account for local development',
    })
    .onConflictDoNothing({ target: userTable.clerkId })
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.clerkId, SEED_USER_CLERK_ID))
  if (!user) throw new Error('Seed user missing after insert')

  // "General" is the default category; re-running promotes it back to default.
  const [generalCategory] = await db
    .insert(categoryTable)
    .values({
      name: 'General',
      color: 'blue',
      isDefault: true,
      userId: user.id,
    })
    .onConflictDoUpdate({
      target: [categoryTable.name, categoryTable.userId],
      targetWhere: isNull(categoryTable.parentId),
      set: { isDefault: true },
    })
    .returning()
  if (!generalCategory) throw new Error('Default category missing after upsert')

  return { user, generalCategory }
}

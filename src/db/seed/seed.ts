import { and, eq, inArray } from 'drizzle-orm'

import { db } from '../index'
import { todoTable } from '../schema'

import { ensureSeedAccount } from './ensureSeedAccount'

/**
 * Seeds the database with initial data based on the Clerk test account.
 *
 * Inserts:
 * - Test User (linked to the Clerk dev tenant's `test@test.com` account)
 * - Default "General" category
 * - A representative real-world TODO list — a deterministic mix of work +
 *   life tasks for a realistic local-development baseline.
 */
async function main(): Promise<void> {
  const { user, generalCategory: defaultCategory } = await ensureSeedAccount()

  // Fixed strings — no Date.now() / Math.random(). `pnpm db:reset`
  // re-creates the schema so autoincrement IDs are always 1..N here.
  const fixtureTodos = [
    "Review Sarah's PR before standup",
    'Update README with API examples',
    'Buy groceries for the week',
    'Schedule dentist appointment',
    'Pay credit card bill',
    'Call mom on Sunday',
    'Renew gym membership',
    'Read 30 minutes before bed',
    'Plan weekend hike route',
    'Workout - leg day',
  ]

  // `pnpm db:reset` leaves these tables empty, so a plain insert would suffice
  // after a reset. But `pnpm db:seed` is also exposed as a standalone script —
  // without a delete-first guard a second invocation would duplicate every
  // fixture row and break the deterministic local baseline. Wrapping the
  // delete + insert in a single transaction makes the script idempotent for
  // both call sites.
  await db.transaction(async (tx) => {
    await tx
      .delete(todoTable)
      .where(
        and(
          eq(todoTable.userId, user.id),
          eq(todoTable.categoryId, defaultCategory.id),
          inArray(todoTable.text, fixtureTodos),
        ),
      )
    await tx.insert(todoTable).values(
      fixtureTodos.map((text, index) => ({
        text,
        order: index,
        userId: user.id,
        categoryId: defaultCategory.id,
      })),
    )
  })
}

main()
  .then(async () => {
    await db.$client.end()
  })
  .catch(async (e) => {
    console.error('❌ Error during database seeding:', e)
    await db.$client.end()
    process.exit(1)
  })

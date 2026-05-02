import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const adapter = new PrismaPg({
  connectionString: process.env.POSTGRES_PRISMA_URL!,
})

const prisma = new PrismaClient({ adapter })

/**
 * Seeds the database with initial data based on the Clerk test account.
 *
 * Inserts:
 * - Test User (linked to the Clerk dev tenant's `test@test.com` account)
 * - Default "General" category
 * - A representative real-world TODO list — a deterministic mix of work +
 *   life tasks. This baseline lets E2E specs assume a realistic starting
 *   state in `beforeAll(resetDatabase)` without seeding individually, and
 *   gives Argos visual snapshots an authentic-looking todo list to capture.
 */
async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { clerkId: 'user_32MtPR8Z8ywubMj2jwG9DdSbzPq' },
    update: {},
    create: {
      clerkId: 'user_32MtPR8Z8ywubMj2jwG9DdSbzPq',
      email: 'test@test.com',
      name: 'test01',
      bio: 'Test account for development and E2E testing',
    },
  })

  const defaultCategory = await prisma.category.upsert({
    where: { name_userId: { name: 'General', userId: user.id } },
    update: { isDefault: true },
    create: {
      name: 'General',
      color: 'blue',
      isDefault: true,
      userId: user.id,
    },
  })

  // Fixed strings — no Date.now() / Math.random(). `migrate reset --force`
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

  // `migrate reset --force` (chained via `pnpm db:reset`) leaves these
  // tables empty, so a plain `createMany` would suffice in the E2E flow.
  // But `pnpm prisma:seed` is also exposed as a standalone script — without
  // a delete-first guard a second invocation would duplicate every fixture
  // row and break the deterministic state E2E specs depend on. Wrapping the
  // delete + insert in a single transaction makes the script idempotent for
  // both call sites.
  await prisma.$transaction([
    prisma.todo.deleteMany({
      where: {
        userId: user.id,
        categoryId: defaultCategory.id,
        text: { in: fixtureTodos },
      },
    }),
    prisma.todo.createMany({
      data: fixtureTodos.map((text, index) => ({
        text,
        order: index,
        userId: user.id,
        categoryId: defaultCategory.id,
      })),
    }),
  ])
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Error during database seeding:', e)
    await prisma.$disconnect()
    process.exit(1)
  })

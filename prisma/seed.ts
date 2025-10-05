import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seeds the database with initial data based on Clerk test account.
 */
async function main(): Promise<void> {
  // TODO: Relpalce console.log with pino-pretty
  // console.log('🌱 Starting database seed...')

  // Create test user based on Clerk test account
  await prisma.user.upsert({
    where: { clerkId: 'user_32MtPR8Z8ywubMj2jwG9DdSbzPq' },
    update: {},
    create: {
      clerkId: 'user_32MtPR8Z8ywubMj2jwG9DdSbzPq',
      email: 'test@test.com',
      name: 'test01',
      bio: 'Test account for development and E2E testing',
    },
  })
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

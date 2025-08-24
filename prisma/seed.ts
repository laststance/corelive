import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  // Create E2E test user based on .env configuration
  const testUser = await prisma.user.create({
    data: {
      clerkId: 'user_e2e_test_clerk_id_12345',
      email: 'test@test.com', // From E2E_CLERK_USER_EMAIL
      name: 'E2E Test User',
      bio: 'Test user for end-to-end testing and development',
    },
  })

  console.log(`👤 Created user: ${testUser.name} (${testUser.email})`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seeding error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })

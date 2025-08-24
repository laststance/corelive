import { PrismaClient } from '@prisma/client'

// Create Prisma client without debug logging for cleaner E2E test output
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'test' ? [] : ['warn', 'error'],
})

async function main() {
  // Only show logs when not in test environment
  if (process.env.NODE_ENV !== 'test') {
    console.log('🌱 Starting database seeding...')
  }

  // Create E2E test user based on .env configuration
  const testUser = await prisma.user.create({
    data: {
      clerkId: 'user_e2e_test_clerk_id_12345',
      email: 'test@test.com', // From E2E_CLERK_USER_EMAIL
      name: 'E2E Test User',
      bio: 'Test user for end-to-end testing and development',
    },
  })

  if (process.env.NODE_ENV !== 'test') {
    console.log(`👤 Created user: ${testUser.name} (${testUser.email})`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('❌ Seeding error:', e)
    }
    await prisma.$disconnect()
    process.exit(1)
  })

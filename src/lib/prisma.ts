import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const adapter = new PrismaPg({
  connectionString: process.env.POSTGRES_PRISMA_URL!,
})

export const prisma = new PrismaClient({ adapter })

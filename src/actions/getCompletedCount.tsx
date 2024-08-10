import { prisma } from '@/lib/prisma'
import type { User } from '@/types/prisma'

export async function getCompletedCount(user: User) {
  return prisma.completed.count({
    where: { userId: user?.id },
  })
}

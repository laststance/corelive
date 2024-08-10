import { prisma } from '@/lib/prisma'
import type { User } from '@/types/prisma'

export async function getAllCompleted(user: User) {
  return prisma.completed.findMany({
    where: { userId: user?.id },
    include: { category: true },
  })
}

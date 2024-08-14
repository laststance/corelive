import { prisma } from '@/lib/prisma'
import type { CompletedList, User } from '@/types/prisma'

export async function getAllCompleted(user: User): Promise<CompletedList> {
  return prisma.completed.findMany({
    where: { userId: user?.id },
  }) as unknown as CompletedList
}

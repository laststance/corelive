'use server'

import { prisma } from '@/lib/prisma'
import type { User, Category } from '@/types/app'

export async function getCategories(userId: User['id']): Promise<Category[]> {
  const categories = await prisma.category.findMany({
    where: {
      userId: userId,
    },
  })

  return categories as unknown as Category[]
}

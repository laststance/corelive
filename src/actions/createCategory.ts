'use server'

import { prisma } from '@/lib/prisma'
import type { User, Category } from '@/types/prisma'

export async function createCategory(
  userId: User['id'],
  categoryName: Category['name'],
): Promise<Category> {
  const category = await prisma.category.create({
    data: {
      name: categoryName,
      userId: userId,
    },
  })

  return category as unknown as Category
}

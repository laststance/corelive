'use server'

import { prisma } from '@/lib/prisma'

export async function createCategory(category: string, userId: number) {
  const categoryRecord = await prisma.category.create({
    data: {
      name: category,
      userId: userId,
    },
  })!

  return categoryRecord
}

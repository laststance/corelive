'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/prisma'
import type { Category, User } from '@/types/app'

export async function deleteCategory(
  userId: User['id'],
  categoryId: Category['id'],
): Promise<{ message: string }> {
  const res = await prisma.category.delete({
    where: {
      id: categoryId,
      userId: userId,
    },
  })

  if (!res) {
    throw new Error('DB Error creating category')
  }
  revalidatePath('/dashboard')
  return {
    message: 'Category deleted',
  }
}

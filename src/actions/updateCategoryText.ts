'use server'
import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/prisma'
import type { User, Category } from '@/types/prisma'
import type { ToastMessage } from '@/types/utility'

export async function updateCategoryText(
  userId: User['id'],
  categoryId: Category['id'],
  categoryText: Category['text'],
): Promise<ToastMessage.Success> {
  await prisma.category.update({
    where: {
      id: categoryId,
      userId: userId,
    },
    data: {
      text: categoryText,
    },
  })

  revalidatePath('/dashboard')

  return {
    message: 'Category text updated',
    type: 'success',
  }
}

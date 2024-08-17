'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/prisma'
import type { Category } from '@/redux/editorSlice'
import type { User } from '@/types/prisma'

export async function createCompleted(
  text: Category['text'],
  categoryName: Category['name'],
  userId: User['id'],
) {
  let category = await prisma.category.findFirst({
    where: { name: categoryName, userId: userId },
  })

  if (!category) {
    category = await prisma.category.create({
      data: {
        name: categoryName,
        userId: userId,
      },
    })
  }

  // insert new completed task
  await prisma.completed.create({
    data: {
      title: text,
      categoryId: category.id,
      userId: userId,
    },
  })
  // Revalidate the path to update the UI
  revalidatePath('/dashboard')
}

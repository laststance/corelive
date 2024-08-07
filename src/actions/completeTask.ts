'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/prisma'
import type { Category, User, Text } from '@/types/app'

export async function completeTask(
  text: Text['text'],
  category: Category['name'],
  userId: User['id'],
) {
  try {
    let categoryRecord = await prisma.category.findFirst({
      where: { name: category },
    })

    //insert new category
    if (categoryRecord === null) {
      categoryRecord = await prisma.category.create({
        data: {
          name: category,
          userId: userId,
        },
      })!
    }

    // insert new completed task
    await prisma.completed.create({
      data: {
        title: text,
        categoryId: categoryRecord.id,
        userId: userId,
      },
    })
    // Revalidate the path to update the UI
    revalidatePath('/dashboard')
  } catch (error) {
    console.error('Error completing task:', error)
    throw new Error('Failed to complete task')
  }
}

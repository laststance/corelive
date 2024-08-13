'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/prisma'
import type { Category } from '@/redux/editorSlice'
import type { User } from '@/types/prisma'

export async function createCompleted(
  text: Category['text'],
  category: Category['name'],
  userId: User['id'],
) {
  // insert new completed task
  await prisma.completed.create({
    data: {
      title: text,
      category: category,
      userId: userId,
    },
  })
  // Revalidate the path to update the UI
  revalidatePath('/dashboard')
}

'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function completeTask(text: string, category: string) {
  try {
    console.log('completeTask', text, category)

    // Upsert the category
    // const categoryRecord = await prisma.category.upsert({
    //   where: { name: category },
    //   update: {},
    //   create: { name: category },
    // })

    // // Insert the completed task
    // await prisma.completed.create({
    //   data: {
    //     title: text,
    //     categoryId: categoryRecord.id,
    //   },
    // })

    // Revalidate the path to update the UI
    revalidatePath('/dashboard')
  } catch (error) {
    console.error('Error completing task:', error)
    throw new Error('Failed to complete task')
  }
}

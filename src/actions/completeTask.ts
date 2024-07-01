'use server'

import { revalidatePath } from 'next/cache'

export async function completeTask(text: string, category: string) {
  // TODO get user from cler
  try {
    console.log('completeTask', text, category)

    // const categoryRecord = await prisma.category.findFirst({
    //   where: { name: category },
    // })

    // insert new category
    // if (categoryRecord === null) {
    //   await prisma.category.create({
    //     data: {
    //       name: category,
    //     },
    //   })
    // } else {
    //   console.log('categoryRecord', categoryRecord)
    // }

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

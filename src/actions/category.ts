'use server'

import type { ZodError } from 'zod'
import z from 'zod'

import { prisma } from '@/lib/prisma'
import type { User } from '@/types/app'

const schema = z.object({
  category: z
    .string()
    .min(1, { message: 'Category is required' })
    .max(30, { message: 'Category must be less than 30 characters' }),
})

type State = {
  errors?: ReturnType<ZodError['flatten']>['fieldErrors']
  success: boolean
}
export async function createCategory(
  userId: User['id'],
  prevState: State,
  formData: FormData,
): Promise<State> {
  const category = formData.get('category') as string
  const validatedFields = schema.safeParse({ category })
  if (validatedFields.success) {
    const categoryRecord = await prisma.category.create({
      data: {
        name: category,
        userId: userId,
      },
    })

    if (!categoryRecord) {
      throw new Error('DB Error creating category')
    }

    return {
      success: true,
    }
  } else {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }
}

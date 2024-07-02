import { PrismaClient } from '@prisma/client'

import type { User, Editor, Category, Completed } from '@/types/app'

export const prisma = new PrismaClient()

// TODO I use it Prisma type generation handle middleware in the future
// prisma.$use(async (params, next) => {
//   const result = await next(params)
//   if (result && typeof result === 'object') {
//     convertDatesToISO(result)
//   }
//   return result
// })

type ConvertDateToString<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends object
      ? ConvertDateToString<T[K]>
      : T[K]
}

function convertDatesToISO<T>(obj: T): ConvertDateToString<T> {
  for (const key in obj) {
    if (obj[key] instanceof Date) {
      ;(obj[key] as unknown as string) = obj[key].toISOString()
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertDatesToISO(obj[key])
    }
  }
  return obj as ConvertDateToString<T>
}

export async function getUserById(
  id: number,
): Promise<ConvertDateToString<User> | null> {
  const user = await prisma.user.findUnique({ where: { id } })
  return user ? convertDatesToISO(user) : null
}

export async function getEditorById(id: number): Promise<Editor | null> {
  const editor = await prisma.editor.findUnique({
    where: { id },
    include: { category: true },
  })
  return editor ? convertDatesToISO(editor) : null
}

export async function getCategoryById(id: number): Promise<Category | null> {
  const category = await prisma.category.findUnique({ where: { id } })
  return category ? convertDatesToISO(category) : null
}

export async function getCompletedById(id: number): Promise<Completed | null> {
  const completed = await prisma.completed.findUnique({ where: { id } })
  return completed ? convertDatesToISO(completed) : null
}

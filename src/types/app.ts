import type {
  Editor as PrismaEditor,
  Category as PrismaCategory,
  Completed as PrismaCompleted,
  User as PrismaUser,
} from '@prisma/client'

import type { Expand, ConvertDateToString } from './utility'

export type User = Omit<PrismaUser, 'createdAt' | 'updatedAt'>
export type Editor = Expand<
  ConvertDateToString<PrismaEditor> & {
    category: Category['name']
  }
>
export type EditorList = Editor[]

export type Category = PrismaCategory

export type CategoryList = Category[]

export type Completed = PrismaCompleted

export type CompletedList = Completed[]

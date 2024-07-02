import type {
  Editor as PrismaEditor,
  Category as PrismaCategory,
  Completed as PrismaCompleted,
  User as PrismaUser,
} from '@prisma/client'

import type { ConvertDateToString } from '@/types/utility'

export type User = ConvertDateToString<PrismaUser>
export type Editor = ConvertDateToString<PrismaEditor> & { category: Category }
export type EditorList = Editor[]

export type Category = ConvertDateToString<PrismaCategory>

export type CategoryList = Category[]

export type Completed = ConvertDateToString<PrismaCompleted>

export type CompletedWithCategory = Completed & { category: Category }

export type CompletedList = Completed[]

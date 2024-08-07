import type {
  Text as PrismaText,
  Category as PrismaCategory,
  Completed as PrismaCompleted,
  User as PrismaUser,
} from '@prisma/client'

import type { ConvertDateToString } from '@/types/utility'

export type User = ConvertDateToString<PrismaUser>
export type Text = ConvertDateToString<PrismaText>
export type Category = ConvertDateToString<PrismaCategory>

export type CategoryList = Category[]

export type Completed = ConvertDateToString<PrismaCompleted>

export type CompletedWithCategory = ({
  category: {
    id: number
    name: string
    userId: number | null
    createdAt: Date
    updatedAt: Date
  }
} & {
  id: number
  archived: boolean
  title: string
  userId: number
  categoryId: number
  createdAt: Date
  updatedAt: Date
})[]

export type CompletedList = Completed[]

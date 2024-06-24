import type {
  Editor as PrismaEditor,
  Category as PrismaCategory,
  Completed as PrismaCompleted,
} from '@prisma/client'

import type { Expand, StripDBFields } from './utility'

export type Editor = Expand<
  StripDBFields<PrismaEditor> & {
    category: Category['name']
  }
>
export type EditorList = Editor[]

export type Category = PrismaCategory

export type CategoryList = Category[]

export type Completed = Expand<
  StripDBFields<PrismaCompleted> & {
    category: Category['name']
  }
>

export type CompletedList = Completed[]

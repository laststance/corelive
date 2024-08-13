import type {
  Completed as PrismaCompleted,
  User as PrismaUser,
} from '@prisma/client'

import type { ConvertDateToString } from '@/types/utility'

export type User = ConvertDateToString<PrismaUser>

export type Completed = ConvertDateToString<PrismaCompleted>

export type CompletedList = Completed[]

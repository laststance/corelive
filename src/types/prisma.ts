import type { User as PrismaUser } from '@prisma/client'

import type { getAllCompleted } from '@/actions/getAllCompleted'

export type User = PrismaUser

export type CompletedList = Awaited<ReturnType<typeof getAllCompleted>>

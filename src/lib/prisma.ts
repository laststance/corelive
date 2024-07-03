import { PrismaClient as OriginalPrismaClient } from '@prisma/client'

import type { TransformDateToString } from '@/types/utility'
// Override the Prisma client types

class PrismaClient extends OriginalPrismaClient {
  // Custom Prisma client implementation if needed
}

type CustomPrismaClient = {
  [K in keyof PrismaClient]: PrismaClient[K] extends (
    ...args: infer A
  ) => infer R
    ? (
        ...args: A
      ) => R extends Promise<infer P>
        ? Promise<TransformDateToString<P>>
        : TransformDateToString<R>
    : PrismaClient[K]
}
export const prisma: CustomPrismaClient = new PrismaClient() as any

prisma.$use(async (params, next) => {
  const result = await next(params)
  if (result && typeof result === 'object') {
    convertDatesToISO(result)
  }
  return result
})
function convertDatesToISO(obj: { [x: string]: any }) {
  for (const key in obj) {
    if (obj[key] instanceof Date) {
      obj[key] = obj[key].toISOString()
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertDatesToISO(obj[key])
    }
  }
}

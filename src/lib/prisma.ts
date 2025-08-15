import { PrismaClient } from '@prisma/client'

import type { TransformDateToString } from '@/types/utility'

function convertDatesToISO(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (obj instanceof Date) {
    return obj.toISOString()
  }

  if (Array.isArray(obj)) {
    return obj.map(convertDatesToISO)
  }

  if (typeof obj === 'object') {
    const converted: any = {}
    for (const key in obj) {
      converted[key] = convertDatesToISO(obj[key])
    }
    return converted
  }

  return obj
}

const prismaClient = new PrismaClient().$extends({
  result: {
    $allModels: {
      // Apply date transformation to all models
    },
  },
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const result = await query(args)
        return convertDatesToISO(result)
      },
    },
  },
})

type CustomPrismaClient = typeof prismaClient & {
  [K in keyof PrismaClient]: K extends `$${string}`
    ? PrismaClient[K]
    : PrismaClient[K] extends (...args: infer A) => infer R
      ? (
          ...args: A
        ) => R extends Promise<infer P>
          ? Promise<TransformDateToString<P>>
          : TransformDateToString<R>
      : PrismaClient[K]
}

export const prisma = prismaClient as CustomPrismaClient

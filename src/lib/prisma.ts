import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

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

import { ORPCError } from '@orpc/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

/**
 * Default category name/color, mirroring the seed (`prisma/seed.ts`) and the
 * Clerk webhook (`src/app/api/webhooks/route.ts`). Kept here so the import
 * get-or-create fallback creates the SAME "General" row those paths create
 * (the table enforces `@@unique([name, userId])`), never a divergent default.
 */
const DEFAULT_CATEGORY_NAME = 'General'
const DEFAULT_CATEGORY_COLOR = 'blue'

/**
 * Resolves every paste-import item to a concrete, owned `categoryId` BEFORE the
 * insert transaction runs — so the only P2002 source inside the transaction is
 * the `ImportBatch` insert (making the idempotency catch unambiguous). Shared
 * by `completed.createMany` and `todo.createMany`.
 *
 * Behavior:
 * - Items WITH a `categoryId` are ownership-verified as a set; a foreign /
 *   nonexistent id throws `NOT_FOUND` (rejects the whole batch).
 * - If ANY item omits `categoryId`, the user's default category is
 *   get-or-created (`findFirst isDefault`; else create, catching P2002 from a
 *   concurrent create and re-querying) and used as the fallback.
 *
 * @param userId - Internal `User.id` (NOT the Clerk id string).
 * @param items - The batch items; only their optional `categoryId` is read.
 * @returns
 * - `(item) => number`: a resolver mapping each item to its final categoryId
 *   (its own verified id, or the default category id when omitted)
 * @throws ORPCError('NOT_FOUND') when a provided categoryId is not owned by the user
 * @example
 * const resolve = await resolveImportCategoryIds(7, [{ categoryId: 3 }, {}])
 * resolve({ categoryId: 3 }) // => 3
 * resolve({})               // => <user's default category id>
 */
export async function resolveImportCategoryIds(
  userId: number,
  items: ReadonlyArray<{ categoryId?: number }>,
): Promise<(item: { categoryId?: number }) => number> {
  // Distinct explicit ids across the batch — verify ownership as a set so a
  // single foreign id rejects the whole import (cheaper than per-row checks).
  const providedCategoryIds = [
    ...new Set(
      items
        .map((item) => item.categoryId)
        .filter((categoryId): categoryId is number => categoryId !== undefined),
    ),
  ]

  if (providedCategoryIds.length > 0) {
    const ownedCategories = await prisma.category.findMany({
      where: { id: { in: providedCategoryIds }, userId },
      select: { id: true },
    })
    const ownedCategoryIds = new Set(ownedCategories.map((row) => row.id))
    const foreignCategoryIds = providedCategoryIds.filter(
      (categoryId) => !ownedCategoryIds.has(categoryId),
    )
    if (foreignCategoryIds.length > 0) {
      throw new ORPCError('NOT_FOUND', {
        message: `Category not found: ${foreignCategoryIds.join(', ')}`,
      })
    }
  }

  // Only resolve a default category when at least one item needs the fallback.
  const needsDefaultCategory = items.some(
    (item) => item.categoryId === undefined,
  )
  let defaultCategoryId: number | null = null
  if (needsDefaultCategory) {
    defaultCategoryId = await getOrCreateDefaultCategoryId(userId)
  }

  return (item: { categoryId?: number }): number => {
    if (item.categoryId !== undefined) return item.categoryId
    // needsDefaultCategory was true (this item omitted categoryId), so the
    // default id was resolved above; the non-null assertion is sound.
    return defaultCategoryId!
  }
}

/**
 * Get-or-creates the user's default ("General") category, surviving the race
 * where a concurrent request creates it first: a `@@unique([name, userId])`
 * P2002 is caught and the row is re-queried rather than crashing the import.
 *
 * @param userId - Internal `User.id`.
 * @returns The default category's id.
 * @example
 * await getOrCreateDefaultCategoryId(7) // => 12
 */
async function getOrCreateDefaultCategoryId(userId: number): Promise<number> {
  const existingDefault = await prisma.category.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  })
  if (existingDefault) return existingDefault.id

  try {
    const created = await prisma.category.create({
      data: {
        name: DEFAULT_CATEGORY_NAME,
        color: DEFAULT_CATEGORY_COLOR,
        isDefault: true,
        userId,
      },
      select: { id: true },
    })
    return created.id
  } catch (error) {
    // P2002 = a concurrent request created the same (name, userId) default
    // first. Re-query by the same key so the import proceeds idempotently.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const raced = await prisma.category.findFirst({
        where: { userId, name: DEFAULT_CATEGORY_NAME },
        select: { id: true },
      })
      if (raced) return raced.id
    }
    throw error
  }
}

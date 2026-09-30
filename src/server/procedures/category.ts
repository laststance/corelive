/**
 * Authenticated category reads and serialized two-level hierarchy writes.
 * @module server/procedures/category
 * @example await orpcClient.category.create({ name: 'CoreLive', parentId: 1 })
 */
import { ORPCError } from '@orpc/server'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { PG_UNIQUE_VIOLATION } from '@/db/constants'
import { isPgError } from '@/db/isPgError'
import { requireRow } from '@/db/requireRow'
import {
  categoryTable,
  completedTable,
  todoTable,
  type User,
} from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { createModuleLogger } from '@/lib/logger'

import { authMiddleware } from '../middleware/auth'
import {
  type Category,
  type CategoryWithCount,
  CategorySchema,
  CategoryListResponseSchema,
  CreateCategorySchema,
  DEFAULT_CATEGORY_SEED,
  UpdateCategorySchema,
} from '../schemas/category'

const log = createModuleLogger('category')
type CategoryTransaction = Parameters<Parameters<typeof runTransaction>[0]>[0]
type CategoryDatabase = typeof db | CategoryTransaction

/**
 * Serializes hierarchy writes and Keeps before validation; category mutations and {@link createCompleted} call this inside their transaction.
 * @param tx - Transaction that owns every following validation and write.
 * @param userId - Owner whose category graph is being changed.
 * @returns Once this transaction owns the account lock.
 * @example await lockCategoryOwner(tx, user.id)
 */
export async function lockCategoryOwner(
  tx: CategoryTransaction,
  userId: number,
): Promise<void> {
  // NO KEY UPDATE serializes our writers without blocking unrelated User foreign-key checks.
  await tx.execute(
    sql`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`,
  )
}

/**
 * Reads categories with independent record aggregates so Todo/Completed joins cannot multiply deletion previews; called by {@link listCategories}.
 * @param userId - Owner whose categories to read.
 * @returns Creation-ordered categories with direct open Todo and all-record counts.
 * @example await readCategoriesWithCounts(1)
 */
async function readCategoriesWithCounts(
  userId: User['id'],
): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      category: categoryTable,
      openTodoCount: db.$count(
        todoTable,
        and(
          eq(todoTable.categoryId, categoryTable.id),
          eq(todoTable.userId, userId),
          eq(todoTable.completed, false),
        ),
      ),
      todoCount: db.$count(
        todoTable,
        and(
          eq(todoTable.categoryId, categoryTable.id),
          eq(todoTable.userId, userId),
        ),
      ),
      completedCount: db.$count(
        completedTable,
        and(
          eq(completedTable.categoryId, categoryTable.id),
          eq(completedTable.userId, userId),
        ),
      ),
    })
    .from(categoryTable)
    .where(eq(categoryTable.userId, userId))
    .orderBy(asc(categoryTable.createdAt), asc(categoryTable.id))
  return rows.map(({ category, openTodoCount, todoCount, completedCount }) => ({
    ...category,
    recordCount: todoCount + completedCount,
    _count: { todos: openTodoCount },
  })) as CategoryWithCount[]
}

/**
 * Reads only an owned category; writes pass their locked transaction so validation cannot race deletion.
 * @param database - Defaults to the shared client for nontransactional readers.
 * @returns The owned row, or undefined without revealing foreign-owned rows.
 * @example await findOwnedCategory(user.id, 3, tx)
 */
export async function findOwnedCategory(
  userId: User['id'],
  categoryId: number,
  database: CategoryDatabase = db,
) {
  const [category] = await database
    .select()
    .from(categoryTable)
    .where(
      and(eq(categoryTable.id, categoryId), eq(categoryTable.userId, userId)),
    )
    .limit(1)
  return category
}

/**
 * Validates an optional parent inside the account lock; create/update call this before writing the hierarchy.
 * @returns Owned main category, or null for a root destination.
 * @throws NOT_FOUND for missing/foreign parents and BAD_REQUEST for invalid depth or self-parenting.
 * @example const parent = await validateCategoryParent(tx, user.id, parentId, categoryId)
 */
async function validateCategoryParent(
  tx: CategoryTransaction,
  userId: number,
  parentId: number | null,
  categoryId?: number,
) {
  if (parentId === null) return null
  if (parentId === categoryId)
    throw new ORPCError('BAD_REQUEST', {
      message: 'A category cannot be its own parent',
    })
  const parent = await findOwnedCategory(userId, parentId, tx)
  if (!parent)
    throw new ORPCError('NOT_FOUND', { message: 'Parent category not found' })
  if (parent.parentId !== null)
    throw new ORPCError('BAD_REQUEST', {
      message: 'Subcategories cannot have subcategories',
    })
  // Moving a root with children would make those children a forbidden third level.
  if (categoryId !== undefined) {
    const [child] = await tx
      .select({ id: categoryTable.id })
      .from(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, userId),
          eq(categoryTable.parentId, categoryId),
        ),
      )
      .limit(1)
    if (child)
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Move or promote the subcategories before moving their main category',
      })
  }
  return parent
}

/** Lists categories and repairs a genuinely empty account; the editor and Home bootstrap call it on load.
 * @example const { categories } = await orpcClient.category.list()
 */
export const listCategories = authMiddleware
  .output(CategoryListResponseSchema)
  .handler(async ({ context }) => {
    try {
      const { user } = context
      const categories = await readCategoriesWithCounts(user.id)
      if (categories.length > 0) return { categories }
      // Root uniqueness makes overlapping middleware/webhook repairs idempotent.
      await db
        .insert(categoryTable)
        .values({ ...DEFAULT_CATEGORY_SEED, userId: user.id })
        .onConflictDoNothing()
      return { categories: await readCategoriesWithCounts(user.id) }
    } catch (error) {
      log.error({ error }, 'Error in listCategories')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch categories',
        cause: error,
      })
    }
  })

/** Creates a root or child for picker/manager requests; inherits the parent's color only when the caller omits color.
 * @example await orpcClient.category.create({ name: 'CoreLive', parentId: 1 })
 */
export const createCategory = authMiddleware
  .input(CreateCategorySchema)
  .output(CategorySchema)
  .handler(async ({ input, context }) => {
    try {
      const category = await runTransaction(async (tx) => {
        await lockCategoryOwner(tx, context.user.id)
        const parentId = input.parentId ?? null
        const parent = await validateCategoryParent(
          tx,
          context.user.id,
          parentId,
        )
        return requireRow(
          await tx
            .insert(categoryTable)
            .values({
              name: input.name,
              color: input.color ?? parent?.color ?? 'blue',
              parentId,
              userId: context.user.id,
            })
            .returning(),
          'category.insert',
        )
      })
      return category as Category
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION))
        throw new ORPCError('CONFLICT', {
          message: `Category "${input.name}" already exists in this main category`,
        })
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in createCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create category',
        cause: error,
      })
    }
  })

/** Updates metadata or moves a category from the manager while preserving IDs and all entry/draft identities.
 * @example await orpcClient.category.update({ id: 3, data: { parentId: null } })
 */
export const updateCategory = authMiddleware
  .input(
    z.object({ id: z.number().int().positive(), data: UpdateCategorySchema }),
  )
  .output(CategorySchema)
  .handler(async ({ input, context }) => {
    try {
      const category = await runTransaction(async (tx) => {
        const { id, data } = input
        await lockCategoryOwner(tx, context.user.id)
        const existing = await findOwnedCategory(context.user.id, id, tx)
        if (!existing)
          throw new ORPCError('NOT_FOUND', { message: 'Category not found' })
        if (
          existing.isDefault &&
          data.name !== undefined &&
          data.name !== existing.name
        )
          throw new ORPCError('FORBIDDEN', {
            message: "The default category can't be renamed",
          })
        if (
          existing.isDefault &&
          data.parentId !== undefined &&
          data.parentId !== null
        )
          throw new ORPCError('FORBIDDEN', {
            message: 'The default category must remain a main category',
          })
        if (data.parentId !== undefined)
          await validateCategoryParent(tx, context.user.id, data.parentId, id)
        // Empty edits preserve updatedAt and avoid Drizzle's empty SET error.
        if (Object.values(data).every((value) => value === undefined))
          return existing
        return requireRow(
          await tx
            .update(categoryTable)
            .set(data)
            .where(
              and(
                eq(categoryTable.id, id),
                eq(categoryTable.userId, context.user.id),
              ),
            )
            .returning(),
          'category.update',
        )
      })
      return category as Category
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION))
        throw new ORPCError('CONFLICT', {
          message: `Category "${input.data.name ?? 'with this name'}" already exists in this main category`,
        })
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in updateCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to update category',
        cause: error,
      })
    }
  })

/** Deletes only classification: manager requests atomically promote children and transfer direct records without changing their timestamps.
 * @example await orpcClient.category.delete({ id: 3, targetCategoryId: 1 })
 */
export const deleteCategory = authMiddleware
  .input(
    z.object({
      id: z.number().int().positive(),
      targetCategoryId: z.number().int().positive().optional(),
    }),
  )
  .output(
    z.object({
      success: z.literal(true),
      movedToCategoryId: z.number().int().positive(),
      promotedCategoryIds: z.array(z.number().int().positive()),
    }),
  )
  .handler(async ({ input, context }) => {
    try {
      return await runTransaction(async (tx) => {
        const userId = context.user.id
        const { id } = input
        await lockCategoryOwner(tx, userId)
        const existing = await findOwnedCategory(userId, id, tx)
        if (!existing)
          throw new ORPCError('NOT_FOUND', { message: 'Category not found' })
        if (existing.isDefault)
          throw new ORPCError('FORBIDDEN', {
            message: 'Cannot delete the default category',
          })
        const children = await tx
          .select()
          .from(categoryTable)
          .where(
            and(
              eq(categoryTable.userId, userId),
              eq(categoryTable.parentId, id),
            ),
          )
          .orderBy(asc(categoryTable.id))
        let targetId = input.targetCategoryId ?? existing.parentId
        if (targetId === undefined || targetId === null) {
          // Repair a missing default without mistaking a child named General for the root.
          await tx
            .insert(categoryTable)
            .values({ ...DEFAULT_CATEGORY_SEED, userId })
            .onConflictDoNothing()
          const [general] = await tx
            .select()
            .from(categoryTable)
            .where(
              and(
                eq(categoryTable.userId, userId),
                eq(categoryTable.name, 'General'),
                isNull(categoryTable.parentId),
              ),
            )
            .limit(1)
          targetId = general?.id ?? null
        }
        if (targetId === id)
          throw new ORPCError('BAD_REQUEST', {
            message: 'Choose a different destination category',
          })
        if (!targetId || !(await findOwnedCategory(userId, targetId, tx)))
          throw new ORPCError('NOT_FOUND', {
            message: 'Destination category not found',
          })
        const roots = await tx
          .select({ id: categoryTable.id, name: categoryTable.name })
          .from(categoryTable)
          .where(
            and(
              eq(categoryTable.userId, userId),
              isNull(categoryTable.parentId),
            ),
          )
        const conflicts = children.filter((child) =>
          roots.some((root) => root.id !== id && root.name === child.name),
        )
        if (conflicts.length)
          throw new ORPCError('CONFLICT', {
            message: `Rename these subcategories before deleting their main category: ${conflicts.map((child) => child.name).join(', ')}`,
          })
        // Children retain their IDs; only the removed parent's direct records move.
        if (children.length)
          await tx
            .update(categoryTable)
            .set({ parentId: null })
            .where(
              and(
                eq(categoryTable.userId, userId),
                eq(categoryTable.parentId, id),
              ),
            )
        await tx
          .update(todoTable)
          .set({ categoryId: targetId, updatedAt: sql`${todoTable.updatedAt}` })
          .where(
            and(eq(todoTable.userId, userId), eq(todoTable.categoryId, id)),
          )
        await tx
          .update(completedTable)
          .set({
            categoryId: targetId,
            updatedAt: sql`${completedTable.updatedAt}`,
          })
          .where(
            and(
              eq(completedTable.userId, userId),
              eq(completedTable.categoryId, id),
            ),
          )
        requireRow(
          await tx
            .delete(categoryTable)
            .where(
              and(eq(categoryTable.id, id), eq(categoryTable.userId, userId)),
            )
            .returning({ id: categoryTable.id }),
          'category.delete',
        )
        return {
          success: true as const,
          movedToCategoryId: targetId,
          promotedCategoryIds: children.map((child) => child.id),
        }
      })
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION))
        throw new ORPCError('CONFLICT', {
          message:
            'A promoted subcategory conflicts with an existing main category',
        })
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in deleteCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to delete category',
        cause: error,
      })
    }
  })

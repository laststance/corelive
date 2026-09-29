/**
 * Category Procedures
 *
 * oRPC procedures for managing user categories.
 * Provides list, create, update, and delete operations with authentication.
 *
 * @module server/procedures/category
 *
 * @example
 * // Client usage
 * const { categories } = await orpcClient.category.list()
 * await orpcClient.category.create({ name: 'Work', color: 'blue' })
 * await orpcClient.category.update({ id: 1, data: { name: 'Personal' } })
 * await orpcClient.category.delete({ id: 1 })
 */
import { ORPCError } from '@orpc/server'
import { and, asc, eq } from 'drizzle-orm'
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

/**
 * Reads one account's categories, oldest first, with their open-todo counts. Called by {@link listCategories} before and (when empty) after the default seed.
 * @param userId - Owner whose categories to read.
 * @returns The account's categories in creation order; `[]` for a brand-new account.
 * @example
 * await readCategoriesWithCounts(1) // => [{ id: 3, name: 'General', _count: { todos: 0 }, ... }]
 */
async function readCategoriesWithCounts(
  userId: User['id'],
): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      category: categoryTable,
      // Correlated subquery: open (not completed) todos per category, for the sidebar badge.
      openTodoCount: db.$count(
        todoTable,
        and(
          eq(todoTable.categoryId, categoryTable.id),
          eq(todoTable.completed, false),
        ),
      ),
    })
    .from(categoryTable)
    .where(eq(categoryTable.userId, userId))
    // `id` breaks createdAt ties so the order is deterministic.
    .orderBy(asc(categoryTable.createdAt), asc(categoryTable.id))

  const categories = rows.map(({ category, openTodoCount }) => ({
    ...category,
    _count: { todos: openTodoCount },
  }))

  // The column is plain text; cast to satisfy the enum-typed output schema
  return categories as CategoryWithCount[]
}

/**
 * Loads a category by id, but only when the caller owns it — the permission check shared by update and delete.
 * @param userId - Authenticated owner.
 * @param categoryId - Category to load.
 * @returns The category row, or `undefined` when it does not exist or belongs to someone else.
 * @example
 * await findOwnedCategory(1, 3) // => { id: 3, name: 'Work', userId: 1, ... }
 */
async function findOwnedCategory(userId: User['id'], categoryId: number) {
  const [category] = await db
    .select()
    .from(categoryTable)
    .where(
      and(eq(categoryTable.id, categoryId), eq(categoryTable.userId, userId)),
    )
    .limit(1)
  return category
}

/**
 * Seeds the default "General" category for an account that has none. New accounts get it from the auth middleware's create, so this is the repair path for accounts made before that (and for a category deleted down to zero) — without it the editor opens locked on "No categories". Called by {@link listCategories} when its read comes back empty.
 * @param userId - Owner of the missing default.
 * @returns Nothing; a concurrent webhook insert of the same name is treated as success.
 * @example
 * await ensureDefaultCategory(user.id)
 */
async function ensureDefaultCategory(userId: User['id']): Promise<void> {
  try {
    await db.insert(categoryTable).values({ ...DEFAULT_CATEGORY_SEED, userId })
  } catch (error) {
    // Unique violation = the webhook inserted "General" between our read and this
    // write (unique index on name + userId) — that row is exactly what we wanted.
    if (isPgError(error, PG_UNIQUE_VIOLATION)) return
    throw error
  }
}

/**
 * List all categories for the authenticated user with todo counts. An account
 * with no categories yet gets its default "General" seeded on the way, so a
 * first sign-in from `/write` (or the Electron panel) always has somewhere to write.
 *
 * @returns Array of categories with _count.todos for sidebar badge display
 *
 * @example
 * // Returns categories with counts
 * { categories: [{ id: 1, name: 'Work', color: 'blue', _count: { todos: 3 } }, ...] }
 */
export const listCategories = authMiddleware
  .output(CategoryListResponseSchema)
  .handler(async ({ context }) => {
    try {
      const { user } = context

      const categories = await readCategoriesWithCounts(user.id)
      if (categories.length > 0) {
        return { categories }
      }

      // Brand-new (or webhook-less) account: seed the default, then re-read so
      // the response carries the real row id and count shape.
      await ensureDefaultCategory(user.id)
      return { categories: await readCategoriesWithCounts(user.id) }
    } catch (error) {
      log.error({ error }, 'Error in listCategories')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch categories',
        cause: error,
      })
    }
  })

/**
 * Create a new category for the authenticated user.
 *
 * @param input.name - Category display name (1-30 chars, unique per user)
 * @param input.color - One of 6 predefined colors (default: 'blue')
 * @returns The newly created category
 */
export const createCategory = authMiddleware
  .input(CreateCategorySchema)
  .output(CategorySchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context

      const category = requireRow(
        await db
          .insert(categoryTable)
          .values({
            name: input.name,
            color: input.color,
            userId: user.id,
          })
          .returning(),
        'category.insert',
      )

      // The column is plain text; cast to satisfy the enum-typed output schema
      return category as Category
    } catch (error) {
      // Unique violation on (name, userId): the user already has this category name
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ORPCError('CONFLICT', {
          message: `Category "${input.name}" already exists`,
        })
      }
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in createCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create category',
        cause: error,
      })
    }
  })

/**
 * Update an existing category.
 * Only provided fields are updated; others retain their current values.
 *
 * @param input.id - Category ID to update
 * @param input.data - Partial category fields to update
 * @returns The updated category
 */
export const updateCategory = authMiddleware
  .input(
    z.object({
      id: z.number().int().positive(),
      data: UpdateCategorySchema,
    }),
  )
  .output(CategorySchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context
      const { id, data } = input

      // Permission check
      const existing = await findOwnedCategory(user.id, id)

      if (!existing) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Category not found',
        })
      }

      // The default is always "General"; recoloring and a same-name save stay allowed
      if (
        existing.isDefault &&
        data.name !== undefined &&
        data.name !== existing.name
      ) {
        throw new ORPCError('FORBIDDEN', {
          message: "The default category can't be renamed",
        })
      }

      // `requireRow` makes an update of a missing row fail loudly: a row deleted between the
      // permission check and this update aborts into the generic 500 below.
      const category = requireRow(
        await db
          .update(categoryTable)
          .set(data)
          .where(eq(categoryTable.id, id))
          .returning(),
        'category.update',
      )

      // The column is plain text; cast to satisfy the enum-typed output schema
      return category as Category
    } catch (error) {
      // Unique violation on rename: another category already has this name
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ORPCError('CONFLICT', {
          message: `Category "${input.data.name ?? 'unknown'}" already exists`,
        })
      }
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in updateCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to update category',
        cause: error,
      })
    }
  })

/**
 * Delete a category. Tasks in this category are reassigned to the user's default (General) category.
 * The default category itself cannot be deleted.
 *
 * @param input.id - Category ID to delete
 * @returns Success status
 */
export const deleteCategory = authMiddleware
  .input(z.object({ id: z.number().int().positive() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    try {
      const { user } = context
      const { id } = input

      // Permission check
      const existing = await findOwnedCategory(user.id, id)

      if (!existing) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Category not found',
        })
      }

      // Block deletion of default category
      if (existing.isDefault) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Cannot delete the default category',
        })
      }

      // Find user's default category to reassign todos
      const [defaultCategory] = await db
        .select()
        .from(categoryTable)
        .where(
          and(
            eq(categoryTable.userId, user.id),
            eq(categoryTable.isDefault, true),
          ),
        )
        .limit(1)

      // Reassign todos to default category, then delete
      await db.transaction(async (tx) => {
        if (defaultCategory) {
          await tx
            .update(todoTable)
            .set({ categoryId: defaultCategory.id })
            .where(eq(todoTable.categoryId, id))
          await tx
            .update(completedTable)
            .set({ categoryId: defaultCategory.id })
            .where(eq(completedTable.categoryId, id))
        }
        // `requireRow` makes a delete of a missing row fail loudly: a vanished row rolls the reassignment back.
        requireRow(
          await tx
            .delete(categoryTable)
            .where(eq(categoryTable.id, id))
            .returning({ id: categoryTable.id }),
          'category.delete',
        )
      })

      return { success: true }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in deleteCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to delete category',
        cause: error,
      })
    }
  })

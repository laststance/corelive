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
import { Prisma, type User } from '@prisma/client'
import { z } from 'zod'

import { createModuleLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

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
  const categories = await prisma.category.findMany({
    where: { userId },
    include: {
      _count: {
        select: { todos: { where: { completed: false } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Prisma returns color as string; cast to satisfy the enum-typed output schema
  return categories as CategoryWithCount[]
}

/**
 * Seeds the default "General" category for an account that has none — the auth middleware creates the user row lazily when the Clerk webhook was missed or has not arrived yet, and without this the editor opens locked on "No categories". Called by {@link listCategories} when its read comes back empty.
 * @param userId - Owner of the missing default.
 * @returns Nothing; a concurrent webhook insert of the same name is treated as success.
 * @example
 * await ensureDefaultCategory(user.id)
 */
async function ensureDefaultCategory(userId: User['id']): Promise<void> {
  try {
    await prisma.category.create({
      data: { ...DEFAULT_CATEGORY_SEED, userId },
    })
  } catch (error) {
    // Prisma P2002 = the webhook inserted "General" between our read and this
    // write (@@unique([name, userId])) — that row is exactly what we wanted.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return
    }
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

      const category = await prisma.category.create({
        data: {
          name: input.name,
          color: input.color,
          userId: user.id,
        },
      })

      // Prisma returns color as string; cast to satisfy the enum-typed output schema
      return category as Category
    } catch (error) {
      // Prisma P2002 = unique constraint violation (@@unique([name, userId]))
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
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
      const existing = await prisma.category.findFirst({
        where: { id, userId: user.id },
      })

      if (!existing) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Category not found',
        })
      }

      const category = await prisma.category.update({
        where: { id },
        data,
      })

      // Prisma returns color as string; cast to satisfy the enum-typed output schema
      return category as Category
    } catch (error) {
      // Prisma P2002 = unique constraint violation on rename
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
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
      const existing = await prisma.category.findFirst({
        where: { id, userId: user.id },
      })

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
      const defaultCategory = await prisma.category.findFirst({
        where: { userId: user.id, isDefault: true },
      })

      // Reassign todos to default category, then delete
      await prisma.$transaction(async (tx) => {
        if (defaultCategory) {
          await tx.todo.updateMany({
            where: { categoryId: id },
            data: { categoryId: defaultCategory.id },
          })
          await tx.completed.updateMany({
            where: { categoryId: id },
            data: { categoryId: defaultCategory.id },
          })
        }
        await tx.category.delete({ where: { id } })
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

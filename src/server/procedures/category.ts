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
  UpdateCategorySchema,
} from '../schemas/category'

const log = createModuleLogger('category')

/**
 * List all categories for the authenticated user with todo counts.
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

      const [categories, uncategorizedCount] = await Promise.all([
        prisma.category.findMany({
          where: { userId: user.id },
          include: {
            _count: {
              select: { todos: { where: { completed: false } } },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.todo.count({
          where: { userId: user.id, completed: false, categoryId: null },
        }),
      ])

      // Prisma returns color as string; cast to satisfy the enum-typed output schema
      return {
        categories: categories as CategoryWithCount[],
        uncategorizedCount,
      }
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
 * Delete a category. Tasks in this category become uncategorized (categoryId: null).
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

      // Both Todo.categoryId and Completed.categoryId use onDelete: SetNull,
      // so PostgreSQL automatically nullifies references when the category is removed.
      await prisma.category.delete({
        where: { id },
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

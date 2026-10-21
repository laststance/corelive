/**
 * Category Schema
 *
 * Zod schemas for validating category data used in oRPC procedures.
 * Categories allow users to organize their todos by color-coded groups.
 *
 * @module server/schemas/category
 */
import {
  CategoryColorSchema,
  CategorySchema,
} from '@corelive/desktop-contract/category'
import { z } from 'zod'

export {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_SEED,
  CategorySchema,
  type Category,
  type CategoryColor,
} from '@corelive/desktop-contract/category'

/**
 * Schema for creating a new category.
 * @param name - Category display name (1-30 chars)
 * @param color - One of the predefined color options (defaults to 'blue')
 */
export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(30),
  color: CategoryColorSchema.optional(),
  parentId: z.number().int().positive().nullable().optional(),
})

/**
 * Schema for updating an existing category.
 * All fields are optional for partial updates.
 */
export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  parentId: z.number().int().positive().nullable().optional(),
  color: CategoryColorSchema.optional(),
})

/**
 * Category with todo count, returned from the list endpoint.
 */
const CategoryWithCountSchema = CategorySchema.extend({
  recordCount: z.number().int().min(0),
  _count: z.object({
    todos: z.number().int().min(0),
  }),
})

export type CategoryWithCount = z.infer<typeof CategoryWithCountSchema>

/**
 * Response schema for the list categories endpoint.
 */
export const CategoryListResponseSchema = z.object({
  categories: z.array(CategoryWithCountSchema),
})

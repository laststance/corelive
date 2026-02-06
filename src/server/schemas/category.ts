/**
 * Category Schema
 *
 * Zod schemas for validating category data used in oRPC procedures.
 * Categories allow users to organize their todos by color-coded groups.
 *
 * @module server/schemas/category
 */
import { z } from 'zod'

/** Predefined color options for categories */
export const CATEGORY_COLORS = [
  'blue',
  'green',
  'amber',
  'rose',
  'violet',
  'orange',
] as const

export const CategoryColorSchema = z.enum(CATEGORY_COLORS)

export type CategoryColor = z.infer<typeof CategoryColorSchema>

/**
 * Schema for Category database model.
 * Validates the complete category object returned from the database.
 */
export const CategorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(30),
  color: CategoryColorSchema,
  userId: z.number().int().positive(),
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

export type Category = z.infer<typeof CategorySchema>

/**
 * Schema for creating a new category.
 * @param name - Category display name (1-30 chars)
 * @param color - One of the predefined color options (defaults to 'blue')
 */
export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(30),
  color: CategoryColorSchema.default('blue'),
})

/**
 * Schema for updating an existing category.
 * All fields are optional for partial updates.
 */
export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(30).optional(),
  color: CategoryColorSchema.optional(),
})

/**
 * Category with todo count, returned from the list endpoint.
 */
export const CategoryWithCountSchema = CategorySchema.extend({
  _count: z.object({
    todos: z.number().int().min(0),
  }),
})

export type CategoryWithCount = z.infer<typeof CategoryWithCountSchema>

/**
 * Response schema for the list categories endpoint.
 * Includes uncategorizedCount for computing the total "All" badge.
 */
export const CategoryListResponseSchema = z.object({
  categories: z.array(CategoryWithCountSchema),
  uncategorizedCount: z.number().int().min(0),
})

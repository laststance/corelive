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
 * Every account's first category. The Clerk webhook seeds it on `user.created`,
 * and `listCategories` re-seeds it for an account the auth middleware created
 * without one (webhook missed or not yet delivered), so no signed-in editor
 * ever opens locked on "No categories".
 */
export const DEFAULT_CATEGORY_SEED = {
  name: 'General',
  color: 'blue',
  isDefault: true,
  parentId: null,
} as const satisfies {
  name: string
  color: CategoryColor
  isDefault: boolean
  parentId: null
}

/**
 * Schema for Category database model.
 * Validates the complete category object returned from the database.
 */
export const CategorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(30),
  color: CategoryColorSchema,
  isDefault: z.boolean(),
  parentId: z.number().int().positive().nullable(),
  userId: z.number().int().positive(),
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

export type Category = z.infer<typeof CategorySchema>

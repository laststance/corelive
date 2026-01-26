import { z } from 'zod'

export const TodoSchema = z.object({
  id: z.number().int().positive(),
  text: z.string().min(1, 'Please enter a task'),
  completed: z.boolean(),
  notes: z.string().optional().nullable(),
  order: z.number().int().min(0).optional().nullable(),
  userId: z.number().int().positive(),
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

export const CreateTodoSchema = TodoSchema.pick({
  text: true,
  notes: true,
})

export const UpdateTodoSchema = TodoSchema.pick({
  text: true,
  notes: true,
  completed: true,
}).partial()

export const TodoListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
  completed: z.boolean().optional(),
})

export const TodoResponseSchema = z.object({
  todos: z.array(TodoSchema),
  total: z.number().int().min(0),
  hasMore: z.boolean(),
  nextOffset: z.number().int().min(0).optional(),
})

/**
 * Schema for reordering todos via drag-and-drop.
 * Accepts an array of {id, order} pairs to batch update sort order.
 */
export const ReorderTodosSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      order: z.number().int().min(0),
    }),
  ),
})

import { z } from 'zod'

import { MAX_IMPORT_LINES_PER_BATCH } from '@/lib/constants/import'

export const TodoSchema = z.object({
  id: z.number().int().positive(),
  text: z
    .string()
    .min(1, 'Please enter a task')
    .max(255, 'Todo text is too long (255 char max)'),
  completed: z.boolean(),
  notes: z.string().optional().nullable(),
  order: z.number().int().min(0).optional().nullable(),
  categoryId: z.number().int().positive(),
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
  categoryId: true,
})

export const UpdateTodoSchema = TodoSchema.pick({
  text: true,
  notes: true,
  completed: true,
  categoryId: true,
}).partial()

export const TodoListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
  completed: z.boolean().optional(),
  categoryId: z.number().int().positive().optional(),
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

/**
 * A single item in a paste-import batch destined for the active Todo zone.
 *
 * `title` mirrors the parser/Completed item shape; the procedure maps it to
 * `Todo.text`. `categoryId` is optional (server resolves the get-or-create
 * default when omitted). No `completedAt` — the Todo-zone date-override waits
 * for the separate `Todo.completedAt` migration; imported todos are incomplete.
 *
 * @example
 * { title: 'write the spec' }
 * @example
 * { title: 'review PR', categoryId: 3 }
 */
export const CreateManyTodoItemSchema = z.object({
  title: z.string().min(1).max(255),
  categoryId: z.number().int().positive().optional(),
})

/**
 * Input schema for `todo.createMany` (paste-import → active Todo zone).
 * `items` bounded by `MAX_IMPORT_LINES_PER_BATCH`; `importBatchId` is the
 * client-generated, globally unique idempotency key.
 *
 * @example
 * { items: [{ title: 'a' }, { title: 'b' }], importBatchId: 'e4f5…' }
 */
export const CreateManyTodoSchema = z.object({
  items: z
    .array(CreateManyTodoItemSchema)
    .min(1)
    .max(MAX_IMPORT_LINES_PER_BATCH),
  importBatchId: z.string().min(1),
})

/**
 * Output schema for `todo.createMany`. `count` is rows resolved; `idempotent`
 * is `true` when the batch id already existed (P2002 no-op).
 *
 * @example
 * { count: 50, idempotent: false }
 * @example
 * { count: 50, idempotent: true }
 */
export const CreateManyTodoResponseSchema = z.object({
  count: z.number().int().min(0),
  idempotent: z.boolean(),
})

/**
 * Input schema for `todo.deleteMany` (bulk undo of a paste batch).
 * @example
 * { importBatchId: 'e4f5…' }
 */
export const DeleteManyTodoSchema = z.object({
  importBatchId: z.string().min(1),
})

/**
 * Output schema for `todo.deleteMany`. `count` is rows removed (0 after the
 * undo window expires).
 * @example
 * { count: 50 }
 */
export const DeleteManyTodoResponseSchema = z.object({
  count: z.number().int().min(0),
})

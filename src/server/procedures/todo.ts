import { ORPCError } from '@orpc/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { normalizeCompletedTitle } from '@/components/braindump/braindumpUtils'
import { COMPLETED_UNDO_WINDOW_MS } from '@/lib/constants/import'
import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  TodoSchema,
  CreateTodoSchema,
  CreateManyTodoResponseSchema,
  CreateManyTodoSchema,
  DeleteManyTodoResponseSchema,
  DeleteManyTodoSchema,
  UpdateTodoSchema,
  TodoListSchema,
  TodoResponseSchema,
  ReorderTodosSchema,
} from '../schemas/todo'
import { archiveCompletedTodos } from '../utils/archiveCompletedTodos'
import { resolveImportCategoryIds } from '../utils/resolveImportCategoryIds'

// Fetch todo list
export const listTodos = authMiddleware
  .input(TodoListSchema)
  .output(TodoResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { limit, offset, completed, categoryId } = input
      const { user } = context

      const where = {
        userId: user.id,
        ...(completed !== undefined && { completed }),
        ...(categoryId !== undefined && { categoryId }),
      }

      const [todos, total] = await Promise.all([
        prisma.todo.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        }),
        prisma.todo.count({ where }),
      ])

      const hasMore = offset + todos.length < total

      return {
        todos,
        total,
        hasMore,
        nextOffset: hasMore ? offset + limit : undefined,
      }
    } catch (error) {
      log.error('Error in listTodos:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch todos',
        cause: error,
      })
    }
  })

/**
 * Create a new todo for the authenticated user.
 *
 * @param input.text - Todo text (1-255 chars)
 * @param input.notes - Optional notes
 * @param input.categoryId - Category to assign (required, must belong to the user)
 * @returns The newly created todo
 */
export const createTodo = authMiddleware
  .input(CreateTodoSchema)
  .output(TodoSchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context
      const { categoryId } = input

      // Verify category ownership
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: user.id },
      })
      if (!category) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Category not found',
        })
      }

      const todo = await prisma.todo.create({
        data: {
          text: input.text,
          notes: input.notes,
          categoryId,
          userId: user.id,
        },
      })

      return todo
    } catch (error) {
      if (error instanceof ORPCError) throw error
      log.error('Error in createTodo:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create todo',
        cause: error,
      })
    }
  })

// Update todo
// Note: Accepts negative IDs for optimistic update support (temp IDs use -Date.now())
export const updateTodo = authMiddleware
  .input(
    z.object({
      id: z.number().int(),
      data: UpdateTodoSchema,
    }),
  )
  .output(TodoSchema.nullable())
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id, data } = input

    // Negative IDs are temporary optimistic IDs - return null silently
    // The client's onSettled will invalidate and sync with actual server state
    if (id < 0) {
      return null
    }

    // Permission check
    const existingTodo = await prisma.todo.findFirst({
      where: { id, userId: user.id },
    })

    if (!existingTodo) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Todo not found',
      })
    }

    const todo = await prisma.todo.update({
      where: { id },
      data,
    })

    return todo
  })

// Delete todo
// Note: Accepts negative IDs for optimistic update support (temp IDs use -Date.now())
export const deleteTodo = authMiddleware
  .input(z.object({ id: z.number().int() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id } = input

    // Negative IDs are temporary optimistic IDs - return success silently
    // The client's onSettled will invalidate and sync with actual server state
    if (id < 0) {
      return { success: true }
    }

    // Permission check
    const existingTodo = await prisma.todo.findFirst({
      where: { id, userId: user.id },
    })

    if (!existingTodo) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Todo not found',
      })
    }

    if (existingTodo.completed) {
      // A completed todo feeds the heatmap, so it is ARCHIVED (copied into
      // Completed with archived:false) before removal rather than hard-deleted —
      // otherwise deleting one completed item silently erases its heatmap day.
      // Same shared, heatmap-safe semantic as clearCompleted.
      await prisma.$transaction(async (tx) =>
        archiveCompletedTodos({ tx, userId: user.id, todoIds: [id] }),
      )
    } else {
      // Pending todos carry no heatmap day, so a plain delete loses nothing.
      await prisma.todo.delete({
        where: { id },
      })
    }

    return { success: true }
  })

// Toggle todo completion status
// Note: Accepts negative IDs for optimistic update support (temp IDs use -Date.now())
export const toggleTodo = authMiddleware
  .input(z.object({ id: z.number().int() }))
  .output(TodoSchema.nullable())
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id } = input

    // Negative IDs are temporary optimistic IDs - return null silently
    // The client's onSettled will invalidate and sync with actual server state
    if (id < 0) {
      return null
    }

    // Permission check
    const existingTodo = await prisma.todo.findFirst({
      where: { id, userId: user.id },
    })

    if (!existingTodo) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Todo not found',
      })
    }

    // When toggling completed → incomplete, also clean up any NodeAssignment
    // rows so the user can't exploit: complete → assign → un-complete →
    // re-complete → assign to a different node for double XP. The assignTask
    // completed check alone isn't enough — the stale assignment would survive
    // the un-complete and still grant XP until the todo is re-assigned.
    // Wrapped in a transaction so an orphaned assignment can't linger if the
    // toggle succeeds but the cleanup fails.
    const nextCompleted = !existingTodo.completed
    const todo = await prisma.$transaction(async (tx) => {
      if (existingTodo.completed && !nextCompleted) {
        await tx.nodeAssignment.deleteMany({ where: { todoId: id } })
      }
      return tx.todo.update({
        where: { id },
        // Stamp the stable completion day on every false→true transition so the
        // heatmap buckets by completedAt, not the edit-drifting updatedAt. Left
        // untouched on un-complete: nothing reads completedAt on a
        // completed:false row (the heatmap filters completed:true), and the next
        // completion overwrites it with a fresh now().
        data: {
          completed: nextCompleted,
          ...(nextCompleted && { completedAt: new Date() }),
        },
      })
    })

    return todo
  })

// Delete all completed todos
export const clearCompleted = authMiddleware
  .output(z.object({ deletedCount: z.number().int().min(0) }))
  .handler(async ({ context }) => {
    const { user } = context

    // Archive-and-remove instead of hard delete: completed Todo rows feed the
    // heatmap directly, so deleting them erased their days. The shared helper
    // copies each completion into Completed (archived:false) before removing the
    // Todo, inside one transaction, so the heatmap day survives the clear.
    const deletedCount = await prisma.$transaction(async (tx) =>
      archiveCompletedTodos({ tx, userId: user.id }),
    )

    return { deletedCount }
  })

/**
 * Reorder todos by updating their order field.
 * Used for drag-and-drop reordering functionality.
 * Accepts an array of {id, order} pairs and batch updates in a transaction.
 */
export const reorderTodos = authMiddleware
  .input(ReorderTodosSchema)
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { user } = context
    const { items } = input

    if (items.length === 0) {
      return { success: true }
    }

    // Verify ownership of all todos
    const todoIds = items.map((item) => item.id)
    const existingTodos = await prisma.todo.findMany({
      where: {
        id: { in: todoIds },
        userId: user.id,
      },
      select: { id: true },
    })

    const existingIds = new Set(existingTodos.map((t) => t.id))
    const unauthorizedIds = todoIds.filter((id) => !existingIds.has(id))

    if (unauthorizedIds.length > 0) {
      throw new ORPCError('NOT_FOUND', {
        message: `Todos not found: ${unauthorizedIds.join(', ')}`,
      })
    }

    // Batch update order values in a transaction
    // Note: Don't use async here - $transaction expects PrismaPromise[], not Promise[]
    await prisma.$transaction(
      // eslint-disable-next-line @typescript-eslint/promise-function-async -- PrismaPromise is not a regular Promise
      items.map((item) =>
        prisma.todo.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    )

    return { success: true }
  })

/**
 * Bulk-inserts paste-imported rows into the active Todo zone for the
 * authenticated user (incomplete tasks — bulk entry, NOT the heatmap-fill
 * moment). Triggered by the PR2 paste-import dialog's confirm on a Todo
 * surface. Idempotent via `importBatchId`: resubmitting the same batch is a
 * no-op that returns the already-inserted count.
 *
 * No dedup — uniqueness is on the batch id only, never on task text. Order is
 * assigned sequentially from `(current max order) + 1` so the paste keeps its
 * internal order AND lands after existing todos (best-effort: pre-existing
 * null-order rows sort NULLS LAST in Postgres).
 *
 * @param input.items - 1..1000 items `{ title, categoryId? }`
 * @param input.importBatchId - Client-generated globally-unique batch id
 * @returns
 * - `{ count, idempotent: false }` on a fresh insert
 * - `{ count, idempotent: true }` when the batch id already existed (no-op)
 * @throws ORPCError('BAD_REQUEST') when every line normalizes to empty
 * @throws ORPCError('NOT_FOUND') when a provided categoryId is not owned
 * @example
 * createManyTodo({ items: [{ title: 'ship' }, { title: 'ship' }], importBatchId: 'e4f5…' })
 * // => { count: 2, idempotent: false } (repetition preserved)
 */
export const createManyTodo = authMiddleware
  .input(CreateManyTodoSchema)
  .output(CreateManyTodoResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context
      const { items, importBatchId } = input

      // Normalize text and drop lines that become empty (Zod .min(1) does not
      // reject a whitespace-only title), so inserted count == preview count.
      const normalizedItems = items
        .map((item) => ({
          text: normalizeCompletedTitle(item.title),
          categoryId: item.categoryId,
        }))
        .filter((item) => item.text.length > 0)

      if (normalizedItems.length === 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'No importable lines after normalization',
        })
      }

      // Resolve categories before the transaction so the only in-tx P2002
      // source is the ImportBatch guard insert.
      const resolveCategoryId = await resolveImportCategoryIds(
        user.id,
        normalizedItems,
      )

      // Imports land last: start ordering at (current max) + 1 and increment
      // per item so the paste keeps its own order.
      const maxOrderAggregate = await prisma.todo.aggregate({
        where: { userId: user.id },
        _max: { order: true },
      })
      const nextOrderStart = (maxOrderAggregate._max.order ?? -1) + 1

      const rows = normalizedItems.map((item, index) => ({
        text: item.text,
        completed: false,
        categoryId: resolveCategoryId(item),
        userId: user.id,
        order: nextOrderStart + index,
        importBatchId,
      }))

      // ImportBatch guard insert + createMany in one transaction. A failed
      // createMany rolls back the guard so a genuine retry still inserts.
      const result = await prisma.$transaction(async (tx) => {
        await tx.importBatch.create({
          data: { id: importBatchId, userId: user.id },
        })
        const created = await tx.todo.createMany({ data: rows })
        return { count: created.count, idempotent: false }
      })

      return result
    } catch (error) {
      // P2002 on the ImportBatch insert = this batch id was already imported.
      // Idempotent no-op (caught OUTSIDE the tx — a failed statement aborts the
      // PG transaction). Re-query the prior count and return it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const count = await prisma.todo.count({
          where: {
            userId: context.user.id,
            importBatchId: input.importBatchId,
          },
        })
        return { count, idempotent: true }
      }
      if (error instanceof ORPCError) throw error
      log.error('Error in createManyTodo:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to import todos',
        cause: error,
      })
    }
  })

/**
 * Bulk-undoes a paste-import batch by deleting every Todo row tagged with the
 * given `importBatchId`, scoped to the caller and guarded by
 * {@link COMPLETED_UNDO_WINDOW_MS} (parity with `completed.deleteMany`).
 * Triggered by PR2's Todo "Undo import" within 60 s of the import.
 *
 * Atomic single-statement delete: ownership + freshness are in the `where` so a
 * concurrent undo cannot double-delete. Deletes by `importBatchId` (never by
 * ids); the window keys off `createdAt` (the real insert time).
 *
 * @param input.importBatchId - The batch id used at import time
 * @returns `{ count }` — rows removed (0 once the window has expired)
 * @example
 * deleteManyTodo({ importBatchId: 'e4f5…' }) // => { count: 50 }
 */
export const deleteManyTodo = authMiddleware
  .input(DeleteManyTodoSchema)
  .output(DeleteManyTodoResponseSchema)
  .handler(async ({ input, context }) => {
    const { user } = context
    const { importBatchId } = input

    const result = await prisma.todo.deleteMany({
      where: {
        userId: user.id,
        importBatchId,
        createdAt: {
          gte: new Date(Date.now() - COMPLETED_UNDO_WINDOW_MS),
        },
      },
    })

    return { count: result.count }
  })

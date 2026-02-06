import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  TodoSchema,
  CreateTodoSchema,
  UpdateTodoSchema,
  TodoListSchema,
  TodoResponseSchema,
  ReorderTodosSchema,
} from '../schemas/todo'

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

// Create todo
export const createTodo = authMiddleware
  .input(CreateTodoSchema)
  .output(TodoSchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context

      // Verify category ownership if provided
      if (input.categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: input.categoryId, userId: user.id },
        })
        if (!category) {
          throw new ORPCError('NOT_FOUND', {
            message: 'Category not found',
          })
        }
      }

      const todo = await prisma.todo.create({
        data: {
          text: input.text,
          notes: input.notes,
          categoryId: input.categoryId,
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

    await prisma.todo.delete({
      where: { id },
    })

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

    const todo = await prisma.todo.update({
      where: { id },
      data: { completed: !existingTodo.completed },
    })

    return todo
  })

// Delete all completed todos
export const clearCompleted = authMiddleware
  .output(z.object({ deletedCount: z.number().int().min(0) }))
  .handler(async ({ context }) => {
    const { user } = context

    const result = await prisma.todo.deleteMany({
      where: {
        userId: user.id,
        completed: true,
      },
    })

    return { deletedCount: result.count }
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

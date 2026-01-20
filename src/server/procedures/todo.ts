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
} from '../schemas/todo'

// Fetch todo list
export const listTodos = authMiddleware
  .input(TodoListSchema)
  .output(TodoResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const { limit, offset, completed } = input
      const { user } = context

      const where = {
        userId: user.id,
        ...(completed !== undefined && { completed }),
      }

      const [todos, total] = await Promise.all([
        prisma.todo.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
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

      const todo = await prisma.todo.create({
        data: {
          text: input.text,
          notes: input.notes,
          userId: user.id,
        },
      })

      return todo
    } catch (error) {
      // TODO: Use Logger Library
      log.error('Error in createTodo:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create todo',
        cause: error,
      })
    }
  })

// Update todo
export const updateTodo = authMiddleware
  .input(
    z.object({
      id: z.number().int().positive(),
      data: UpdateTodoSchema,
    }),
  )
  .output(TodoSchema)
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id, data } = input

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
export const deleteTodo = authMiddleware
  .input(z.object({ id: z.number().int().positive() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id } = input

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
export const toggleTodo = authMiddleware
  .input(z.object({ id: z.number().int().positive() }))
  .output(TodoSchema)
  .handler(async ({ input, context }) => {
    const { user } = context
    const { id } = input

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

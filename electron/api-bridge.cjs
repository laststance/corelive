const { PrismaClient } = require('@prisma/client')

const { log } = require('../src/lib/logger.cjs')

class APIBridge {
  constructor() {
    this.prisma = new PrismaClient()
    this.currentUserId = null
    this.currentClerkId = null
  }

  async initialize() {
    try {
      await this.prisma.$connect()
    } catch (error) {
      log.error('❌ Database connection failed:', error)
      throw error
    }
  }

  async disconnect() {
    await this.prisma.$disconnect()
  }

  // Ensure an active user is set before performing operations
  ensureActiveUser() {
    if (this.currentUserId === null) {
      throw new Error('Active user not set for Electron API bridge')
    }
    return this.currentUserId
  }

  // Update active user based on Clerk ID
  async setUserByClerkId(clerkId) {
    if (!clerkId || typeof clerkId !== 'string') {
      throw new Error('Invalid Clerk user ID')
    }

    const user = await this.prisma.user.upsert({
      where: { clerkId },
      update: {},
      create: {
        clerkId,
      },
    })

    this.currentUserId = user.id
    this.currentClerkId = clerkId
    return user
  }

  clearActiveUser() {
    this.currentUserId = null
    this.currentClerkId = null
  }

  parseTodoId(id) {
    if (typeof id === 'number' && Number.isInteger(id)) {
      return id
    }

    const numericId = Number.parseInt(id, 10)
    if (Number.isNaN(numericId)) {
      throw new Error('Invalid todo ID')
    }
    return numericId
  }

  // Todo operations
  async listTodos(options = {}) {
    const userId = this.ensureActiveUser()

    const { completed, limit = 100, offset = 0 } = options || {}

    const where = {
      userId,
      ...(typeof completed === 'boolean' && { completed }),
    }

    try {
      const [todos, total] = await Promise.all([
        this.prisma.todo.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        this.prisma.todo.count({ where }),
      ])

      const hasMore = offset + todos.length < total

      return {
        todos,
        total,
        hasMore,
        nextOffset: hasMore ? offset + limit : undefined,
      }
    } catch (error) {
      log.error('Failed to get todos:', error)

      // Check if it's a connection error
      if (error.code === 'P1001' || error.message.includes('connection')) {
        throw new Error(
          'Database connection failed. Please check your database connection.',
        )
      }

      // Check if it's an authentication error
      if (error.code === 'P1002') {
        throw new Error(
          'Database authentication failed. Please check your credentials.',
        )
      }

      throw new Error(`Database operation failed: ${error.message}`)
    }
  }

  async getTodoById(id) {
    const userId = this.ensureActiveUser()
    const todoId = this.parseTodoId(id)

    try {
      const todo = await this.prisma.todo.findUnique({
        where: {
          id: todoId,
          userId,
        },
      })
      return todo
    } catch (error) {
      log.error('Failed to get todo by ID:', error)

      if (error.code === 'P1001' || error.message.includes('connection')) {
        throw new Error(
          'Database connection failed. Please check your database connection.',
        )
      }

      throw new Error(`Failed to retrieve todo: ${error.message}`)
    }
  }

  async createTodo(data) {
    const userId = this.ensureActiveUser()

    if (!data || typeof data !== 'object' || !data.text) {
      throw new Error('Invalid todo data')
    }

    try {
      const todo = await this.prisma.todo.create({
        data: {
          text: data.text,
          notes: data.notes ?? null,
          completed: false,
          userId,
        },
      })
      return todo
    } catch (error) {
      log.error('Failed to create todo:', error)

      if (error.code === 'P1001' || error.message.includes('connection')) {
        throw new Error('Database connection failed. Cannot create todo.')
      }

      if (error.code === 'P2002') {
        throw new Error('A todo with this title already exists.')
      }

      throw new Error(`Failed to create todo: ${error.message}`)
    }
  }

  async updateTodo(id, data) {
    const userId = this.ensureActiveUser()
    const todoId = this.parseTodoId(id)

    try {
      const todo = await this.prisma.todo.update({
        where: {
          id: todoId,
          userId,
        },
        data: {
          ...(data.text !== undefined && { text: data.text }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.completed !== undefined && { completed: data.completed }),
        },
      })
      return todo
    } catch (error) {
      log.error('Failed to update todo:', error)

      if (error.code === 'P1001' || error.message.includes('connection')) {
        throw new Error('Database connection failed. Cannot update todo.')
      }

      if (error.code === 'P2025') {
        throw new Error(
          'Todo not found or you do not have permission to update it.',
        )
      }

      throw new Error(`Failed to update todo: ${error.message}`)
    }
  }

  async deleteTodo(id) {
    const userId = this.ensureActiveUser()
    const todoId = this.parseTodoId(id)

    try {
      await this.prisma.todo.delete({
        where: {
          id: todoId,
          userId,
        },
      })
      return { success: true }
    } catch (error) {
      log.error('Failed to delete todo:', error)

      if (error.code === 'P1001' || error.message.includes('connection')) {
        throw new Error('Database connection failed. Cannot delete todo.')
      }

      if (error.code === 'P2025') {
        throw new Error(
          'Todo not found or you do not have permission to delete it.',
        )
      }

      throw new Error(`Failed to delete todo: ${error.message}`)
    }
  }

  async clearCompleted() {
    const userId = this.ensureActiveUser()

    try {
      const result = await this.prisma.todo.deleteMany({
        where: {
          userId,
          completed: true,
        },
      })
      return { deletedCount: result.count }
    } catch (error) {
      log.error('Failed to clear completed todos:', error)
      throw error
    }
  }

  async toggleTodo(id) {
    const userId = this.ensureActiveUser()
    const todoId = this.parseTodoId(id)

    try {
      const existing = await this.prisma.todo.findFirst({
        where: {
          id: todoId,
          userId,
        },
      })

      if (!existing) {
        throw new Error('Todo not found')
      }

      return this.prisma.todo.update({
        where: {
          id: todoId,
          userId,
        },
        data: {
          completed: !existing.completed,
        },
      })
    } catch (error) {
      log.error('Failed to toggle todo completion:', error)
      throw error
    }
  }
}

module.exports = { APIBridge }

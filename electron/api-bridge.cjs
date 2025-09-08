const { PrismaClient } = require('@prisma/client')

const { log } = require('../src/lib/logger.cjs')

class APIBridge {
  constructor() {
    this.prisma = new PrismaClient()
    this.currentUserId = 'electron-user' // Default user for Electron
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

  // Set the current user ID (for authentication)
  setUserId(userId) {
    this.currentUserId = userId
  }

  // Todo operations
  async getTodos() {
    try {
      const todos = await this.prisma.todo.findMany({
        where: {
          userId: this.currentUserId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
      return todos
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
    try {
      const todo = await this.prisma.todo.findUnique({
        where: {
          id: id,
          userId: this.currentUserId,
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
    try {
      const todo = await this.prisma.todo.create({
        data: {
          title: data.title,
          completed: false,
          userId: this.currentUserId,
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
    try {
      const todo = await this.prisma.todo.update({
        where: {
          id: id,
          userId: this.currentUserId,
        },
        data: {
          ...(data.title !== undefined && { title: data.title }),
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
    try {
      await this.prisma.todo.delete({
        where: {
          id: id,
          userId: this.currentUserId,
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
    try {
      const result = await this.prisma.todo.deleteMany({
        where: {
          userId: this.currentUserId,
          completed: true,
        },
      })
      return { deletedCount: result.count }
    } catch (error) {
      log.error('Failed to clear completed todos:', error)
      throw error
    }
  }
}

module.exports = { APIBridge }

const { PrismaClient } = require('@prisma/client')

class APIBridge {
  constructor() {
    this.prisma = new PrismaClient()
    this.currentUserId = 'electron-user' // Default user for Electron
  }

  async initialize() {
    try {
      await this.prisma.$connect()
      console.log('✅ Database connected successfully')
    } catch (error) {
      console.error('❌ Database connection failed:', error)
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
      console.error('Failed to get todos:', error)
      throw error
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
      console.error('Failed to create todo:', error)
      throw error
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
      console.error('Failed to update todo:', error)
      throw error
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
      console.error('Failed to delete todo:', error)
      throw error
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
      console.error('Failed to clear completed todos:', error)
      throw error
    }
  }
}

module.exports = { APIBridge }

/**
 * @fileoverview API Bridge for Electron Main Process
 * 
 * This module provides a secure bridge between the Electron main process
 * and the database. In Electron's security model, only the main process
 * should have direct database access.
 * 
 * Architecture:
 * - Renderer (web page) → IPC → Main Process → APIBridge → Database
 * - Never expose database credentials to renderer
 * - All queries run in main process
 * - Results sanitized before sending to renderer
 * 
 * Why is this bridge necessary?
 * - Security: Renderer processes are untrusted (can run user content)
 * - Architecture: Keeps database logic centralized
 * - Performance: Connection pooling in main process
 * - Type safety: Single source of truth for data operations
 * 
 * User context:
 * - Tracks current user via Clerk ID
 * - All operations scoped to current user
 * - Prevents cross-user data access
 * 
 * @module electron/api-bridge
 */

const { PrismaClient } = require('@prisma/client')

const { log } = require('../src/lib/logger.cjs')

/**
 * Manages database operations from the Electron main process.
 * 
 * Key responsibilities:
 * - Database connection management
 * - User context tracking
 * - CRUD operations for todos
 * - Data validation and sanitization
 * - Error handling and logging
 * 
 * Security principles:
 * - Never trust renderer input
 * - Always validate IDs and data
 * - Scope all queries to current user
 * - Sanitize errors before sending to renderer
 */
class APIBridge {
  constructor() {
    // Prisma client for database operations
    this.prisma = new PrismaClient()
    
    // Track current user context
    this.currentUserId = null    // Internal database ID
    this.currentClerkId = null   // Clerk authentication ID
  }

  /**
   * Initializes database connection.
   * 
   * Must be called during app startup before any database operations.
   * Connection failures are critical - app cannot function without database.
   * 
   * @throws {Error} If database connection fails
   */
  async initialize() {
    try {
      await this.prisma.$connect()
      log.info('✅ Database connected successfully')
    } catch (error) {
      log.error('❌ Database connection failed:', error)
      throw error  // Let app decide how to handle
    }
  }

  /**
   * Closes database connection gracefully.
   * 
   * Should be called during app shutdown to:
   * - Release database connections
   * - Flush pending writes
   * - Prevent connection leaks
   */
  async disconnect() {
    await this.prisma.$disconnect()
    log.info('Database disconnected')
  }

  /**
   * Ensures a user is authenticated before database operations.
   * 
   * Security guard that prevents:
   * - Unauthenticated access
   * - Operations without user context
   * - Cross-user data access
   * 
   * @returns {number} The current user's database ID
   * @throws {Error} If no user is authenticated
   */
  ensureActiveUser() {
    if (this.currentUserId === null) {
      throw new Error('Active user not set for Electron API bridge')
    }
    return this.currentUserId
  }

  /**
   * Sets the active user context from Clerk authentication.
   * 
   * Creates user record if needed (upsert operation).
   * This bridges Clerk (web auth) with our database.
   * 
   * Flow:
   * 1. User signs in via Clerk in renderer
   * 2. Clerk ID sent to main process
   * 3. This method creates/updates database user
   * 4. All subsequent operations use this context
   * 
   * @param {string} clerkId - Clerk user identifier
   * @returns {Promise<User>} The user record
   * @throws {Error} If clerkId is invalid
   */
  async setUserByClerkId(clerkId) {
    // Validate input
    if (!clerkId || typeof clerkId !== 'string') {
      throw new Error('Invalid Clerk user ID')
    }

    // Create or update user record
    const user = await this.prisma.user.upsert({
      where: { clerkId },
      update: {},  // No updates needed, just ensure exists
      create: {
        clerkId,   // Minimal user creation
      },
    })

    // Set context for future operations
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

  /**
   * Lists todos for the current user with pagination.
   * 
   * Features:
   * - Automatic user scoping (security)
   * - Optional filtering by completion status
   * - Pagination support for large lists
   * - Total count for UI pagination
   * 
   * @param {Object} options - Query options
   * @param {boolean} [options.completed] - Filter by completion status
   * @param {number} [options.limit=100] - Maximum results to return
   * @param {number} [options.offset=0] - Skip this many results
   * @returns {Promise<Object>} Paginated todo results
   */
  async listTodos(options = {}) {
    // Ensure user is authenticated
    const userId = this.ensureActiveUser()

    // Extract and validate options
    const { completed, limit = 100, offset = 0 } = options || {}

    // Build query filter - always scoped to user
    const where = {
      userId,  // Critical: prevent cross-user access
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

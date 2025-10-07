const fs = require('fs').promises
const path = require('path')

const { app } = require('electron')

const { log } = require('../src/lib/logger.cjs')

/**
 * IPC Error Handler with retry logic, graceful degradation, and error reporting
 */
class IPCErrorHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3
    this.baseDelay = options.baseDelay || 1000 // 1 second
    this.maxDelay = options.maxDelay || 10000 // 10 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2
    this.enableLogging = options.enableLogging !== false
    this.logPath = options.logPath || path.join(app.getPath('userData'), 'logs')

    // Error statistics
    this.stats = {
      totalErrors: 0,
      retriedOperations: 0,
      failedOperations: 0,
      degradedOperations: 0,
      lastError: null,
      errorsByType: {},
      errorsByChannel: {},
    }

    // Initialize logging directory
    this.initializeLogging()
  }

  async initializeLogging() {
    if (!this.enableLogging) return

    try {
      await fs.mkdir(this.logPath, { recursive: true })
    } catch (error) {
      log.error('Failed to create logs directory:', error)
    }
  }

  /**
   * Execute IPC operation with retry logic and error handling
   */
  async executeWithRetry(operation, context = {}) {
    const { channel, operationType = 'unknown', fallbackValue = null } = context
    let lastError = null
    let attempt = 0

    while (attempt <= this.maxRetries) {
      try {
        const result = await operation()

        // Log successful retry if this wasn't the first attempt
        if (attempt > 0) {
          this.logInfo(`Operation succeeded after ${attempt} retries`, {
            channel,
            operationType,
            attempt,
          })
          this.stats.retriedOperations++
        }

        return result
      } catch (error) {
        lastError = error
        attempt++

        this.recordError(error, { channel, operationType, attempt })

        // If we've exhausted retries, break
        if (attempt > this.maxRetries) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1),
          this.maxDelay,
        )

        this.logWarning(
          `Operation failed, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
          {
            channel,
            operationType,
            error: error.message,
            delay,
          },
        )

        // Wait before retry
        await this.sleep(delay)
      }
    }

    // All retries exhausted, handle graceful degradation
    this.stats.failedOperations++
    return this.handleGracefulDegradation(lastError, context, fallbackValue)
  }

  /**
   * Handle graceful degradation when all retries fail
   */
  handleGracefulDegradation(error, context, fallbackValue) {
    const { channel, operationType, enableDegradation = true } = context

    this.logError(
      'Operation failed after all retries, attempting graceful degradation',
      {
        channel,
        operationType,
        error: error.message,
        enableDegradation,
      },
    )

    if (!enableDegradation) {
      throw error
    }

    this.stats.degradedOperations++

    // Return appropriate fallback based on operation type
    switch (operationType) {
      case 'getTodos':
        return []
      case 'createTodo':
      case 'updateTodo':
        return null
      case 'deleteTodo':
        return { success: false, error: error.message }
      case 'getConfig':
        return fallbackValue
      case 'notification':
        return false
      case 'windowOperation':
        return false
      default:
        return fallbackValue
    }
  }

  /**
   * Wrap IPC handler with error handling
   */
  wrapHandler(handler, context = {}) {
    return async (...args) => {
      return this.executeWithRetry(() => handler(...args), context)
    }
  }

  /**
   * Validate IPC input data
   */
  validateInput(data, schema) {
    try {
      if (!schema) return { isValid: true, data }

      // Basic validation based on schema
      if (schema.required && !data) {
        throw new Error('Required data is missing')
      }

      if (schema.type && typeof data !== schema.type) {
        throw new Error(`Expected ${schema.type}, got ${typeof data}`)
      }

      if (schema.properties && typeof data === 'object') {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (propSchema.required && !(key in data)) {
            throw new Error(`Required property '${key}' is missing`)
          }
        }
      }

      return { isValid: true, data }
    } catch (error) {
      return { isValid: false, error: error.message }
    }
  }

  /**
   * Record error for statistics and logging
   */
  recordError(error, context = {}) {
    this.stats.totalErrors++
    this.stats.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
      context,
    }

    // Track errors by type
    const errorType = error.constructor.name
    this.stats.errorsByType[errorType] =
      (this.stats.errorsByType[errorType] || 0) + 1

    // Track errors by channel
    if (context.channel) {
      this.stats.errorsByChannel[context.channel] =
        (this.stats.errorsByChannel[context.channel] || 0) + 1
    }

    this.logError('IPC operation failed', {
      error: error.message,
      stack: error.stack,
      ...context,
    })
  }

  /**
   * Get error statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.calculateSuccessRate(),
      mostCommonErrors: this.getMostCommonErrors(),
      problematicChannels: this.getProblematicChannels(),
    }
  }

  calculateSuccessRate() {
    const totalOperations =
      this.stats.totalErrors +
      this.stats.retriedOperations +
      this.stats.failedOperations
    if (totalOperations === 0) return 100

    const successfulOperations = totalOperations - this.stats.failedOperations
    return Math.round((successfulOperations / totalOperations) * 100)
  }

  getMostCommonErrors() {
    return Object.entries(this.stats.errorsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))
  }

  getProblematicChannels() {
    return Object.entries(this.stats.errorsByChannel)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([channel, count]) => ({ channel, count }))
  }

  /**
   * Reset error statistics
   */
  resetStats() {
    this.stats = {
      totalErrors: 0,
      retriedOperations: 0,
      failedOperations: 0,
      degradedOperations: 0,
      lastError: null,
      errorsByType: {},
      errorsByChannel: {},
    }
  }

  /**
   * Logging methods
   */
  async logError(message, data = {}) {
    const logEntry = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      data,
    }

    log.error({ data }, `[IPC Error] ${message}`)

    if (this.enableLogging) {
      await this.writeLogFile('error', logEntry)
    }
  }

  async logWarning(message, data = {}) {
    const logEntry = {
      level: 'WARNING',
      timestamp: new Date().toISOString(),
      message,
      data,
    }

    log.warn({ data }, `[IPC Warning] ${message}`)

    if (this.enableLogging) {
      await this.writeLogFile('warning', logEntry)
    }
  }

  async logInfo(message, data = {}) {
    const logEntry = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      data,
    }

    log.info({ data }, `[IPC Info] ${message}`)

    if (this.enableLogging) {
      await this.writeLogFile('info', logEntry)
    }
  }

  async writeLogFile(level, logEntry) {
    try {
      const date = new Date().toISOString().split('T')[0]
      const logFile = path.join(this.logPath, `ipc-${level}-${date}.log`)
      const logLine = JSON.stringify(logEntry) + '\n'

      await fs.appendFile(logFile, logLine)
    } catch (error) {
      log.error('Failed to write log file:', error)
    }
  }

  /**
   * Utility method for sleep/delay
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Health check for IPC system
   */
  async healthCheck() {
    const stats = this.getStats()
    const isHealthy = stats.successRate >= 95 && stats.totalErrors < 100

    return {
      isHealthy,
      stats,
      recommendations: this.getHealthRecommendations(stats),
    }
  }

  getHealthRecommendations(stats) {
    const recommendations = []

    if (stats.successRate < 95) {
      recommendations.push(
        'Success rate is below 95%. Consider investigating common error patterns.',
      )
    }

    if (stats.totalErrors > 50) {
      recommendations.push(
        'High error count detected. Review error logs for patterns.',
      )
    }

    if (stats.problematicChannels.length > 0) {
      recommendations.push(
        `Problematic channels detected: ${stats.problematicChannels.map((c) => c.channel).join(', ')}`,
      )
    }

    if (recommendations.length === 0) {
      recommendations.push('IPC system is operating normally.')
    }

    return recommendations
  }

  /**
   * Cleanup method
   */
  cleanup() {
    // Reset stats and clear any pending operations
    this.resetStats()
  }
}

module.exports = IPCErrorHandler

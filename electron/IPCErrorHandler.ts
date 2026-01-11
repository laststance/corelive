/**
 * @fileoverview IPC Error Handler with Retry Logic and Graceful Degradation
 *
 * Ensures reliable Inter-Process Communication in Electron applications.
 *
 * Why IPC error handling is critical:
 * - IPC is the backbone of Electron apps (renderer ↔ main communication)
 * - Network-like failures can occur even locally
 * - Renderer crashes don't kill main process
 * - Race conditions during startup/shutdown
 * - Memory pressure can delay responses
 *
 * Common IPC failures:
 * - Renderer process crash/reload
 * - Main process busy/blocked
 * - Large payload serialization issues
 * - Handler not registered yet
 * - Timeout on long operations
 *
 * This handler provides:
 * - Automatic retry with exponential backoff
 * - Graceful degradation to cached data
 * - Comprehensive error logging
 * - Statistics for monitoring
 * - Recovery strategies
 *
 * @module electron/IPCErrorHandler
 */

import { promises as fs } from 'fs'
import path from 'path'

import { app } from 'electron'

import { log } from './logger'

// ============================================================================
// Type Definitions
// ============================================================================

/** Options for IPCErrorHandler constructor */
export interface IPCErrorHandlerOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number
  /** Initial retry delay in milliseconds */
  baseDelay?: number
  /** Maximum retry delay in milliseconds */
  maxDelay?: number
  /** Multiplier for exponential backoff */
  backoffMultiplier?: number
  /** Enable logging to file */
  enableLogging?: boolean
  /** Path to log directory */
  logPath?: string
}

/** Context for IPC operations */
export interface IPCOperationContext {
  /** IPC channel name */
  channel?: string
  /** Type of operation */
  operationType?: string
  /** Value to return on failure */
  fallbackValue?: unknown
  /** Whether to enable graceful degradation */
  enableDegradation?: boolean
}

/** Last error information */
interface LastError {
  message: string
  timestamp: string
  context: Partial<IPCOperationContext & { attempt?: number }>
}

/** Error statistics */
export interface IPCErrorStats {
  totalErrors: number
  retriedOperations: number
  failedOperations: number
  degradedOperations: number
  lastError: LastError | null
  errorsByType: Record<string, number>
  errorsByChannel: Record<string, number>
}

/** Extended statistics with computed fields */
export interface IPCErrorStatsExtended extends IPCErrorStats {
  successRate: number
  mostCommonErrors: Array<{ type: string; count: number }>
  problematicChannels: Array<{ channel: string; count: number }>
}

/** Validation schema */
interface ValidationSchema {
  required?: boolean
  type?: string
  properties?: Record<
    string,
    {
      required?: boolean
    }
  >
}

/** Validation result */
interface ValidationResult {
  isValid: boolean
  data?: unknown
  error?: string
}

/** Health check result */
interface HealthCheckResult {
  isHealthy: boolean
  stats: IPCErrorStatsExtended
  recommendations: string[]
}

/** Log entry structure */
interface LogEntry {
  level: string
  timestamp: string
  message: string
  data: Record<string, unknown>
}

/** Operation function type */
type OperationFunction<T> = () => Promise<T>

// ============================================================================
// IPC Error Handler Class
// ============================================================================

/**
 * Handles IPC errors with retry logic and fallback strategies.
 *
 * Features:
 * - Configurable retry attempts
 * - Exponential backoff to avoid overwhelming system
 * - Graceful degradation when retries fail
 * - Error statistics and patterns
 * - Detailed error logging for debugging
 * - Input validation helpers
 *
 * @example
 * ```typescript
 * const errorHandler = new IPCErrorHandler({ maxRetries: 3 })
 *
 * const result = await errorHandler.executeWithRetry(
 *   async () => fetchData(),
 *   { channel: 'fetch-data', operationType: 'getData', fallbackValue: [] }
 * )
 * ```
 */
export class IPCErrorHandler {
  /** Maximum retry attempts */
  private maxRetries: number

  /** Initial retry delay in milliseconds */
  private baseDelay: number

  /** Maximum retry delay in milliseconds */
  private maxDelay: number

  /** Multiplier for exponential backoff */
  private backoffMultiplier: number

  /** Enable logging to file */
  private enableLogging: boolean

  /** Path to log directory */
  private logPath: string

  /** Error statistics */
  private stats: IPCErrorStats

  constructor(options: IPCErrorHandlerOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3
    this.baseDelay = options.baseDelay ?? 1000
    this.maxDelay = options.maxDelay ?? 10000
    this.backoffMultiplier = options.backoffMultiplier ?? 2

    this.enableLogging = options.enableLogging !== false
    this.logPath = options.logPath ?? path.join(app.getPath('userData'), 'logs')

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

  /**
   * Initialize logging directory.
   */
  private async initializeLogging(): Promise<void> {
    if (!this.enableLogging) return

    try {
      await fs.mkdir(this.logPath, { recursive: true })
    } catch (error) {
      log.error('Failed to create logs directory:', error)
    }
  }

  /**
   * Executes IPC operation with automatic retry and error recovery.
   *
   * Retry strategy:
   * 1. First attempt - immediate
   * 2. First retry - wait 1 second
   * 3. Second retry - wait 2 seconds
   * 4. Third retry - wait 4 seconds
   *
   * If all retries fail:
   * - Returns fallback value if provided
   * - Logs detailed error information
   * - Updates error statistics
   *
   * @param operation - The IPC operation to execute
   * @param context - Context for error handling
   * @returns Operation result or fallback value
   */
  async executeWithRetry<T>(
    operation: OperationFunction<T>,
    context: IPCOperationContext = {},
  ): Promise<T | unknown> {
    const { channel, operationType = 'unknown', fallbackValue = null } = context
    let lastError: Error | null = null
    let attempt = 0

    // Retry loop with exponential backoff
    while (attempt <= this.maxRetries) {
      try {
        const result = await operation()

        // Success! Log if we had to retry
        if (attempt > 0) {
          this.logInfo(`Operation succeeded after ${attempt} retries`, {
            channel: channel ?? '',
            operationType,
            attempt,
          })
          this.stats.retriedOperations++
        }

        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        attempt++

        this.recordError(lastError, { channel, operationType, attempt })

        // Check if we should retry
        if (attempt > this.maxRetries) {
          break // No more retries
        }

        /**
         * Exponential backoff calculation.
         * Delays: 1s, 2s, 4s, 8s (capped at maxDelay)
         *
         * Why exponential backoff?
         * - Gives system time to recover
         * - Prevents thundering herd problem
         * - Reduces resource contention
         */
        const delay = Math.min(
          this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1),
          this.maxDelay,
        )

        this.logWarning(
          `Operation failed, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
          {
            channel: channel ?? '',
            operationType,
            error: lastError.message,
            delay,
          },
        )

        // Wait before retry
        await this.sleep(delay)
      }
    }

    // All retries exhausted, handle graceful degradation
    this.stats.failedOperations++
    return this.handleGracefulDegradation(lastError!, context, fallbackValue)
  }

  /**
   * Handle graceful degradation when all retries fail.
   */
  private handleGracefulDegradation(
    error: Error,
    context: IPCOperationContext,
    fallbackValue: unknown,
  ): unknown {
    const { channel, operationType, enableDegradation = true } = context

    this.logError(
      'Operation failed after all retries, attempting graceful degradation',
      {
        channel: channel ?? '',
        operationType: operationType ?? '',
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
   * Wrap IPC handler with error handling.
   */
  wrapHandler<T extends unknown[], R>(
    handler: (...args: T) => Promise<R>,
    context: IPCOperationContext = {},
  ): (...args: T) => Promise<R | unknown> {
    return async (...args: T): Promise<R | unknown> => {
      return this.executeWithRetry(async () => handler(...args), context)
    }
  }

  /**
   * Validate IPC input data.
   */
  validateInput(data: unknown, schema?: ValidationSchema): ValidationResult {
    try {
      if (!schema) return { isValid: true, data }

      // Basic validation based on schema
      if (schema.required && !data) {
        throw new Error('Required data is missing')
      }

      if (schema.type && typeof data !== schema.type) {
        throw new Error(`Expected ${schema.type}, got ${typeof data}`)
      }

      if (schema.properties && typeof data === 'object' && data !== null) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (propSchema.required && !(key in data)) {
            throw new Error(`Required property '${key}' is missing`)
          }
        }
      }

      return { isValid: true, data }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return { isValid: false, error: errorMessage }
    }
  }

  /**
   * Record error for statistics and logging.
   */
  private recordError(
    error: Error,
    context: Partial<IPCOperationContext & { attempt?: number }> = {},
  ): void {
    this.stats.totalErrors++
    this.stats.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
      context,
    }

    // Track errors by type
    const errorType = error.constructor.name
    this.stats.errorsByType[errorType] =
      (this.stats.errorsByType[errorType] ?? 0) + 1

    // Track errors by channel
    if (context.channel) {
      this.stats.errorsByChannel[context.channel] =
        (this.stats.errorsByChannel[context.channel] ?? 0) + 1
    }

    this.logError('IPC operation failed', {
      error: error.message,
      stack: error.stack ?? '',
      ...context,
    })
  }

  /**
   * Get error statistics.
   */
  getStats(): IPCErrorStatsExtended {
    return {
      ...this.stats,
      successRate: this.calculateSuccessRate(),
      mostCommonErrors: this.getMostCommonErrors(),
      problematicChannels: this.getProblematicChannels(),
    }
  }

  /**
   * Calculate success rate.
   */
  private calculateSuccessRate(): number {
    const totalOperations =
      this.stats.totalErrors +
      this.stats.retriedOperations +
      this.stats.failedOperations
    if (totalOperations === 0) return 100

    const successfulOperations = totalOperations - this.stats.failedOperations
    return Math.round((successfulOperations / totalOperations) * 100)
  }

  /**
   * Get most common errors.
   */
  private getMostCommonErrors(): Array<{ type: string; count: number }> {
    return Object.entries(this.stats.errorsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))
  }

  /**
   * Get problematic channels.
   */
  private getProblematicChannels(): Array<{ channel: string; count: number }> {
    return Object.entries(this.stats.errorsByChannel)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([channel, count]) => ({ channel, count }))
  }

  /**
   * Reset error statistics.
   */
  resetStats(): void {
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
   * Log error message.
   */
  private async logError(
    message: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const logEntry: LogEntry = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      data,
    }

    log.error(`[IPC Error] ${message}`, { data })

    if (this.enableLogging) {
      await this.writeLogFile('error', logEntry)
    }
  }

  /**
   * Log warning message.
   */
  private async logWarning(
    message: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const logEntry: LogEntry = {
      level: 'WARNING',
      timestamp: new Date().toISOString(),
      message,
      data,
    }

    log.warn(`[IPC Warning] ${message}`, { data })

    if (this.enableLogging) {
      await this.writeLogFile('warning', logEntry)
    }
  }

  /**
   * Log info message.
   */
  private async logInfo(
    message: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const logEntry: LogEntry = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      data,
    }

    log.info(`[IPC Info] ${message}`, { data })

    if (this.enableLogging) {
      await this.writeLogFile('info', logEntry)
    }
  }

  /**
   * Write log entry to file.
   */
  private async writeLogFile(level: string, logEntry: LogEntry): Promise<void> {
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
   * Utility method for sleep/delay.
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Health check for IPC system.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const stats = this.getStats()
    const isHealthy = stats.successRate >= 95 && stats.totalErrors < 100

    return {
      isHealthy,
      stats,
      recommendations: this.getHealthRecommendations(stats),
    }
  }

  /**
   * Get health recommendations.
   */
  private getHealthRecommendations(stats: IPCErrorStatsExtended): string[] {
    const recommendations: string[] = []

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
   * Cleanup method.
   */
  cleanup(): void {
    this.resetStats()
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default IPCErrorHandler

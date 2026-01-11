/**
 * @fileoverview Logging utility for Electron main process.
 *
 * Uses pino for structured logging with conditional pretty-printing
 * in development mode. Only the main process uses pretty transport
 * to avoid SharedArrayBuffer issues in preload/renderer contexts.
 *
 * @module electron/logger
 * @example
 * ```typescript
 * import { log } from './logger'
 *
 * log.info('Application started')
 * log.error('Failed to load config:', error)
 * ```
 */

import pino, { type Logger } from 'pino'

// ============================================================================
// Environment Detection
// ============================================================================

/** Whether running in development mode */
const isDevelopment = process.env.NODE_ENV !== 'production'

/** Whether running in test environment */
const isTestEnvironment = process.env.NODE_ENV === 'test'

/**
 * Whether running in Electron main process.
 * In Electron, process.type is 'browser' for main, 'renderer' for renderer.
 */
const isMainProcess =
  (process as NodeJS.Process & { type?: string }).type === 'browser'

/**
 * Whether to use pino-pretty transport.
 *
 * Only enabled in main process during development because:
 * - pino-pretty uses thread-stream which requires SharedArrayBuffer
 * - SharedArrayBuffer requires cross-origin isolation headers
 * - Electron preload/renderer don't have these headers
 */
const shouldUsePrettyTransport =
  isDevelopment &&
  !isTestEnvironment &&
  isMainProcess &&
  process.env.DISABLE_PINO_PRETTY !== 'true'

// ============================================================================
// Logger Configuration
// ============================================================================

/**
 * Root pino logger instance.
 *
 * Configured with:
 * - Log level from LOG_LEVEL env var (default: 'info')
 * - Pretty transport in development main process only
 */
const logger: Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(shouldUsePrettyTransport
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }
    : {}),
})

/**
 * Application-specific child logger.
 * Adds 'component: corelive' to all log entries.
 */
const appLogger: Logger = logger.child({ component: 'corelive' })

// ============================================================================
// Log Interface
// ============================================================================

/**
 * Structured log interface with convenience methods.
 *
 * @example
 * ```typescript
 * log.info('User logged in', { userId: '123' })
 * log.error('Database connection failed:', error)
 * log.debug('Request payload:', payload)
 * ```
 */
export const log = {
  /**
   * Log error level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  error: (message: string, context?: unknown): void => {
    if (context !== undefined) {
      appLogger.error({ context }, message)
    } else {
      appLogger.error(message)
    }
  },

  /**
   * Log warning level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  warn: (message: string, context?: unknown): void => {
    if (context !== undefined) {
      appLogger.warn({ context }, message)
    } else {
      appLogger.warn(message)
    }
  },

  /**
   * Log info level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  info: (message: string, context?: unknown): void => {
    if (context !== undefined) {
      appLogger.info({ context }, message)
    } else {
      appLogger.info(message)
    }
  },

  /**
   * Log debug level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  debug: (message: string, context?: unknown): void => {
    if (context !== undefined) {
      appLogger.debug({ context }, message)
    } else {
      appLogger.debug(message)
    }
  },

  /**
   * Log trace level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  trace: (message: string, context?: unknown): void => {
    if (context !== undefined) {
      appLogger.trace({ context }, message)
    } else {
      appLogger.trace(message)
    }
  },
} as const

// ============================================================================
// Exports
// ============================================================================

export { logger, appLogger }
export default logger

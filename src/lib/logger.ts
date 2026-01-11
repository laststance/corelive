/**
 * Server-side Logger Module
 *
 * Provides structured logging using Pino for server-side code.
 * Uses pino-pretty in development, JSON format in production.
 *
 * @module lib/logger
 *
 * @example
 * // In Server Actions or API routes
 * import { logger, createModuleLogger } from '@/lib/logger'
 *
 * const log = createModuleLogger('electronSettings')
 * log.info({ userId: '123' }, 'Settings updated')
 * log.error({ error, userId }, 'Failed to update settings')
 */
import pino from 'pino'

/**
 * Determines if the logger should use pretty printing.
 * Uses human-readable format in development, JSON in production.
 *
 * @returns Whether to use pretty printing
 */
const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development'
}

/**
 * Creates a Pino logger instance with appropriate configuration.
 *
 * @returns Configured Pino logger
 *
 * @example
 * // Log levels available:
 * logger.debug({ data }, 'Debug message')    // Level 20
 * logger.info({ data }, 'Info message')      // Level 30
 * logger.warn({ data }, 'Warning message')   // Level 40
 * logger.error({ error }, 'Error message')   // Level 50
 * logger.fatal({ error }, 'Fatal error')     // Level 60
 */
const createLogger = (): pino.Logger => {
  return pino({
    level: isDevelopment() ? 'debug' : 'info',
    ...(isDevelopment()
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          // Production: JSON format for log aggregation
          formatters: {
            level: (label) => ({ level: label }),
          },
          timestamp: pino.stdTimeFunctions.isoTime,
        }),
  })
}

/**
 * Main logger instance for server-side code.
 *
 * @example
 * // Basic usage
 * logger.info('Server started')
 *
 * // With context object
 * logger.error({ error, userId }, 'Failed to process request')
 *
 * // Creating child logger with bound context
 * const childLogger = logger.child({ module: 'board' })
 * childLogger.info({ boardId }, 'Board loaded')
 */
export const logger = createLogger()

/**
 * Creates a child logger with module context.
 * Use this to create loggers for specific modules.
 *
 * @param module - The module name for log identification
 * @returns Child logger with module context
 *
 * @example
 * // In lib/actions/electronSettings.ts
 * const log = createModuleLogger('electronSettings')
 * log.info({ userId }, 'Settings updated')
 * // Output: { "level": "info", "module": "electronSettings", "userId": "123", "msg": "Settings updated" }
 */
export const createModuleLogger = (module: string): pino.Logger => {
  return logger.child({ module })
}

/**
 * Convenience export for backward compatibility.
 * Prefer using createModuleLogger for new code.
 *
 * @remarks
 * Pino expects either `(msg: string)` or `(obj: object, msg: string)`.
 * This wrapper merges extra args into an object context when provided.
 */
export const log = {
  error: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      logger.error({ context: args }, message)
    } else {
      logger.error(message)
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      logger.warn({ context: args }, message)
    } else {
      logger.warn(message)
    }
  },
  info: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      logger.info({ context: args }, message)
    } else {
      logger.info(message)
    }
  },
  debug: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      logger.debug({ context: args }, message)
    } else {
      logger.debug(message)
    }
  },
  trace: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      logger.trace({ context: args }, message)
    } else {
      logger.trace(message)
    }
  },
}

export default logger

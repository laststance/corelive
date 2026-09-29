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
 * // `error`, `err` and `context` pass through {@link logSerializers}: a failed query logs its
 * // SQLSTATE and constraint but never its SQL text, bound params or row detail.
 */
import pino from 'pino'

import { logSerializers } from './serializeLogError'

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
 * @param destination - Where the JSON lines go; stdout by default. Ignored in development, where the pino-pretty transport owns the output. Tests pass an in-memory stream to inspect the production configuration.
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
export const createLogger = (
  destination?: pino.DestinationStream,
): pino.Logger => {
  const development = isDevelopment()
  return pino(
    {
      level: development ? 'debug' : 'info',
      // Both branches: pino's stock serializers would log a DrizzleQueryError's SQL and bound values.
      serializers: logSerializers,
      hooks: {
        // `logger.error(err)` makes pino copy `err.message` into `msg` before any serializer runs; for a
        // failed query that message is the SQL plus every bound value. Log a lone Error under `err` with a
        // fixed message instead, so the serializer alone decides what reaches the log line.
        logMethod(args, method) {
          const [first, ...rest] = args
          if (first instanceof Error && rest.length === 0) {
            return method.call(this, { err: first }, 'Unhandled error')
          }
          return method.apply(this, args)
        },
      },
      ...(development
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
    },
    // A custom destination and a transport are mutually exclusive in pino.
    development ? undefined : destination,
  )
}

/** Backs the public {@link log} facade and {@link createModuleLogger} with one server logger.
 * @example createModuleLogger('board').info({ boardId: 1 }, 'Board loaded')
 */
const logger = createLogger()

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

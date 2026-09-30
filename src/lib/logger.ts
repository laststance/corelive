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

import { logSerializers, shapeErrorsUnderAnyKey } from './serializeLogError'

/**
 * Tells whether a log call is a bare `{ err }` object with no message of its own.
 *
 * pino titles such a line with `err.message` (its `write` copies it into `msg` when neither `msg` nor a second argument exists), and for a failed query that message is the SQL plus every bound value.
 * @param value - The first argument of a logger call.
 * @returns `true` when it is a non-Error object holding an Error under `err` and no `msg`.
 * @example
 * isBareErrObject({ err: new Error('boom') }) // => true
 * isBareErrObject({ err: new Error('boom'), msg: 'Sync failed' }) // => false
 */
function isBareErrObject(value: unknown): value is { err: Error } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Error) &&
    'err' in value &&
    value.err instanceof Error &&
    !('msg' in value)
  )
}

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
        // `logger.error(err)` and `logger.error({ err })` make pino copy `err.message` into `msg` before any
        // serializer runs; for a failed query that message is the SQL plus every bound value. Log the Error
        // under `err` with a fixed message instead, so the serializer alone decides what reaches the log line.
        logMethod(args, method) {
          const [first, ...rest] = args
          if (first instanceof Error && rest.length === 0) {
            return method.call(this, { err: first }, 'Unhandled error')
          }
          if (isBareErrObject(first) && rest.length === 0) {
            return method.call(this, first, 'Unhandled error')
          }
          return method.apply(this, args)
        },
      },
      formatters: {
        // Shapes an Error under any key, not only the keys named in `serializers`.
        log: shapeErrorsUnderAnyKey,
        // Production: level as a label for log aggregation.
        ...(development
          ? {}
          : { level: (label: string) => ({ level: label }) }),
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

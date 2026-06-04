/**
 * @fileoverview Logging utility for Electron main process.
 *
 * Uses pino for structured logging with conditional pretty-printing in
 * local development only. The pino-pretty transport runs on a worker thread
 * that cannot load from inside a packaged asar (and SharedArrayBuffer is
 * unavailable in preload/renderer), so it is gated to the dev main process —
 * see computeShouldUsePrettyTransport. Every log.* call is crash-safe via
 * safeLog so a dead transport can never take down the main process.
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

/**
 * Whether pino should attach the pino-pretty worker-thread transport.
 *
 * Pure (env + processType are passed in) so it is unit-testable across
 * environments without relying on module-load side effects.
 *
 * CRITICAL — must be true ONLY in the genuine local-dev main process.
 * pino-pretty runs on a thread-stream worker thread. In a packaged Electron
 * app that worker cannot load pino-pretty from inside the asar archive and
 * exits; every subsequent pino write then throws "the worker has exited",
 * which is uncaught in the main process and shows Electron's fatal
 * "A JavaScript error occurred" dialog (bricking the app on the first log).
 * So the gate keys on `NODE_ENV === 'development'` (set by scripts/dev.js for
 * `pnpm electron:dev`), NOT `!== 'production'`: packaged builds leave NODE_ENV
 * unset and MUST fall through to plain JSON logging. Tests (NODE_ENV ===
 * 'test') and the renderer/preload (process.type !== 'browser', where
 * SharedArrayBuffer is unavailable) are excluded for the same reason.
 *
 * @param env - Relevant process env vars (NODE_ENV, DISABLE_PINO_PRETTY)
 * @param processType - Electron process.type ('browser' in the main process)
 * @returns true only in the Electron main process during local development
 * @example
 * computeShouldUsePrettyTransport({ NODE_ENV: 'development' }, 'browser')  // => true
 * computeShouldUsePrettyTransport({ NODE_ENV: undefined }, 'browser')      // => false (packaged)
 * computeShouldUsePrettyTransport({ NODE_ENV: 'test' }, 'browser')         // => false
 * computeShouldUsePrettyTransport({ NODE_ENV: 'development' }, 'renderer') // => false
 */
export const computeShouldUsePrettyTransport = (
  env: { NODE_ENV?: string; DISABLE_PINO_PRETTY?: string },
  processType: string | undefined,
): boolean =>
  env.NODE_ENV === 'development' &&
  processType === 'browser' &&
  env.DISABLE_PINO_PRETTY !== 'true'

/** Whether this process should use the pino-pretty transport (computed once at load). */
const shouldUsePrettyTransport = computeShouldUsePrettyTransport(
  process.env,
  (process as NodeJS.Process & { type?: string }).type,
)

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

/**
 * Runs a pino logging call, swallowing any error so logging can NEVER crash the
 * app. If a pino transport worker has exited, every write throws "the worker has
 * exited"; unguarded in the Electron main process that throw is fatal (it shows
 * the "A JavaScript error occurred" dialog and even defeats a caller's
 * catch-then-log error path). Logging is best-effort telemetry — it must never
 * take down the process.
 *
 * @param write - Thunk performing the actual pino call
 * @example
 * safeLog(() => appLogger.info('started')) // logs, or silently no-ops on failure
 */
const safeLog = (write: () => void): void => {
  try {
    write()
  } catch {
    // Intentionally swallowed: there is no safe fallback sink here (the failing
    // transport may be the only one), and a logging failure must not propagate.
  }
}

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
    safeLog(() => {
      if (context !== undefined) {
        appLogger.error({ context }, message)
      } else {
        appLogger.error(message)
      }
    })
  },

  /**
   * Log warning level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  warn: (message: string, context?: unknown): void => {
    safeLog(() => {
      if (context !== undefined) {
        appLogger.warn({ context }, message)
      } else {
        appLogger.warn(message)
      }
    })
  },

  /**
   * Log info level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  info: (message: string, context?: unknown): void => {
    safeLog(() => {
      if (context !== undefined) {
        appLogger.info({ context }, message)
      } else {
        appLogger.info(message)
      }
    })
  },

  /**
   * Log debug level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  debug: (message: string, context?: unknown): void => {
    safeLog(() => {
      if (context !== undefined) {
        appLogger.debug({ context }, message)
      } else {
        appLogger.debug(message)
      }
    })
  },

  /**
   * Log trace level message.
   * @param message - Log message
   * @param context - Optional context object
   */
  trace: (message: string, context?: unknown): void => {
    safeLog(() => {
      if (context !== undefined) {
        appLogger.trace({ context }, message)
      } else {
        appLogger.trace(message)
      }
    })
  },
} as const

// ============================================================================
// Exports
// ============================================================================

export { logger, appLogger }
export default logger

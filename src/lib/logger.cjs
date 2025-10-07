const pino = require('pino')

// Determine environment and process type
const isDevelopment = process.env.NODE_ENV !== 'production'
const isTestEnvironment = process.env.NODE_ENV === 'test'
const isMainProcess = process.type === 'browser'

// In Electron preload/renderer, using pino-pretty (thread-stream) causes
// SharedArrayBuffer errors due to lack of cross-origin isolation. Only enable
// pretty transport in the Electron main process during development.
const shouldUsePrettyTransport =
  isDevelopment &&
  !isTestEnvironment &&
  isMainProcess &&
  process.env.DISABLE_PINO_PRETTY !== 'true'

// Configure Pino conditionally to avoid thread-stream in renderer/preload
const logger = pino({
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

// Create a child logger for the application
const appLogger = logger.child({ component: 'corelive' })

// Export individual log levels for convenience
const log = {
  error: (message, ...args) => appLogger.error(message, ...args),
  warn: (message, ...args) => appLogger.warn(message, ...args),
  info: (message, ...args) => appLogger.info(message, ...args),
  debug: (message, ...args) => appLogger.debug(message, ...args),
  trace: (message, ...args) => appLogger.trace(message, ...args),
}

module.exports = {
  logger,
  appLogger,
  log,
  default: logger,
}
